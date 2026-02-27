import { bus } from './EventBus.js';

/**
 * Minimal reactive store. Holds app state and notifies on changes.
 * No proxies, no deep watching — just explicit updates for performance.
 */

const state = {
  // App view
  view: 'library', // 'library' | 'viewer'
  theme: localStorage.getItem('theme') || 'system',
  resolvedTheme: 'light',

  // Library
  documents: [],

  // Active document
  doc: null,
  fileName: '',
  fileSize: 0,
  pageCount: 0,
  currentPage: 1,
  scale: 1.0,
  fitMode: 'width', // 'width' | 'height' | 'page' | null
  continuousScroll: true,
  loading: false,
  loadProgress: 0,

  // Sidebar
  sidebarOpen: false,
  sidebarTab: 'toc', // 'toc' | 'bookmarks' | 'annotations' | 'thumbnails'

  // Search
  searchOpen: false,
  searchQuery: '',
  searchResults: [],
  searchIndex: -1,

  // Annotations
  annotationMode: null, // null | 'highlight' | 'draw' | 'note'
  highlightColor: '#FFEB3B',
  annotations: [],

  // Bookmarks
  bookmarks: [],

  // TOC
  outline: [],

  // Reading
  focusMode: false,
};

export function getState() {
  return state;
}

export function setState(partial) {
  const changed = {};
  for (const key in partial) {
    if (state[key] !== partial[key]) {
      changed[key] = { from: state[key], to: partial[key] };
      state[key] = partial[key];
    }
  }
  if (Object.keys(changed).length > 0) {
    bus.emit('state:change', state, changed);
    for (const key in changed) {
      bus.emit(`state:${key}`, changed[key].to, changed[key].from);
    }
  }
}

export function subscribe(key, fn) {
  return bus.on(`state:${key}`, fn);
}

export function subscribeAny(fn) {
  return bus.on('state:change', fn);
}
