import '@styles/index.css';
import { createShell } from '@ui/Shell.js';
import { createLibrary, applyTheme } from '@ui/Library.js';
import { createViewer } from '@ui/Viewer.js';
import { bus } from '@core/EventBus.js';
import { getState, setState, subscribe } from '@core/Store.js';
import PDFEngine from '@core/PDFEngine.js';

// --- Boot ---

function init() {
  // Apply saved theme
  const savedTheme = localStorage.getItem('theme') || 'system';
  setState({ theme: savedTheme });
  applyTheme(savedTheme);

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getState().theme === 'system') applyTheme('system');
  });

  // Create shell and views
  const { libraryView, viewerView } = createShell();
  createLibrary(libraryView);
  createViewer(viewerView);

  // Toast system
  bus.on('toast', showToast);

  // Search execution — bridge between SearchBar and PDFEngine
  let searchEngine = null;

  bus.on('document:open', async ({ buffer }) => {
    // Create a lightweight engine instance for search
    searchEngine = new PDFEngine();
    await searchEngine.load(buffer.slice(0), () => {});
  });

  bus.on('search:execute', async (query) => {
    if (!searchEngine) return;
    const results = await searchEngine.searchText(query);
    setState({ searchResults: results });
  });

  bus.on('viewer:close', () => {
    if (searchEngine) {
      searchEngine.destroy();
      searchEngine = null;
    }
  });

  // TOC navigation — needs engine reference
  bus.on('toc:navigate', async (dest) => {
    if (!searchEngine) return;
    const page = await searchEngine.resolveDestination(dest);
    if (page) bus.emit('viewer:goto', page);
  });

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // Handle files opened via OS file association (PWA)
  if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async (launchParams) => {
      for (const file of launchParams.files) {
        const handle = await file.getFile();
        const buffer = await handle.arrayBuffer();
        bus.emit('document:open', {
          id: Date.now().toString(36),
          buffer,
          name: handle.name,
          size: handle.size,
          isNew: true,
        });
      }
    });
  }
}

// --- Toast ---

let toastTimer = null;

function showToast(message) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }

  el.textContent = message;
  el.classList.add('toast--visible');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('toast--visible');
  }, 2500);
}

// --- Launch ---

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
