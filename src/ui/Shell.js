import { getState, setState, subscribe } from '@core/Store.js';

/**
 * App Shell — manages the root layout and view transitions.
 */

export function createShell() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="shell">
      <div class="shell__view shell__view--library" id="view-library"></div>
      <div class="shell__view shell__view--viewer" id="view-viewer" hidden></div>
    </div>
  `;

  const libraryView = document.getElementById('view-library');
  const viewerView = document.getElementById('view-viewer');

  subscribe('view', (view) => {
    if (view === 'library') {
      viewerView.hidden = true;
      libraryView.hidden = false;
      libraryView.classList.add('shell__view--enter');
      requestAnimationFrame(() => libraryView.classList.remove('shell__view--enter'));
    } else {
      libraryView.hidden = true;
      viewerView.hidden = false;
      viewerView.classList.add('shell__view--enter');
      requestAnimationFrame(() => viewerView.classList.remove('shell__view--enter'));
    }
  });

  return { libraryView, viewerView };
}
