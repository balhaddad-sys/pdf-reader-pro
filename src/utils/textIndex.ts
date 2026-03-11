/**
 * Text indexing for PDFs.
 *
 * Strategy:
 *  1. Check IndexedDB for previously-cached text
 *  2. Try pdf.js getTextContent() on first 3 pages
 *  3. If text found → index all pages via pdf.js (instant)
 *  4. If NO text (image-based) → OCR with Tesseract.js using 4 parallel workers
 *  5. Save results to IndexedDB (never re-OCR same document)
 */
import { createWorker, Worker } from 'tesseract.js';
import { saveOcrText, getOcrText } from './db';
import type { PDFDocumentProxy, PDFPageProxy } from './pdf';

// ── Cache: docId → pageNum → text ───────────────────────────────────────────

const cache = new Map<string, Map<number, string>>();

export function getPageTextCached(docId: string, page: number): string | undefined {
  return cache.get(docId)?.get(page);
}

export function clearDocumentCache(docId: string) {
  cache.delete(docId);
}

// ── Progress tracking ────────────────────────────────────────────────────────

interface IndexJob {
  cancelled: boolean;
  done: boolean;
  total: number;
  indexed: number;
  isOcr: boolean;
}

const jobs = new Map<string, IndexJob>();
const listeners = new Set<() => void>();

export function getIndexProgress(docId: string) {
  const j = jobs.get(docId);
  if (!j) return null;
  return { indexed: j.indexed, total: j.total, done: j.done, isOcr: j.isOcr };
}

export function onIndexProgress(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() { listeners.forEach(fn => fn()); }

// ── Tesseract worker pool ────────────────────────────────────────────────────

const POOL_SIZE = 4;
let pool: Worker[] = [];
let poolReady: Promise<Worker[]> | null = null;

function getPool(): Promise<Worker[]> {
  if (!poolReady) {
    poolReady = Promise.all(
      Array.from({ length: POOL_SIZE }, () => createWorker('ara+eng'))
    );
    poolReady.then(workers => { pool = workers; });
  }
  return poolReady;
}

async function ocrPageWithWorker(worker: Worker, page: PDFPageProxy): Promise<string> {
  // Scale 1.5 = fast enough, decent quality
  const scale = 1.5;
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = vp.width;
  canvas.height = vp.height;
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, viewport: vp }).promise;

  // Simple grayscale conversion (fast, helps Tesseract)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = data[i + 1] = data[i + 2] = gray;
  }
  ctx.putImageData(imageData, 0, 0);

  const { data: result } = await worker.recognize(canvas);
  return result.text;
}

// ── Detect if PDF is image-based ─────────────────────────────────────────────

async function isImageBasedPdf(pdf: PDFDocumentProxy): Promise<boolean> {
  const checkPages = Math.min(3, pdf.numPages);
  for (let i = 1; i <= checkPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const text = tc.items
      .map(item => ('str' in item ? (item as { str: string }).str : ''))
      .filter(Boolean)
      .join(' ')
      .trim();
    if (text.length > 10) return false;
  }
  return true;
}

// ── Extract text via pdf.js ──────────────────────────────────────────────────

async function extractPdfText(page: PDFPageProxy): Promise<string> {
  const tc = await page.getTextContent();
  return tc.items
    .map(item => ('str' in item ? (item as { str: string }).str : ''))
    .filter(Boolean)
    .join(' ');
}

// ── Main indexing function ───────────────────────────────────────────────────

export async function indexDocument(pdf: PDFDocumentProxy, docId: string): Promise<void> {
  // Cancel existing job
  const existing = jobs.get(docId);
  if (existing) existing.cancelled = true;

  // Already fully indexed in memory
  if (cache.get(docId)?.size === pdf.numPages) return;

  if (!cache.has(docId)) cache.set(docId, new Map());
  const docCache = cache.get(docId)!;

  // ── Check IndexedDB for previously-saved text ──────────────────────────
  try {
    const saved = await getOcrText(docId);
    if (saved) {
      const keys = Object.keys(saved);
      if (keys.length >= pdf.numPages) {
        for (const [k, v] of Object.entries(saved)) {
          docCache.set(Number(k), v);
        }
        const job: IndexJob = {
          cancelled: false, done: true,
          total: pdf.numPages, indexed: pdf.numPages, isOcr: true,
        };
        jobs.set(docId, job);
        notify();
        return;
      }
      for (const [k, v] of Object.entries(saved)) {
        docCache.set(Number(k), v);
      }
    }
  } catch { /* IndexedDB not available */ }

  // Detect if image-based
  const imageBased = await isImageBasedPdf(pdf);

  const job: IndexJob = {
    cancelled: false,
    done: false,
    total: pdf.numPages,
    indexed: docCache.size,
    isOcr: imageBased,
  };
  jobs.set(docId, job);
  notify();

  if (imageBased) {
    // ── OCR path: parallel workers ───────────────────────────────────────
    const workers = await getPool();
    if (job.cancelled) return;

    // Build list of pages that need OCR
    const todo: number[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      if (!docCache.has(i)) todo.push(i);
    }

    // Process in parallel batches
    let cursor = 0;
    while (cursor < todo.length && !job.cancelled) {
      const batch = todo.slice(cursor, cursor + workers.length);
      const promises = batch.map(async (pageNum, idx) => {
        const worker = workers[idx % workers.length];
        try {
          const page = await pdf.getPage(pageNum);
          const text = await ocrPageWithWorker(worker, page);
          docCache.set(pageNum, text);
        } catch {
          docCache.set(pageNum, '');
        }
      });

      await Promise.all(promises);
      cursor += batch.length;
      job.indexed = docCache.size;
      notify();

      // Save to IndexedDB every 20 pages
      if (cursor % 20 === 0 || cursor >= todo.length) {
        try {
          const obj: Record<number, string> = {};
          docCache.forEach((v, k) => { obj[k] = v; });
          saveOcrText(docId, obj);
        } catch { /* non-critical */ }
      }
    }

    // Final save
    if (!job.cancelled) {
      try {
        const obj: Record<number, string> = {};
        docCache.forEach((v, k) => { obj[k] = v; });
        await saveOcrText(docId, obj);
      } catch { /* non-critical */ }
    }
  } else {
    // ── Text path: fast pdf.js extraction ────────────────────────────────
    for (let i = 1; i <= pdf.numPages; i++) {
      if (job.cancelled) return;
      if (docCache.has(i)) { job.indexed = Math.max(job.indexed, i); continue; }

      try {
        const page = await pdf.getPage(i);
        const text = await extractPdfText(page);
        docCache.set(i, text);
      } catch {
        docCache.set(i, '');
      }
      job.indexed = i;
      if (i % 20 === 0) notify();
    }
  }

  job.done = true;
  notify();
}

export function cancelIndexing(docId: string) {
  const j = jobs.get(docId);
  if (j) j.cancelled = true;
}
