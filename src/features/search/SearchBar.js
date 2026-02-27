import { getState, setState, subscribe } from '@core/Store.js';
import { bus } from '@core/EventBus.js';

/**
 * Search bar — appears below toolbar, full-text search across all pages.
 */

export function createSearchBar(container) {
  container.innerHTML = `
    <div class="search-bar">
      <div class="search-bar__input-wrap">
        <svg class="search-bar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input class="search-bar__input" id="search-input" type="text" placeholder="Search in document..." autocomplete="off">
        <button class="search-bar__clear" id="search-clear" hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="search-bar__nav">
        <span class="search-bar__count" id="search-count"></span>
        <button class="btn btn--icon search-bar__btn" id="search-prev" aria-label="Previous result">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
        </button>
        <button class="btn btn--icon search-bar__btn" id="search-next" aria-label="Next result">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <button class="btn btn--icon search-bar__btn" id="search-close" aria-label="Close search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
  `;

  const input = container.querySelector('#search-input');
  const clearBtn = container.querySelector('#search-clear');
  const countEl = container.querySelector('#search-count');
  const prevBtn = container.querySelector('#search-prev');
  const nextBtn = container.querySelector('#search-next');
  const closeBtn = container.querySelector('#search-close');

  let searchTimer = null;
  let engine = null;

  // Get engine reference when document is loaded
  bus.on('document:open', () => {
    // Engine is managed by Viewer; we just search through store/bus
  });

  // Show/hide
  subscribe('searchOpen', (open) => {
    container.hidden = !open;
    if (open) {
      input.focus();
      input.select();
    } else {
      input.value = '';
      setState({ searchQuery: '', searchResults: [], searchIndex: -1 });
    }
  });

  // Debounced search
  input.addEventListener('input', () => {
    const query = input.value.trim();
    clearBtn.hidden = query.length === 0;

    clearTimeout(searchTimer);
    if (query.length < 2) {
      setState({ searchQuery: '', searchResults: [], searchIndex: -1 });
      countEl.textContent = '';
      return;
    }

    searchTimer = setTimeout(() => {
      setState({ searchQuery: query });
      bus.emit('search:execute', query);
    }, 300);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) navigatePrev();
      else navigateNext();
    }
    if (e.key === 'Escape') setState({ searchOpen: false });
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.hidden = true;
    setState({ searchQuery: '', searchResults: [], searchIndex: -1 });
    countEl.textContent = '';
    input.focus();
  });

  prevBtn.addEventListener('click', navigatePrev);
  nextBtn.addEventListener('click', navigateNext);
  closeBtn.addEventListener('click', () => setState({ searchOpen: false }));

  // Search results arrived
  subscribe('searchResults', (results) => {
    if (results.length === 0 && getState().searchQuery) {
      countEl.textContent = 'No results';
    } else if (results.length > 0) {
      setState({ searchIndex: 0 });
      countEl.textContent = `1 of ${results.length}`;
      bus.emit('viewer:goto', results[0].page);
    } else {
      countEl.textContent = '';
    }
  });

  function navigateNext() {
    const { searchResults, searchIndex } = getState();
    if (searchResults.length === 0) return;
    const next = (searchIndex + 1) % searchResults.length;
    setState({ searchIndex: next });
    countEl.textContent = `${next + 1} of ${searchResults.length}`;
    bus.emit('viewer:goto', searchResults[next].page);
  }

  function navigatePrev() {
    const { searchResults, searchIndex } = getState();
    if (searchResults.length === 0) return;
    const prev = (searchIndex - 1 + searchResults.length) % searchResults.length;
    setState({ searchIndex: prev });
    countEl.textContent = `${prev + 1} of ${searchResults.length}`;
    bus.emit('viewer:goto', searchResults[prev].page);
  }
}
