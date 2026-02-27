import { getState, setState, subscribe } from '@core/Store.js';
import { bus } from '@core/EventBus.js';
import { saveBookmarks, getBookmarks } from '@utils/storage.js';

/**
 * Sidebar — TOC, bookmarks, annotations, thumbnails tabs.
 */

export function createSidebar(container) {
  container.innerHTML = `
    <div class="sidebar" id="sidebar">
      <div class="sidebar__tabs">
        <button class="sidebar__tab sidebar__tab--active" data-tab="toc">Contents</button>
        <button class="sidebar__tab" data-tab="bookmarks">Bookmarks</button>
        <button class="sidebar__tab" data-tab="annotations">Notes</button>
      </div>
      <div class="sidebar__panel" id="sidebar-panel"></div>
    </div>
  `;

  const sidebar = container.querySelector('#sidebar');
  const panel = container.querySelector('#sidebar-panel');
  const tabs = container.querySelectorAll('.sidebar__tab');

  let activeTab = 'toc';

  // Tab switching
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab;
      tabs.forEach(t => t.classList.toggle('sidebar__tab--active', t === tab));
      setState({ sidebarTab: activeTab });
      renderPanel();
    });
  });

  // Show/hide
  subscribe('sidebarOpen', (open) => {
    sidebar.classList.toggle('sidebar--open', open);
  });

  // Re-render when data changes
  subscribe('outline', renderPanel);
  subscribe('bookmarks', renderPanel);
  subscribe('annotations', renderPanel);
  subscribe('sidebarTab', () => {
    activeTab = getState().sidebarTab;
    renderPanel();
  });

  function renderPanel() {
    switch (activeTab) {
      case 'toc': renderTOC(); break;
      case 'bookmarks': renderBookmarks(); break;
      case 'annotations': renderAnnotations(); break;
    }
  }

  function renderTOC() {
    const outline = getState().outline;
    if (!outline || outline.length === 0) {
      panel.innerHTML = '<div class="sidebar__empty">No table of contents</div>';
      return;
    }

    panel.innerHTML = outline.map((item, i) => `
      <button class="sidebar__item sidebar__item--level-${Math.min(item.level, 3)}" data-toc="${i}">
        ${escapeHtml(item.title)}
      </button>
    `).join('');

    panel.querySelectorAll('[data-toc]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.toc, 10);
        const item = outline[idx];
        if (item && item.dest) {
          bus.emit('toc:navigate', item.dest);
        }
      });
    });
  }

  function renderBookmarks() {
    const bookmarks = getState().bookmarks;

    panel.innerHTML = `
      <button class="sidebar__add-btn" id="btn-add-bookmark">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Bookmark this page
      </button>
      <div class="sidebar__list" id="bookmark-list">
        ${bookmarks.length === 0
          ? '<div class="sidebar__empty">No bookmarks yet</div>'
          : bookmarks.map((bm, i) => `
            <div class="sidebar__item sidebar__item--bookmark" data-bm-page="${bm.page}">
              <span class="sidebar__item-label">Page ${bm.page}</span>
              ${bm.label ? `<span class="sidebar__item-sub">${escapeHtml(bm.label)}</span>` : ''}
              <button class="sidebar__item-delete" data-bm-delete="${i}" aria-label="Remove">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          `).join('')
        }
      </div>
    `;

    panel.querySelector('#btn-add-bookmark').addEventListener('click', () => {
      const { currentPage, bookmarks: bms } = getState();
      if (bms.some(b => b.page === currentPage)) {
        bus.emit('toast', 'Page already bookmarked');
        return;
      }
      const updated = [...bms, { page: currentPage, label: '', createdAt: Date.now() }];
      updated.sort((a, b) => a.page - b.page);
      setState({ bookmarks: updated });
      saveBookmarks(getState().doc?._pdfInfo?.fingerprints?.[0] || 'default', updated);
      renderBookmarks();
      bus.emit('toast', `Bookmarked page ${currentPage}`);
    });

    panel.querySelectorAll('[data-bm-page]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.sidebar__item-delete')) return;
        bus.emit('viewer:goto', parseInt(el.dataset.bmPage, 10));
      });
    });

    panel.querySelectorAll('[data-bm-delete]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.bmDelete, 10);
        const updated = getState().bookmarks.filter((_, i) => i !== idx);
        setState({ bookmarks: updated });
        saveBookmarks(getState().doc?._pdfInfo?.fingerprints?.[0] || 'default', updated);
        renderBookmarks();
      });
    });
  }

  function renderAnnotations() {
    const annotations = getState().annotations;
    if (!annotations || annotations.length === 0) {
      panel.innerHTML = '<div class="sidebar__empty">No annotations yet</div>';
      return;
    }

    panel.innerHTML = annotations.map((ann, i) => `
      <div class="sidebar__item sidebar__item--annotation" data-ann-page="${ann.page}">
        <div class="sidebar__ann-color" style="background:${ann.color || '#FFEB3B'}"></div>
        <div class="sidebar__ann-info">
          <span class="sidebar__item-label">Page ${ann.page}</span>
          ${ann.text ? `<span class="sidebar__item-sub">${escapeHtml(ann.text.slice(0, 60))}</span>` : ''}
        </div>
      </div>
    `).join('');

    panel.querySelectorAll('[data-ann-page]').forEach(el => {
      el.addEventListener('click', () => {
        bus.emit('viewer:goto', parseInt(el.dataset.annPage, 10));
      });
    });
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
