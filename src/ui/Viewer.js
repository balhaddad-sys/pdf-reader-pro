import PDFEngine from '@core/PDFEngine.js';
import VirtualScroller from '@core/VirtualScroller.js';
import GestureHandler from '@utils/gestures.js';
import { getState, setState, subscribe } from '@core/Store.js';
import { bus } from '@core/EventBus.js';
import { saveFile, getDocuments, saveDocuments, saveReadingPosition, getReadingPosition, saveThumbnail, getBookmarks, getAnnotations } from '@utils/storage.js';
import { createToolbar } from './Toolbar.js';
import { createSidebar } from './Sidebar.js';
import { createSearchBar } from '@features/search/SearchBar.js';

const ZOOM_LEVELS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0];

export function createViewer(container) {
  const engine = new PDFEngine();
  let scroller = null;
  let gestures = null;
  let currentDocId = null;
  let _savePositionTimer = null;

  container.innerHTML = `
    <div class="viewer">
      <div class="viewer__toolbar-wrap" id="viewer-toolbar"></div>
      <div class="viewer__search-wrap" id="viewer-search" hidden></div>
      <div class="viewer__body">
        <div class="viewer__sidebar-wrap" id="viewer-sidebar"></div>
        <div class="viewer__main">
          <div class="viewer__scroll-area" id="scroll-area"></div>
        </div>
      </div>
      <div class="viewer__loading" id="viewer-loading" hidden>
        <div class="loading-overlay">
          <div class="loading-spinner"></div>
          <div class="loading-text" id="loading-text">Opening document...</div>
          <div class="loading-bar"><div class="loading-bar__fill" id="loading-fill"></div></div>
        </div>
      </div>
    </div>
  `;

  const scrollArea = container.querySelector('#scroll-area');
  const loadingEl = container.querySelector('#viewer-loading');
  const loadingText = container.querySelector('#loading-text');
  const loadingFill = container.querySelector('#loading-fill');

  // Init sub-components
  createToolbar(container.querySelector('#viewer-toolbar'));
  createSidebar(container.querySelector('#viewer-sidebar'));
  createSearchBar(container.querySelector('#viewer-search'));

  // --- Document open handler ---
  bus.on('document:open', async ({ id, buffer, name, size, isNew }) => {
    showLoading(true);
    setState({ loading: true, loadProgress: 0, fileName: name, fileSize: size });

    try {
      const result = await engine.load(buffer, (progress) => {
        setState({ loadProgress: progress });
        loadingFill.style.width = `${Math.round(progress * 100)}%`;
        loadingText.textContent = `Loading... ${Math.round(progress * 100)}%`;
      });

      currentDocId = id;
      setState({
        doc: engine.doc,
        pageCount: result.pageCount,
        currentPage: 1,
        outline: result.outline,
        bookmarks: getBookmarks(id),
        annotations: getAnnotations(id),
        loading: false,
        view: 'viewer',
      });

      // Save to library if new
      if (isNew) {
        await saveFile(id, buffer, { name, size });
        const docs = getDocuments();
        docs.unshift({ id, name, size, pageCount: result.pageCount, openedAt: Date.now() });
        saveDocuments(docs);

        // Generate thumbnail
        generateThumbnail(id);
      } else {
        // Update last-opened
        const docs = getDocuments();
        const idx = docs.findIndex(d => d.id === id);
        if (idx >= 0) {
          docs[idx].openedAt = Date.now();
          docs[idx].pageCount = result.pageCount;
          saveDocuments(docs);
        }
      }

      // Init virtual scroller
      initScroller();

      // Restore reading position
      const savedPos = getReadingPosition(id);
      if (savedPos && savedPos.page > 1) {
        setTimeout(() => scroller.scrollToPage(savedPos.page, false), 100);
      }

      showLoading(false);
    } catch (e) {
      console.error('Failed to open document:', e);
      showLoading(false);
      setState({ loading: false, view: 'library' });
      bus.emit('toast', 'Failed to open document');
    }
  });

  function initScroller() {
    if (scroller) scroller.destroy();
    if (gestures) gestures.destroy();

    scroller = new VirtualScroller(scrollArea, engine, {
      scale: getState().scale,
      fitMode: getState().fitMode,
    });
    scroller.init();

    // Gesture handling for pinch-to-zoom
    gestures = new GestureHandler(scrollArea, {
      getScale: () => getState().scale,
      onPinch: (newScale) => {
        const clamped = Math.max(0.25, Math.min(4.0, newScale));
        setState({ scale: clamped, fitMode: null });
        scroller.setScale(clamped, null);
      },
      onPinchEnd: () => {},
    });

    // Track current page from scroller
    bus.on('scroller:page', (page) => {
      const prev = getState().currentPage;
      if (page !== prev) {
        setState({ currentPage: page });
        debounceSavePosition(page);
      }
    });

    // Keyboard navigation
    document.addEventListener('keydown', handleKeyboard);
  }

  function handleKeyboard(e) {
    if (getState().view !== 'viewer') return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const { currentPage, pageCount, searchOpen } = getState();

    switch (e.key) {
      case 'ArrowLeft':
      case 'PageUp':
        if (currentPage > 1) scroller.scrollToPage(currentPage - 1);
        e.preventDefault();
        break;
      case 'ArrowRight':
      case 'PageDown':
        if (currentPage < pageCount) scroller.scrollToPage(currentPage + 1);
        e.preventDefault();
        break;
      case 'Home':
        scroller.scrollToPage(1);
        e.preventDefault();
        break;
      case 'End':
        scroller.scrollToPage(pageCount);
        e.preventDefault();
        break;
      case '+':
      case '=':
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomIn(); }
        break;
      case '-':
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomOut(); }
        break;
      case '0':
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomFit('width'); }
        break;
      case 'f':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          setState({ searchOpen: !searchOpen });
        }
        break;
      case 'Escape':
        if (searchOpen) setState({ searchOpen: false });
        if (getState().sidebarOpen) setState({ sidebarOpen: false });
        break;
    }
  }

  // Zoom controls
  bus.on('viewer:zoom-in', zoomIn);
  bus.on('viewer:zoom-out', zoomOut);
  bus.on('viewer:zoom-fit', (mode) => zoomFit(mode));
  bus.on('viewer:zoom-set', (scale) => {
    setState({ scale, fitMode: null });
    scroller?.setScale(scale, null);
  });

  function zoomIn() {
    const current = getState().scale;
    const next = ZOOM_LEVELS.find(z => z > current + 0.01) || ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
    setState({ scale: next, fitMode: null });
    scroller?.setScale(next, null);
  }

  function zoomOut() {
    const current = getState().scale;
    const next = [...ZOOM_LEVELS].reverse().find(z => z < current - 0.01) || ZOOM_LEVELS[0];
    setState({ scale: next, fitMode: null });
    scroller?.setScale(next, null);
  }

  function zoomFit(mode) {
    setState({ fitMode: mode });
    scroller?.setScale(1.0, mode);
  }

  // Navigate to page
  bus.on('viewer:goto', (page) => {
    scroller?.scrollToPage(page);
  });

  // Back to library
  bus.on('viewer:close', () => {
    if (scroller) scroller.destroy();
    if (gestures) gestures.destroy();
    engine.destroy();
    scroller = null;
    gestures = null;
    document.removeEventListener('keydown', handleKeyboard);
    setState({ view: 'library', doc: null });
    bus.emit('library:refresh');
  });

  // Save position debounced
  function debounceSavePosition(page) {
    clearTimeout(_savePositionTimer);
    _savePositionTimer = setTimeout(() => {
      if (currentDocId) {
        saveReadingPosition(currentDocId, { page, timestamp: Date.now() });
      }
    }, 500);
  }

  function showLoading(show) {
    loadingEl.hidden = !show;
  }

  async function generateThumbnail(id) {
    try {
      const canvas = document.createElement('canvas');
      await engine.renderThumbnail(1, canvas, 200);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      await saveThumbnail(id, dataUrl);
    } catch { /* non-critical */ }
  }
}
