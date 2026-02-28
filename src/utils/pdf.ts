import * as pdfjsLib from 'pdfjs-dist';

// Configure pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export type PDFDocumentProxy = pdfjsLib.PDFDocumentProxy;
export type PDFPageProxy = pdfjsLib.PDFPageProxy;

export async function loadPDF(data: ArrayBuffer): Promise<pdfjsLib.PDFDocumentProxy> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(data),
    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.9.155/cmaps/',
    cMapPacked: true,
    enableXfa: true,
  });
  return loadingTask.promise;
}

export async function renderPage(
  page: pdfjsLib.PDFPageProxy,
  canvas: HTMLCanvasElement,
  scale: number,
  devicePixelRatio: number = window.devicePixelRatio || 1,
): Promise<void> {
  const viewport = page.getViewport({ scale: scale * devicePixelRatio });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.style.width = `${viewport.width / devicePixelRatio}px`;
  canvas.style.height = `${viewport.height / devicePixelRatio}px`;

  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  await page.render({
    canvasContext: ctx,
    viewport,
  }).promise;
}

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
