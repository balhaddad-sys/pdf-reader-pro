import { useState, useRef, useEffect } from 'react';
import {
  Search, Settings, PanelLeft, Maximize2, Minimize2,
  ZoomIn, ZoomOut, ChevronLeft, Bookmark,
  Moon, Sun, Monitor, Printer, Download, ChevronDown,
  Maximize, MoreVertical, Image as ImageIcon,
} from 'lucide-react';
import { AppIcon } from '@/components/common/AppIcon';
import { IconButton } from '@/components/common/IconButton';
import { useUIStore } from '@/stores/uiStore';
import { useDocumentStore } from '@/stores/documentStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { getNextZoom, getPrevZoom, ZOOM_LEVELS, cn } from '@/utils/helpers';
import * as db from '@/utils/db';

export function Header() {
  const viewMode = useUIStore(s => s.viewMode);
  const setViewMode = useUIStore(s => s.setViewMode);
  const theme = useUIStore(s => s.theme);
  const setTheme = useUIStore(s => s.setTheme);
  const toggleSidebar = useUIStore(s => s.toggleSidebar);
  const sidebarOpen = useUIStore(s => s.sidebarOpen);
  const setSearchOpen = useUIStore(s => s.setSearchOpen);
  const setSettingsOpen = useUIStore(s => s.setSettingsOpen);
  const focusMode = useUIStore(s => s.focusMode);
  const setFocusMode = useUIStore(s => s.setFocusMode);
  const addToast = useUIStore(s => s.addToast);

  const tabs = useDocumentStore(s => s.tabs);
  const activeTabId = useDocumentStore(s => s.activeTabId);
  const updateTab = useDocumentStore(s => s.updateTab);
  const getPdfInstance = useDocumentStore(s => s.getPdfInstance);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const isPageBookmarked = useAnnotationStore(s => s.isPageBookmarked);
  const addBookmark = useAnnotationStore(s => s.addBookmark);
  const bookmarks = useAnnotationStore(s => s.bookmarks);
  const removeBookmark = useAnnotationStore(s => s.removeBookmark);

  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const zoomMenuRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  const isReader = viewMode === 'reader' && activeTab;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (zoomMenuRef.current && !zoomMenuRef.current.contains(e.target as Node)) {
        setZoomMenuOpen(false);
      }
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /** Zoom while keeping the viewport center stable.
   *  Dispatches a custom event so PDFViewer can capture the anchor
   *  point BEFORE React re-renders with the new zoom. */
  const zoomTo = (newZoom: number) => {
    if (!activeTab) return;
    // Notify PDFViewer to capture scroll anchor before state change
    window.dispatchEvent(new CustomEvent('pdf-zoom-request', {
      detail: { tabId: activeTab.id, newZoom },
    }));
  };

  const handleZoomIn = () => {
    if (!activeTab) return;
    zoomTo(getNextZoom(activeTab.zoom));
  };

  const handleZoomOut = () => {
    if (!activeTab) return;
    zoomTo(getPrevZoom(activeTab.zoom));
  };

  const handleFitWidth = async () => {
    if (!activeTab) return;
    const viewer = document.querySelector('[data-pdf-viewer]') as HTMLElement | null;
    if (!viewer) return;
    const containerWidth = viewer.clientWidth - 32;
    let naturalWidth = 595;
    const pdf = getPdfInstance(activeTab.documentId);
    if (pdf) {
      try {
        const page = await pdf.getPage(activeTab.page);
        naturalWidth = page.getViewport({ scale: 1 }).width;
      } catch { /* use default */ }
    }
    const fitZoom = Math.round((containerWidth / naturalWidth) * 100) / 100;
    zoomTo(Math.max(0.25, Math.min(4, fitZoom)));
    setZoomMenuOpen(false);
  };

  const handleFitPage = async () => {
    if (!activeTab) return;
    const viewer = document.querySelector('[data-pdf-viewer]') as HTMLElement | null;
    if (!viewer) return;
    const containerH = viewer.clientHeight - 32;
    let naturalH = 842;
    const pdf = getPdfInstance(activeTab.documentId);
    if (pdf) {
      try {
        const page = await pdf.getPage(activeTab.page);
        naturalH = page.getViewport({ scale: 1 }).height;
      } catch { /* use default */ }
    }
    const fitZoom = Math.round((containerH / naturalH) * 100) / 100;
    zoomTo(Math.max(0.25, Math.min(4, fitZoom)));
    setZoomMenuOpen(false);
  };

  const handlePrint = async () => {
    if (!activeTab) return;
    const fileData = await db.getFile(activeTab.documentId);
    if (!fileData) return;

    const blob = new Blob([fileData], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;border:0';
    iframe.src = url;
    document.body.appendChild(iframe);

    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        setTimeout(() => {
          document.body.removeChild(iframe);
          URL.revokeObjectURL(url);
        }, 60000);
      }
    };
    addToast('Opening print dialog...', 'info');
    setMobileMenuOpen(false);
  };

  const handleExportPage = async () => {
    if (!activeTab) return;
    const pdf = getPdfInstance(activeTab.documentId);
    if (!pdf) return;

    try {
      const page = await pdf.getPage(activeTab.page);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;

      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `${activeTab.name}-page${activeTab.page}.png`;
      a.click();
      addToast(`Page ${activeTab.page} exported as PNG`, 'success');
    } catch {
      addToast('Export failed', 'error');
    }
    setExportMenuOpen(false);
    setMobileMenuOpen(false);
  };

  const handleDownloadPdf = async () => {
    if (!activeTab) return;
    const fileData = await db.getFile(activeTab.documentId);
    if (!fileData) return;
    const blob = new Blob([fileData], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTab.name}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    addToast('PDF downloaded', 'success');
    setExportMenuOpen(false);
    setMobileMenuOpen(false);
  };

  const handleToggleBookmark = () => {
    if (!activeTab) return;
    const existing = bookmarks.find(b => b.page === activeTab.page);
    if (existing) {
      removeBookmark(existing.id);
    } else {
      const tab = tabs.find(t => t.id === activeTabId);
      if (tab) addBookmark(tab.documentId, activeTab.page);
    }
  };

  const cycleTheme = () => {
    const themes: typeof theme[] = ['light', 'dark', 'midnight', 'sepia'];
    const idx = themes.indexOf(theme);
    setTheme(themes[(idx + 1) % themes.length]);
  };

  const themeIcon = theme === 'light'
    ? <Sun size={18} />
    : theme === 'dark'
      ? <Moon size={18} />
      : <Monitor size={18} />;

  const [focusBarVisible, setFocusBarVisible] = useState(false);

  // Auto-hide focus bar after 3 seconds
  useEffect(() => {
    if (!focusBarVisible) return;
    const timer = setTimeout(() => setFocusBarVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [focusBarVisible]);

  if (focusMode) {
    return (
      <>
        <header className="fixed top-0 left-0 right-0 z-40 h-0 group">
          {/* Invisible touch/click hit zone at top of screen */}
          <div
            className="absolute top-0 left-0 right-0 h-5 z-50 cursor-pointer"
            onClick={() => setFocusBarVisible(v => !v)}
            onTouchStart={() => setFocusBarVisible(v => !v)}
          />
          <div className={cn(
            'h-12 flex items-center justify-center gap-2 px-4',
            'bg-surface-1/80 backdrop-blur-xl border-b border-border/50',
            'transition-all duration-300',
            focusBarVisible
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 -translate-y-full group-hover:opacity-100 group-hover:translate-y-0',
          )} style={{ paddingTop: 'env(safe-area-inset-top)' }}>
            <IconButton onClick={() => setFocusMode(false)} tooltip="Exit focus mode" size="sm">
              <Minimize2 size={16} />
            </IconButton>
            {activeTab && (
              <span className="text-xs text-on-surface-secondary">
                Page {activeTab.page} &middot; {Math.round(activeTab.zoom * 100)}%
              </span>
            )}
          </div>
        </header>

        {/* Persistent floating exit button for mobile/touch */}
        <button
          onClick={() => setFocusMode(false)}
          className="fixed z-50 sm:hidden w-10 h-10 rounded-full bg-surface-1/90 backdrop-blur-xl border border-border shadow-elevation-3 flex items-center justify-center text-on-surface-secondary active:scale-95 transition-transform"
          style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))', right: '1.5rem' }}
          aria-label="Exit focus mode"
        >
          <Minimize2 size={16} />
        </button>
      </>
    );
  }

  return (
    <header
      className="h-13 flex items-center gap-1 px-2 sm:px-3 bg-surface-1 border-b border-border shrink-0 z-30"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Left section */}
      <div className="flex items-center gap-0.5 sm:gap-1">
        {isReader && (
          <IconButton
            onClick={() => setViewMode('library')}
            tooltip="Back to library"
            shortcut="Esc"
            size="sm"
          >
            <ChevronLeft size={18} />
          </IconButton>
        )}

        {isReader && (
          <IconButton
            onClick={toggleSidebar}
            tooltip={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            shortcut="Ctrl+B"
            active={sidebarOpen}
            size="sm"
          >
            <PanelLeft size={18} />
          </IconButton>
        )}

        {!isReader && (
          <div className="flex items-center gap-2 sm:gap-2.5 pl-1">
            <AppIcon className="w-7 h-7 shrink-0" decorative />
            <h1 className="text-sm font-bold tracking-tight">
              <span className="text-on-surface">PDF Reader</span>
              <span className="text-brand-400 ml-0.5">Pro</span>
            </h1>
          </div>
        )}
      </div>

      {/* Center section — zoom controls + document title */}
      {isReader && (
        <div className="flex-1 flex items-center justify-center gap-0.5 sm:gap-1 min-w-0">
          {/* Zoom out — hidden on mobile (pinch zoom available) */}
          <IconButton onClick={handleZoomOut} tooltip="Zoom out" shortcut="Ctrl+-" size="sm" className="hidden md:inline-flex">
            <ZoomOut size={16} />
          </IconButton>

          {/* Zoom level picker — always visible */}
          <div className="relative" ref={zoomMenuRef}>
            <button
              onClick={() => setZoomMenuOpen(s => !s)}
              className="flex items-center gap-0.5 min-w-[50px] h-7 px-1.5 sm:px-2 rounded-lg text-xs font-medium text-on-surface-secondary hover:bg-white/10 transition-colors"
            >
              {Math.round(activeTab.zoom * 100)}%
              <ChevronDown size={11} className="ml-0.5" />
            </button>

            {zoomMenuOpen && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-40 bg-surface-2 border border-border rounded-xl shadow-elevation-3 py-1 z-50 max-h-72 overflow-y-auto">
                <button
                  onClick={handleFitWidth}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-on-surface-secondary hover:bg-white/5 hover:text-on-surface"
                >
                  <Maximize size={12} />
                  Fit Width
                </button>
                <button
                  onClick={handleFitPage}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-on-surface-secondary hover:bg-white/5 hover:text-on-surface"
                >
                  <Maximize2 size={12} />
                  Fit Page
                </button>
                <div className="my-1 border-t border-border/50" />
                {ZOOM_LEVELS.map(level => (
                  <button
                    key={level}
                    onClick={() => {
                      zoomTo(level);
                      setZoomMenuOpen(false);
                    }}
                    className={cn(
                      'w-full px-3 py-2 text-xs text-left transition-colors',
                      Math.abs(activeTab.zoom - level) < 0.01
                        ? 'text-brand-400 bg-brand-500/10'
                        : 'text-on-surface-secondary hover:bg-white/5 hover:text-on-surface',
                    )}
                  >
                    {Math.round(level * 100)}%
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Zoom in — hidden on mobile */}
          <IconButton onClick={handleZoomIn} tooltip="Zoom in" shortcut="Ctrl+=" size="sm" className="hidden md:inline-flex">
            <ZoomIn size={16} />
          </IconButton>

          {/* Document title — shown on mobile where the ± buttons are hidden */}
          <span className="md:hidden ml-1 text-xs font-medium text-on-surface truncate max-w-[100px] sm:max-w-[140px]">
            {activeTab.name}
          </span>
        </div>
      )}

      {!isReader && <div className="flex-1" />}

      {/* Right section */}
      <div className="flex items-center gap-0.5">
        {isReader && (
          <IconButton
            onClick={handleToggleBookmark}
            tooltip={isPageBookmarked(activeTab.page) ? 'Remove bookmark' : 'Bookmark page'}
            shortcut="Ctrl+D"
            active={isPageBookmarked(activeTab.page)}
            size="sm"
          >
            <Bookmark size={16} fill={isPageBookmarked(activeTab.page) ? 'currentColor' : 'none'} />
          </IconButton>
        )}

        {isReader && (
          <IconButton
            onClick={() => setSearchOpen(true)}
            tooltip="Search in document"
            shortcut="Ctrl+F"
            size="sm"
          >
            <Search size={16} />
          </IconButton>
        )}

        {/* Desktop-only: Print, Export, Focus mode */}
        {isReader && (
          <div className="hidden sm:contents">
            <IconButton
              onClick={handlePrint}
              tooltip="Print document (Ctrl+P)"
              size="sm"
            >
              <Printer size={16} />
            </IconButton>
          </div>
        )}

        {isReader && (
          <div className="relative hidden sm:block" ref={exportMenuRef}>
            <IconButton
              tooltip="Export / Download"
              size="sm"
              active={exportMenuOpen}
              onClick={() => setExportMenuOpen(s => !s)}
            >
              <Download size={16} />
            </IconButton>

            {exportMenuOpen && (
              <div className="absolute top-full right-0 mt-1 w-48 bg-surface-2 border border-border rounded-xl shadow-elevation-3 py-1 z-50">
                <button
                  onClick={handleExportPage}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-on-surface-secondary hover:bg-white/5 hover:text-on-surface transition-colors"
                >
                  <ImageIcon size={12} />
                  Export page as PNG
                </button>
                <button
                  onClick={handleDownloadPdf}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-on-surface-secondary hover:bg-white/5 hover:text-on-surface transition-colors"
                >
                  <Download size={12} />
                  Download PDF
                </button>
              </div>
            )}
          </div>
        )}

        {isReader && (
          <div className="hidden sm:contents">
            <IconButton
              onClick={() => setFocusMode(true)}
              tooltip="Focus mode (F11)"
              size="sm"
            >
              <Maximize2 size={16} />
            </IconButton>
          </div>
        )}

        {/* ─── Mobile overflow menu ─── */}
        {isReader && (
          <div className="relative sm:hidden" ref={mobileMenuRef}>
            <IconButton
              size="sm"
              active={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(s => !s)}
            >
              <MoreVertical size={16} />
            </IconButton>

            {mobileMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMobileMenuOpen(false)} />
                <div className="absolute top-full right-0 mt-1 w-52 bg-surface-2 border border-border rounded-xl shadow-elevation-3 py-1 z-50 animate-scale-in">
                  <button
                    onClick={handlePrint}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-on-surface-secondary hover:bg-white/5 hover:text-on-surface transition-colors"
                  >
                    <Printer size={16} />
                    Print
                  </button>
                  <button
                    onClick={handleExportPage}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-on-surface-secondary hover:bg-white/5 hover:text-on-surface transition-colors"
                  >
                    <ImageIcon size={16} />
                    Export page as PNG
                  </button>
                  <button
                    onClick={handleDownloadPdf}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-on-surface-secondary hover:bg-white/5 hover:text-on-surface transition-colors"
                  >
                    <Download size={16} />
                    Download PDF
                  </button>
                  <div className="my-1 border-t border-border/50" />
                  <button
                    onClick={() => { setFocusMode(true); setMobileMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-on-surface-secondary hover:bg-white/5 hover:text-on-surface transition-colors"
                  >
                    <Maximize2 size={16} />
                    Focus mode
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <IconButton onClick={cycleTheme} tooltip={`Theme: ${theme}`} size="sm">
          {themeIcon}
        </IconButton>

        <IconButton
          onClick={() => setSettingsOpen(true)}
          tooltip="Settings"
          shortcut="Ctrl+,"
          size="sm"
        >
          <Settings size={16} />
        </IconButton>
      </div>
    </header>
  );
}
