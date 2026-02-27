import { bus } from './EventBus.js';

/**
 * VirtualScroller — the heart of 1000+ page performance.
 *
 * Strategy:
 *  1. Pre-compute cumulative Y positions for all pages (from cached dimensions)
 *  2. Set a sentinel element to establish total scroll height
 *  3. On scroll, binary-search for visible pages
 *  4. Render only visible pages + a configurable buffer
 *  5. Recycle DOM nodes for off-screen pages (destroy canvas, free memory)
 *  6. Prioritize rendering: visible pages first, then buffer
 *  7. Debounce rapid scroll; cancel renders for pages that left viewport
 */

const PAGE_GAP = 12; // px between pages
const BUFFER_PAGES = 3; // pages above/below viewport to pre-render
const RENDER_DEBOUNCE = 30; // ms

export default class VirtualScroller {
  constructor(container, engine, opts = {}) {
    this.container = container;
    this.engine = engine;
    this.scale = opts.scale || 1.0;
    this.fitMode = opts.fitMode || 'width';
    this.pageGap = opts.pageGap || PAGE_GAP;
    this.bufferPages = opts.bufferPages || BUFFER_PAGES;

    // Layout data computed from page dimensions
    this.pagePositions = []; // { y, width, height, cssWidth, cssHeight }
    this.totalHeight = 0;
    this.effectiveScale = 1;

    // DOM
    this.contentEl = null;
    this.pageElements = new Map(); // pageNum → DOM element
    this.renderedPages = new Set(); // pages with rendered canvas
    this.visiblePages = new Set();

    // State
    this._scrollRAF = null;
    this._resizeObserver = null;
    this._renderQueue = [];
    this._rendering = false;
    this._destroyed = false;
  }

  /**
   * Initialize: compute layout, create content element, bind scroll.
   */
  init() {
    this.container.innerHTML = '';
    this.container.classList.add('vs-container');

    this.contentEl = document.createElement('div');
    this.contentEl.classList.add('vs-content');
    this.container.appendChild(this.contentEl);

    this._computeLayout();
    this._applyLayout();
    this._bindEvents();
    this._scheduleRender();
  }

  /**
   * Compute effective scale and absolute position for every page.
   */
  _computeLayout() {
    const containerWidth = this.container.clientWidth;
    const containerHeight = this.container.clientHeight;
    const dims = this.engine.getAllDimensions();
    const positions = [];

    let y = this.pageGap;

    for (let i = 0; i < dims.length; i++) {
      const { width, height } = dims[i];
      let pageScale = this.scale;

      if (this.fitMode === 'width') {
        const availW = containerWidth - 40; // 20px padding each side
        pageScale = availW / width;
      } else if (this.fitMode === 'height') {
        const availH = containerHeight - 20;
        pageScale = availH / height;
      } else if (this.fitMode === 'page') {
        const availW = containerWidth - 40;
        const availH = containerHeight - 20;
        pageScale = Math.min(availW / width, availH / height);
      }

      const cssW = width * pageScale;
      const cssH = height * pageScale;

      positions.push({
        y,
        width: width,
        height: height,
        cssWidth: cssW,
        cssHeight: cssH,
        scale: pageScale,
      });

      y += cssH + this.pageGap;
    }

    this.pagePositions = positions;
    this.totalHeight = y;
    this.effectiveScale = positions.length > 0 ? positions[0].scale : 1;
  }

  _applyLayout() {
    this.contentEl.style.height = `${this.totalHeight}px`;
    this.contentEl.style.position = 'relative';

    // Reposition any existing page elements
    for (const [pageNum, el] of this.pageElements) {
      const pos = this.pagePositions[pageNum - 1];
      if (pos) {
        el.style.top = `${pos.y}px`;
        el.style.width = `${pos.cssWidth}px`;
        el.style.height = `${pos.cssHeight}px`;
      }
    }
  }

  /**
   * Binary search to find the first page visible in the viewport.
   */
  _findFirstVisible(scrollTop) {
    let lo = 0, hi = this.pagePositions.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const pos = this.pagePositions[mid];
      if (pos.y + pos.cssHeight < scrollTop) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }

  /**
   * Determine which pages are visible and which are in the buffer zone.
   */
  getVisibleRange() {
    const scrollTop = this.container.scrollTop;
    const viewportH = this.container.clientHeight;
    const scrollBottom = scrollTop + viewportH;

    const first = this._findFirstVisible(scrollTop);

    let last = first;
    for (let i = first; i < this.pagePositions.length; i++) {
      if (this.pagePositions[i].y > scrollBottom) break;
      last = i;
    }

    // Buffer zone
    const bufferStart = Math.max(0, first - this.bufferPages);
    const bufferEnd = Math.min(this.pagePositions.length - 1, last + this.bufferPages);

    return {
      visibleStart: first,
      visibleEnd: last,
      bufferStart,
      bufferEnd,
    };
  }

  /**
   * Main render cycle — called on scroll, resize, zoom.
   */
  _scheduleRender() {
    if (this._scrollRAF) return;
    this._scrollRAF = requestAnimationFrame(() => {
      this._scrollRAF = null;
      if (this._destroyed) return;
      this._updateVisibility();
    });
  }

  _updateVisibility() {
    const range = this.getVisibleRange();
    const needed = new Set();

    // Mark visible + buffer pages as needed
    for (let i = range.bufferStart; i <= range.bufferEnd; i++) {
      needed.add(i + 1); // 1-indexed page numbers
    }

    // Track visible pages for current-page detection
    const newVisible = new Set();
    for (let i = range.visibleStart; i <= range.visibleEnd; i++) {
      newVisible.add(i + 1);
    }

    // Remove pages outside buffer
    for (const [pageNum] of this.pageElements) {
      if (!needed.has(pageNum)) {
        this._removePage(pageNum);
      }
    }

    // Create page elements for needed pages
    const toRender = [];
    for (const pageNum of needed) {
      if (!this.pageElements.has(pageNum)) {
        this._createPageElement(pageNum);
      }
      if (!this.renderedPages.has(pageNum)) {
        toRender.push(pageNum);
      }
    }

    // Prioritize: visible pages first, then buffer (sorted by distance to center)
    const scrollCenter = this.container.scrollTop + this.container.clientHeight / 2;
    toRender.sort((a, b) => {
      const aVis = newVisible.has(a) ? 0 : 1;
      const bVis = newVisible.has(b) ? 0 : 1;
      if (aVis !== bVis) return aVis - bVis;
      const aDist = Math.abs(this.pagePositions[a - 1].y - scrollCenter);
      const bDist = Math.abs(this.pagePositions[b - 1].y - scrollCenter);
      return aDist - bDist;
    });

    // Queue renders
    this._renderQueue = toRender;
    this._processRenderQueue();

    // Emit current page change
    if (newVisible.size > 0) {
      const prevVisible = this.visiblePages;
      this.visiblePages = newVisible;

      // Current page = first visible page with most area showing
      const currentPage = this._detectCurrentPage();
      bus.emit('scroller:page', currentPage);
    }
  }

  _detectCurrentPage() {
    const scrollTop = this.container.scrollTop;
    const viewportMid = scrollTop + this.container.clientHeight * 0.3;

    for (let i = 0; i < this.pagePositions.length; i++) {
      const pos = this.pagePositions[i];
      if (pos.y + pos.cssHeight > viewportMid) {
        return i + 1;
      }
    }
    return this.engine.pageCount;
  }

  async _processRenderQueue() {
    if (this._rendering || this._destroyed) return;
    this._rendering = true;

    while (this._renderQueue.length > 0) {
      const pageNum = this._renderQueue.shift();

      // Skip if page was removed while waiting
      const el = this.pageElements.get(pageNum);
      if (!el || this.renderedPages.has(pageNum)) continue;

      const canvas = el.querySelector('canvas');
      if (!canvas) continue;

      const pos = this.pagePositions[pageNum - 1];
      try {
        await this.engine.renderPage(pageNum, canvas, pos.scale);
        this.renderedPages.add(pageNum);
        el.classList.add('vs-page--rendered');

        // Render text layer for selection/search
        const textEl = el.querySelector('.vs-text-layer');
        if (textEl) {
          this.engine.renderTextLayer(pageNum, textEl, pos.scale).catch(() => {});
        }
      } catch (e) {
        if (e.name !== 'RenderingCancelledException') {
          console.warn(`[VirtualScroller] Render failed for page ${pageNum}:`, e);
        }
      }
    }

    this._rendering = false;
  }

  _createPageElement(pageNum) {
    const pos = this.pagePositions[pageNum - 1];
    if (!pos) return;

    const el = document.createElement('div');
    el.classList.add('vs-page');
    el.dataset.page = pageNum;
    el.style.position = 'absolute';
    el.style.left = '50%';
    el.style.transform = 'translateX(-50%)';
    el.style.top = `${pos.y}px`;
    el.style.width = `${pos.cssWidth}px`;
    el.style.height = `${pos.cssHeight}px`;

    const canvas = document.createElement('canvas');
    canvas.classList.add('vs-canvas');
    el.appendChild(canvas);

    const textLayer = document.createElement('div');
    textLayer.classList.add('vs-text-layer');
    el.appendChild(textLayer);

    // Page number indicator
    const label = document.createElement('div');
    label.classList.add('vs-page-label');
    label.textContent = pageNum;
    el.appendChild(label);

    this.contentEl.appendChild(el);
    this.pageElements.set(pageNum, el);
  }

  _removePage(pageNum) {
    const el = this.pageElements.get(pageNum);
    if (el) {
      // Cancel any ongoing render
      this.engine.cancelRender(pageNum);

      // Clear canvas to free GPU memory
      const canvas = el.querySelector('canvas');
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }

      el.remove();
      this.pageElements.delete(pageNum);
      this.renderedPages.delete(pageNum);
    }
  }

  /**
   * Scroll to a specific page.
   */
  scrollToPage(pageNum, smooth = true) {
    const pos = this.pagePositions[pageNum - 1];
    if (!pos) return;
    this.container.scrollTo({
      top: pos.y - 8,
      behavior: smooth ? 'smooth' : 'instant',
    });
  }

  /**
   * Update scale and re-layout everything.
   */
  setScale(newScale, fitMode = null) {
    // Save scroll position as a page fraction
    const scrollFraction = this._getScrollFraction();

    this.scale = newScale;
    this.fitMode = fitMode;

    // Cancel all renders, remove all pages
    this.engine.cancelAllRenders();
    for (const [pageNum] of this.pageElements) {
      this._removePage(pageNum);
    }
    this.renderedPages.clear();
    this._renderQueue = [];

    // Recompute layout
    this._computeLayout();
    this._applyLayout();

    // Restore scroll position
    this._restoreScrollFraction(scrollFraction);

    // Render visible pages
    this._scheduleRender();
  }

  _getScrollFraction() {
    const scrollTop = this.container.scrollTop;
    if (this.totalHeight <= 0) return 0;
    return scrollTop / this.totalHeight;
  }

  _restoreScrollFraction(fraction) {
    this.container.scrollTop = fraction * this.totalHeight;
  }

  _bindEvents() {
    // Scroll handler — throttled via rAF
    this._onScroll = () => this._scheduleRender();
    this.container.addEventListener('scroll', this._onScroll, { passive: true });

    // Resize observer
    this._resizeObserver = new ResizeObserver(() => {
      this._computeLayout();
      this._applyLayout();
      this._scheduleRender();
    });
    this._resizeObserver.observe(this.container);
  }

  /**
   * Force re-render of all visible pages (e.g., after theme change).
   */
  refresh() {
    this.renderedPages.clear();
    for (const [, el] of this.pageElements) {
      el.classList.remove('vs-page--rendered');
    }
    this._scheduleRender();
  }

  destroy() {
    this._destroyed = true;
    if (this._scrollRAF) cancelAnimationFrame(this._scrollRAF);
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this._onScroll) {
      this.container.removeEventListener('scroll', this._onScroll);
    }

    this.engine.cancelAllRenders();
    for (const [pageNum] of this.pageElements) {
      this._removePage(pageNum);
    }
    this.pageElements.clear();
    this.renderedPages.clear();
    this._renderQueue = [];

    if (this.contentEl) {
      this.contentEl.remove();
      this.contentEl = null;
    }
  }
}
