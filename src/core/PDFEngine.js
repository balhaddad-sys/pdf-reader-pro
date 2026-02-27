/**
 * PDFEngine — wraps PDF.js with:
 *  - Async loading with progress
 *  - Page dimension caching (critical for virtual scroll layout)
 *  - Render-task management and cancellation
 *  - Text layer rendering for search/selection
 *  - Outline (TOC) extraction
 *  - Full-text search
 */

const pdfjsLib = window.pdfjsLib || globalThis.pdfjsLib;

// Configure worker
if (pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/lib/pdf.worker.min.js';
}

export default class PDFEngine {
  constructor() {
    this.doc = null;
    this.pageCount = 0;
    this._dimCache = new Map();
    this._textCache = new Map();
    this._activeRenders = new Map();
  }

  async load(source, onProgress) {
    this.destroy();

    const loadingTask = pdfjsLib.getDocument({
      ...(source instanceof ArrayBuffer ? { data: source } : { url: source }),
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
      cMapPacked: true,
      enableXfa: true,
    });

    if (onProgress) {
      loadingTask.onProgress = ({ loaded, total }) => {
        onProgress(total > 0 ? loaded / total : 0);
      };
    }

    this.doc = await loadingTask.promise;
    this.pageCount = this.doc.numPages;

    // Pre-cache all page dimensions — fast metadata read, no rendering
    await this._cacheAllDimensions();

    return {
      pageCount: this.pageCount,
      outline: await this.getOutline(),
    };
  }

  async _cacheAllDimensions() {
    const promises = [];
    for (let i = 1; i <= this.pageCount; i++) {
      promises.push(
        this.doc.getPage(i).then(page => {
          const vp = page.getViewport({ scale: 1 });
          this._dimCache.set(i, { width: vp.width, height: vp.height });
        })
      );
    }
    await Promise.all(promises);
  }

  getDimensions(pageNum) {
    return this._dimCache.get(pageNum) || { width: 612, height: 792 };
  }

  getAllDimensions() {
    const dims = [];
    for (let i = 1; i <= this.pageCount; i++) {
      dims.push(this._dimCache.get(i));
    }
    return dims;
  }

  /**
   * Render a page to a canvas at the given scale.
   * Returns a cancel function. Automatically cancels any prior render for this page.
   */
  async renderPage(pageNum, canvas, scale) {
    // Cancel any existing render for this page
    this.cancelRender(pageNum);

    const page = await this.doc.getPage(pageNum);
    const dpr = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: scale * dpr });

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${viewport.width / dpr}px`;
    canvas.style.height = `${viewport.height / dpr}px`;

    const ctx = canvas.getContext('2d');
    const renderTask = page.render({ canvasContext: ctx, viewport });
    this._activeRenders.set(pageNum, renderTask);

    try {
      await renderTask.promise;
    } catch (e) {
      if (e.name !== 'RenderingCancelledException') throw e;
    } finally {
      if (this._activeRenders.get(pageNum) === renderTask) {
        this._activeRenders.delete(pageNum);
      }
    }
  }

  cancelRender(pageNum) {
    const task = this._activeRenders.get(pageNum);
    if (task) {
      task.cancel();
      this._activeRenders.delete(pageNum);
    }
  }

  cancelAllRenders() {
    for (const [, task] of this._activeRenders) {
      task.cancel();
    }
    this._activeRenders.clear();
  }

  async renderTextLayer(pageNum, container, scale) {
    const page = await this.doc.getPage(pageNum);
    const dpr = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: scale * dpr });
    const textContent = await page.getTextContent();

    container.innerHTML = '';
    container.style.width = `${viewport.width / dpr}px`;
    container.style.height = `${viewport.height / dpr}px`;

    const textLayer = new pdfjsLib.renderTextLayer({
      textContentSource: textContent,
      container,
      viewport,
      textDivs: [],
    });

    // Scale text divs down to CSS size
    const cssScale = 1 / dpr;
    container.style.transform = `scale(${cssScale})`;
    container.style.transformOrigin = 'top left';

    await textLayer.promise;
    return textLayer;
  }

  async getPageText(pageNum) {
    if (this._textCache.has(pageNum)) return this._textCache.get(pageNum);
    const page = await this.doc.getPage(pageNum);
    const content = await page.getTextContent();
    const text = content.items.map(item => item.str).join(' ');
    this._textCache.set(pageNum, text);
    return text;
  }

  async searchText(query) {
    if (!query || !this.doc) return [];
    const results = [];
    const lowerQuery = query.toLowerCase();

    for (let i = 1; i <= this.pageCount; i++) {
      const text = await this.getPageText(i);
      const lower = text.toLowerCase();
      let idx = 0;
      while ((idx = lower.indexOf(lowerQuery, idx)) !== -1) {
        results.push({ page: i, index: idx });
        idx += lowerQuery.length;
      }
    }
    return results;
  }

  async getOutline() {
    if (!this.doc) return [];
    try {
      const outline = await this.doc.getOutline();
      if (!outline) return [];
      return this._processOutline(outline);
    } catch {
      return [];
    }
  }

  _processOutline(items, level = 0) {
    const result = [];
    for (const item of items) {
      result.push({
        title: item.title,
        dest: item.dest,
        level,
      });
      if (item.items && item.items.length > 0) {
        result.push(...this._processOutline(item.items, level + 1));
      }
    }
    return result;
  }

  async resolveDestination(dest) {
    if (!this.doc || !dest) return null;
    try {
      let ref;
      if (typeof dest === 'string') {
        ref = await this.doc.getDestination(dest);
      } else {
        ref = dest;
      }
      if (!ref || !ref[0]) return null;
      const pageIndex = await this.doc.getPageIndex(ref[0]);
      return pageIndex + 1;
    } catch {
      return null;
    }
  }

  async renderThumbnail(pageNum, canvas, width) {
    const page = await this.doc.getPage(pageNum);
    const vp = page.getViewport({ scale: 1 });
    const scale = width / vp.width;
    const viewport = page.getViewport({ scale });

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
  }

  destroy() {
    this.cancelAllRenders();
    if (this.doc) {
      this.doc.destroy();
      this.doc = null;
    }
    this.pageCount = 0;
    this._dimCache.clear();
    this._textCache.clear();
  }
}
