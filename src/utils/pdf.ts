import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export type PDFDocumentProxy = pdfjsLib.PDFDocumentProxy;
export type PDFPageProxy = pdfjsLib.PDFPageProxy;

export async function loadPDF(data: ArrayBuffer): Promise<pdfjsLib.PDFDocumentProxy> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(data),
    cMapUrl: 'cmaps/',
    cMapPacked: true,
    standardFontDataUrl: 'standard_fonts/',
    enableXfa: true,
  });
  return loadingTask.promise;
}

// ─── Bitmap cache ────────────────────────────────────────────────────────────
// LRU cache of rendered page bitmaps. When a page scrolls back into view it
// paints from cache instantly (< 1ms) instead of re-rendering via pdf.js.

const CACHE_MAX = 30;
const bitmapCache = new Map<string, ImageBitmap>();

function cacheKey(pageNum: number, zoom: number): string {
  return `${pageNum}@${zoom}`;
}

function putCache(key: string, bmp: ImageBitmap) {
  // Evict oldest entries when over limit
  if (bitmapCache.size >= CACHE_MAX) {
    const oldest = bitmapCache.keys().next().value!;
    bitmapCache.get(oldest)?.close();
    bitmapCache.delete(oldest);
  }
  bitmapCache.set(key, bmp);
}

export function getCachedBitmap(pageNum: number, zoom: number): ImageBitmap | undefined {
  return bitmapCache.get(cacheKey(pageNum, zoom));
}

/** Flush all cached bitmaps (call when document changes) */
export function clearBitmapCache() {
  bitmapCache.forEach(bmp => bmp.close());
  bitmapCache.clear();
}

// ─── Render ──────────────────────────────────────────────────────────────────

const activeRenders = new Map<HTMLCanvasElement, pdfjsLib.RenderTask>();

/**
 * Render a PDF page using double-buffering: draws to a hidden offscreen
 * canvas, then copies the result to the visible canvas in one atomic
 * `drawImage` call. The visible canvas is NEVER cleared — the user sees
 * either the old frame or the new frame, never a blank white flash.
 */
export async function renderPage(
  page: pdfjsLib.PDFPageProxy,
  canvas: HTMLCanvasElement,
  scale: number,
): Promise<void> {
  const prev = activeRenders.get(canvas);
  if (prev) prev.cancel();

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale });
  const pxW = Math.floor(viewport.width * dpr);
  const pxH = Math.floor(viewport.height * dpr);

  // ── Phase 1: render to offscreen canvas (invisible) ────────────────────
  const offscreen = document.createElement('canvas');
  offscreen.width = pxW;
  offscreen.height = pxH;

  const offCtx = offscreen.getContext('2d')!;
  offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const task = page.render({ canvasContext: offCtx, viewport });
  activeRenders.set(canvas, task);

  try {
    await task.promise;
  } catch (err) {
    if (err instanceof Error && err.message.includes('Rendering cancelled')) return;
    throw err;
  } finally {
    if (activeRenders.get(canvas) === task) activeRenders.delete(canvas);
  }

  // ── Phase 2: atomic swap — blit offscreen to visible canvas ────────────
  // Setting width/height clears the canvas, but we immediately draw over it
  // in the same synchronous block so the browser never paints the blank frame.
  canvas.width = pxW;
  canvas.height = pxH;
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;

  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(offscreen, 0, 0);

  // Cache for instant re-paint on scroll-back
  try {
    const bmp = await createImageBitmap(canvas);
    putCache(cacheKey(page.pageNumber, scale), bmp);
  } catch { /* non-critical */ }
}

/**
 * Paint a cached bitmap onto a canvas. Returns true if cache hit.
 * Uses the same atomic clear+draw pattern so no blank frame is visible.
 */
export function paintFromCache(
  canvas: HTMLCanvasElement,
  pageNum: number,
  zoom: number,
): boolean {
  const bmp = bitmapCache.get(cacheKey(pageNum, zoom));
  if (!bmp) return false;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  // Atomic: clear + draw in same synchronous block — no blank frame
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(bmp, 0, 0);

  canvas.style.width = `${Math.floor(bmp.width / dpr)}px`;
  canvas.style.height = `${Math.floor(bmp.height / dpr)}px`;

  return true;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

export async function renderPageThumbnail(
  page: pdfjsLib.PDFPageProxy,
  maxWidth: number = 200,
): Promise<string> {
  const viewport = page.getViewport({ scale: 1 });
  // Render thumbnail at higher res for crisp display on high-DPI screens
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const scale = (maxWidth * dpr) / viewport.width;
  const thumbViewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = thumbViewport.width;
  canvas.height = thumbViewport.height;

  const ctx = canvas.getContext('2d')!;
  await page.render({
    canvasContext: ctx,
    viewport: thumbViewport,
  }).promise;

  return canvas.toDataURL('image/jpeg', 0.8);
}

export async function getPageText(page: pdfjsLib.PDFPageProxy): Promise<string> {
  const textContent = await page.getTextContent();
  return textContent.items
    .map(item => ('str' in item ? (item as { str: string }).str : ''))
    .filter(Boolean)
    .join(' ');
}

export interface OutlineNode {
  title: string;
  dest: string | unknown[] | null;
  items: OutlineNode[];
}

interface RawOutlineItem {
  title: string;
  dest: string | unknown[] | null;
  items?: RawOutlineItem[];
}

export async function getOutline(
  pdf: pdfjsLib.PDFDocumentProxy,
): Promise<OutlineNode[]> {
  const outline = await pdf.getOutline();
  if (!outline) return [];

  function mapItems(items: RawOutlineItem[]): OutlineNode[] {
    return items.map(item => ({
      title: item.title,
      dest: item.dest,
      items: item.items ? mapItems(item.items) : [],
    }));
  }

  return mapItems(outline as unknown as RawOutlineItem[]);
}

export async function getDestinationPage(
  pdf: pdfjsLib.PDFDocumentProxy,
  dest: string | unknown[] | null,
): Promise<number> {
  if (!dest) return 0;

  let resolved: unknown[];
  if (typeof dest === 'string') {
    resolved = (await pdf.getDestination(dest)) as unknown[];
  } else {
    resolved = dest;
  }

  if (!resolved || !resolved[0]) return 0;

  const pageIndex = await pdf.getPageIndex(resolved[0] as { num: number; gen: number });
  return pageIndex;
}
