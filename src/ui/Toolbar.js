import { getState, setState, subscribe } from '@core/Store.js';
import { bus } from '@core/EventBus.js';

/**
 * Toolbar — top bar with back, page nav, zoom, search, sidebar toggle.
 */

export function createToolbar(container) {
  container.innerHTML = `
    <div class="toolbar">
      <div class="toolbar__left">
        <button class="btn btn--icon toolbar__btn" id="btn-back" aria-label="Back to library">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="toolbar__filename" id="toolbar-filename"></span>
      </div>

      <div class="toolbar__center">
        <button class="btn btn--icon toolbar__btn" id="btn-prev" aria-label="Previous page">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="toolbar__page-info">
          <input class="toolbar__page-input" id="page-input" type="number" min="1" aria-label="Page number">
          <span class="toolbar__page-sep">/</span>
          <span class="toolbar__page-total" id="page-total">0</span>
        </div>
        <button class="btn btn--icon toolbar__btn" id="btn-next" aria-label="Next page">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      <div class="toolbar__right">
        <button class="btn btn--icon toolbar__btn" id="btn-zoom-out" aria-label="Zoom out">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        </button>
        <button class="toolbar__zoom-label" id="zoom-label" aria-label="Fit to width">100%</button>
        <button class="btn btn--icon toolbar__btn" id="btn-zoom-in" aria-label="Zoom in">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        </button>

        <div class="toolbar__divider"></div>

        <button class="btn btn--icon toolbar__btn" id="btn-search" aria-label="Search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
        <button class="btn btn--icon toolbar__btn" id="btn-sidebar" aria-label="Sidebar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
        </button>
        <button class="btn btn--icon toolbar__btn" id="btn-theme-viewer" aria-label="Toggle theme">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        </button>
      </div>
    </div>
  `;

  const filenameEl = container.querySelector('#toolbar-filename');
  const pageInput = container.querySelector('#page-input');
  const pageTotalEl = container.querySelector('#page-total');
  const zoomLabel = container.querySelector('#zoom-label');

  // Back
  container.querySelector('#btn-back').addEventListener('click', () => bus.emit('viewer:close'));

  // Page navigation
  container.querySelector('#btn-prev').addEventListener('click', () => {
    const { currentPage } = getState();
    if (currentPage > 1) bus.emit('viewer:goto', currentPage - 1);
  });
  container.querySelector('#btn-next').addEventListener('click', () => {
    const { currentPage, pageCount } = getState();
    if (currentPage < pageCount) bus.emit('viewer:goto', currentPage + 1);
  });

  pageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const page = parseInt(pageInput.value, 10);
      const { pageCount } = getState();
      if (page >= 1 && page <= pageCount) {
        bus.emit('viewer:goto', page);
      }
      pageInput.blur();
    }
  });

  pageInput.addEventListener('blur', () => {
    pageInput.value = getState().currentPage;
  });

  // Zoom
  container.querySelector('#btn-zoom-in').addEventListener('click', () => bus.emit('viewer:zoom-in'));
  container.querySelector('#btn-zoom-out').addEventListener('click', () => bus.emit('viewer:zoom-out'));

  zoomLabel.addEventListener('click', () => {
    const { fitMode } = getState();
    // Cycle: width → page → null (manual)
    if (fitMode === 'width') bus.emit('viewer:zoom-fit', 'page');
    else if (fitMode === 'page') bus.emit('viewer:zoom-fit', null);
    else bus.emit('viewer:zoom-fit', 'width');
  });

  // Search toggle
  container.querySelector('#btn-search').addEventListener('click', () => {
    setState({ searchOpen: !getState().searchOpen });
  });

  // Sidebar toggle
  container.querySelector('#btn-sidebar').addEventListener('click', () => {
    setState({ sidebarOpen: !getState().sidebarOpen });
  });

  // Theme toggle
  container.querySelector('#btn-theme-viewer').addEventListener('click', () => {
    const current = getState().resolvedTheme;
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    setState({ theme: next, resolvedTheme: next });
    localStorage.setItem('theme', next);
  });

  // State subscriptions
  subscribe('fileName', (name) => {
    filenameEl.textContent = name || '';
  });

  subscribe('currentPage', (page) => {
    pageInput.value = page;
  });

  subscribe('pageCount', (count) => {
    pageTotalEl.textContent = count;
    pageInput.max = count;
  });

  subscribe('scale', (scale) => {
    const { fitMode } = getState();
    if (fitMode === 'width') zoomLabel.textContent = 'Width';
    else if (fitMode === 'page') zoomLabel.textContent = 'Page';
    else zoomLabel.textContent = `${Math.round(scale * 100)}%`;
  });

  subscribe('fitMode', (mode) => {
    const { scale } = getState();
    if (mode === 'width') zoomLabel.textContent = 'Width';
    else if (mode === 'page') zoomLabel.textContent = 'Page';
    else zoomLabel.textContent = `${Math.round(scale * 100)}%`;
  });
}
