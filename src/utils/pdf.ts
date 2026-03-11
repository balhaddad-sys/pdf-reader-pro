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

const activeRenders = new WeakMap<HTMLCanvasElement, pdfjsLib.RenderTask>();

/**
 * Render a PDF page to canvas. Uses 1x DPR for speed — the invisible text
 * layer on top provides crisp text selection. After render, the result is
 * cached as an ImageBitmap so re-entering the viewport is instant.
 */
export async function renderPage(
  page: pdfjsLib.PDFPageProxy,
  canvas: HTMLCanvasElement,
  scale: number,
): Promise<void> {
  const prev = activeRenders.get(canvas);
  if (prev) prev.cancel();

  // Render at 1x — biggest single speed-up (4x fewer pixels on Retina).
  // Text remains sharp via the transparent text overlay layer.
  const viewport = page.getViewport({ scale });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;

  const ctx = canvas.getContext('2d')!;

  const task = page.render({ canvasContext: ctx, viewport });
  activeRenders.set(canvas, task);

  try {
    await task.promise;
  } catch (err) {
    if (err instanceof Error && err.message.includes('Rendering cancelled')) return;
    throw err;
  } finally {
    if (activeRenders.get(canvas) === task) activeRenders.delete(canvas);
  }

  // Cache the result as ImageBitmap for instant re-paint on scroll-back
  try {
    const bmp = await createImageBitmap(canvas);
    putCache(cacheKey(page.pageNumber, scale), bmp);
  } catch { /* non-critical */ }
}

/**
 * Paint a cached bitmap onto a canvas. Returns true if cache hit.
 */
export function paintFromCache(
  canvas: HTMLCanvasElement,
  pageNum: number,
  zoom: number,
): boolean {
  const bmp = bitmapCache.get(cacheKey(pageNum, zoom));
  if (!bmp) return false;

  canvas.width = bmp.width;
  canvas.height = bmp.height;
  canvas.style.width = `${bmp.width}px`;
  canvas.style.height = `${bmp.height}px`;

  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0);
  return true;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

export async function renderPageThumbnail(
  page: pdfjsLib.PDFPageProxy,
  maxWidth: number = 200,
): Promise<string> {
  const viewport = page.getViewport({ scale: 1 });
  const scale = maxWidth / viewport.width;
  const thumbViewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = thumbViewport.width;
  canvas.height = thumbViewport.height;

  const ctx = canvas.getContext('2d')!;
  await page.render({
    canvasContext: ctx,
    viewport: thumbViewport,
  }).promise;

  return canvas.toDataURL('image/jpeg', 0.7);
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
