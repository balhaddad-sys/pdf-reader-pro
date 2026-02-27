# PDF Reader Pro

Professional PDF reader PWA — fast, smooth, handles 1000+ pages seamlessly.

## Tech Stack

- **Language:** Vanilla JavaScript (ES modules, no framework)
- **Build:** Vite 5
- **PDF Engine:** PDF.js 3.x (bundled in `public/lib/`)
- **Mobile:** Capacitor 5 (iOS/Android wrappers)
- **Deploy:** Vercel (static, outputs to `dist/`)

## Commands

```bash
npm run dev       # Start Vite dev server (port 3000)
npm run build     # Production build → dist/
npm run preview   # Preview production build
npm run icons     # Regenerate app icons from icon.svg
```

## Architecture

```
index.html              ← Vite entry point (root, not public/)
src/
  main.js               ← Boot: theme, shell, toast, search bridge, SW
  core/
    EventBus.js          ← Pub/sub event system (bus singleton)
    Store.js             ← Reactive state (getState/setState/subscribe)
    PDFEngine.js         ← PDF.js wrapper: load, render, text, search, outline
    VirtualScroller.js   ← Virtual scroll engine (binary search, page recycling)
  ui/
    Shell.js             ← Root layout, view transitions
    Library.js           ← Document grid, drag-drop, file picker
    Viewer.js            ← PDF viewer orchestrator (engine + scroller + gestures)
    Toolbar.js           ← Top bar: nav, zoom, search, sidebar toggle
    Sidebar.js           ← TOC, bookmarks, annotations tabs
  features/
    search/SearchBar.js  ← Full-text search with debounce and result navigation
  utils/
    storage.js           ← IndexedDB (files, thumbnails) + localStorage (metadata)
    gestures.js          ← Pinch-to-zoom gesture recognizer
    platform.js          ← Device detection, helpers
  styles/
    index.css            ← All styles: tokens, reset, components, responsive
public/
  lib/                   ← PDF.js library files (do not modify)
  icons/                 ← Generated PNG icons
  sw.js                  ← Service worker (offline support)
  manifest.json          ← PWA manifest with file handlers
```

## Key Design Decisions

### Virtual Scrolling (1000+ pages)
The `VirtualScroller` is the performance core. It:
1. Pre-computes cumulative Y positions for all pages from cached dimensions
2. Sets a tall sentinel div for native scroll behavior
3. Binary-searches for visible pages on each scroll frame (O(log n))
4. Renders only visible + buffer pages (typically 7-10 of 1000+)
5. Recycles DOM nodes and clears canvas memory for off-screen pages
6. Prioritizes renders: visible pages first, then buffer by distance

### State Management
Simple `getState()`/`setState()` with event-based subscriptions. No deep watching or proxies — explicit updates for maximum performance.

### Event Bus
Components communicate through `bus.emit()`/`bus.on()`. Key events:
- `document:open` — triggers document loading flow
- `viewer:goto`, `viewer:close` — navigation
- `viewer:zoom-in/out/fit/set` — zoom control
- `scroller:page` — virtual scroller reports current page
- `search:execute` — triggers full-text search
- `toc:navigate` — outline navigation
- `toast` — user notification

### PDF Engine
Wraps PDF.js with render-task cancellation, dimension caching, and text extraction. Never blocks the main thread for renders — all async with proper cleanup.

## Conventions

- **No framework.** Vanilla JS ES modules. Keep it lightweight.
- **CSS custom properties** for all colors/spacing. Dark theme via `[data-theme="dark"]`.
- **iOS design language.** Apple HIG-inspired: Inter font, subtle shadows, spring animations, rounded corners.
- **Passive event listeners** for scroll. Non-passive only during active pinch gesture.
- **All state flows through Store.** UI reads from `getState()`, updates via `setState()`, reacts via `subscribe()`.
- **No inline styles in JS** except positioning for virtual scroll page elements.

## Storage

| Store | Purpose |
|-------|---------|
| IndexedDB `files` | PDF binary data (ArrayBuffer) |
| IndexedDB `thumbnails` | First-page thumbnail data URLs |
| localStorage `pdf_documents` | Document metadata (name, size, page count) |
| localStorage `pdf_bookmarks` | Per-document bookmarks |
| localStorage `pdf_annotations` | Per-document annotations |
| localStorage `pdf_positions` | Last reading position per document |
| localStorage `theme` | User theme preference |

## Deployment

- **Web (Vercel):** `npm run build` → deploy `dist/`. Config in `vercel.json`.
- **Android:** `npx cap sync android && npx cap open android`
- **iOS:** `npx cap sync ios && npx cap open ios`
- **Desktop (Electron):** Not currently configured but straightforward via Capacitor or custom Electron wrapper.
