import { getState, setState } from '@core/Store.js';
import { bus } from '@core/EventBus.js';
import { getDocuments, saveDocuments, loadFile, saveFile, loadThumbnail, saveThumbnail, deleteFile } from '@utils/storage.js';
import { formatFileSize, generateId } from '@utils/platform.js';

/**
 * Library view — document grid with open/delete, drag-drop, file picker.
 */

export function createLibrary(container) {
  container.innerHTML = `
    <div class="library">
      <header class="library__header">
        <div class="library__logo">
          <svg class="library__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          <h1 class="library__title">PDF Reader Pro</h1>
        </div>
        <div class="library__actions">
          <button class="btn btn--icon" id="btn-theme" aria-label="Toggle theme">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
          </button>
        </div>
      </header>

      <div class="library__drop-zone" id="drop-zone">
        <div class="library__drop-content">
          <svg class="library__drop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <p class="library__drop-text">Drop PDF here or tap to open</p>
          <p class="library__drop-sub">Supports any PDF, even 1000+ pages</p>
          <input type="file" id="file-input" accept=".pdf,application/pdf" hidden>
        </div>
      </div>

      <div class="library__grid" id="doc-grid"></div>
    </div>
  `;

  const dropZone = container.querySelector('#drop-zone');
  const fileInput = container.querySelector('#file-input');
  const docGrid = container.querySelector('#doc-grid');
  const themeBtn = container.querySelector('#btn-theme');

  // Render saved documents
  renderDocumentGrid();

  // File input
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) openFile(file);
    fileInput.value = '';
  });

  // Drag & drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('library__drop-zone--active');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('library__drop-zone--active');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('library__drop-zone--active');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') openFile(file);
  });

  // Theme toggle
  themeBtn.addEventListener('click', () => {
    const current = getState().theme;
    const next = current === 'dark' ? 'light' : current === 'light' ? 'system' : 'dark';
    setState({ theme: next });
    localStorage.setItem('theme', next);
    applyTheme(next);
  });

  // Listen for doc list changes
  bus.on('library:refresh', renderDocumentGrid);

  function renderDocumentGrid() {
    const docs = getDocuments();
    setState({ documents: docs });

    if (docs.length === 0) {
      docGrid.innerHTML = '';
      return;
    }

    docGrid.innerHTML = docs.map(doc => `
      <div class="doc-card" data-id="${doc.id}">
        <div class="doc-card__thumb" id="thumb-${doc.id}">
          <svg class="doc-card__placeholder" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <div class="doc-card__info">
          <span class="doc-card__name">${escapeHtml(doc.name)}</span>
          <span class="doc-card__meta">${doc.pageCount || '?'} pages &middot; ${formatFileSize(doc.size || 0)}</span>
        </div>
        <button class="doc-card__delete" data-delete="${doc.id}" aria-label="Delete document">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div>
    `).join('');

    // Load thumbnails
    docs.forEach(doc => {
      loadThumbnail(doc.id).then(dataUrl => {
        if (dataUrl) {
          const thumbEl = docGrid.querySelector(`#thumb-${doc.id}`);
          if (thumbEl) {
            thumbEl.innerHTML = `<img src="${dataUrl}" class="doc-card__thumb-img" alt="">`;
          }
        }
      });
    });

    // Card click — open
    docGrid.querySelectorAll('.doc-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.doc-card__delete')) return;
        openSavedDocument(card.dataset.id);
      });
    });

    // Delete buttons
    docGrid.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.delete;
        deleteDocument(id);
      });
    });
  }

  async function openFile(file) {
    const buffer = await file.arrayBuffer();
    const id = generateId();

    bus.emit('document:open', {
      id,
      buffer,
      name: file.name,
      size: file.size,
      isNew: true,
    });
  }

  async function openSavedDocument(id) {
    const record = await loadFile(id);
    if (!record) return;

    bus.emit('document:open', {
      id: record.id,
      buffer: record.data,
      name: record.name,
      size: record.size,
      isNew: false,
    });
  }

  async function deleteDocument(id) {
    const docs = getDocuments().filter(d => d.id !== id);
    saveDocuments(docs);
    await deleteFile(id);
    renderDocumentGrid();
    bus.emit('toast', 'Document deleted');
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function applyTheme(theme) {
  let resolved = theme;
  if (theme === 'system') {
    resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', resolved);
  setState({ resolvedTheme: resolved });
}

export { applyTheme };
