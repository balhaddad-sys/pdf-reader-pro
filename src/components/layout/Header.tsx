import { useState, useRef, useEffect } from 'react';
import {
  Search, Settings, PanelLeft, Maximize2, Minimize2,
  ZoomIn, ZoomOut, ChevronLeft, BookOpen, Bookmark,
  Moon, Sun, Monitor, Printer, Download, ChevronDown,
  Maximize,
} from 'lucide-react';
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
  const zoomMenuRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const isReader = viewMode === 'reader' && activeTab;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (zoomMenuRef.current && !zoomMenuRef.current.contains(e.target as Node)) {
        setZoomMenuOpen(false);
      }
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleZoomIn = () => {
    if (!activeTab) return;
    updateTab(activeTab.id, { zoom: getNextZoom(activeTab.zoom) });
  };

  const handleZoomOut = () => {
    if (!activeTab) return;
    updateTab(activeTab.id, { zoom: getPrevZoom(activeTab.zoom) });
  };

  const handleFitWidth = async () => {
    if (!activeTab) return;
    const viewer = document.querySelector('.overflow-y-auto') as HTMLElement | null;
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
    updateTab(activeTab.id, { zoom: Math.max(0.25, Math.min(4, fitZoom)) });
    setZoomMenuOpen(false);
  };

  const handleFitPage = async () => {
    if (!activeTab) return;
    const viewer = document.querySelector('.overflow-y-auto') as HTMLElement | null;
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
    updateTab(activeTab.id, { zoom: Math.max(0.25, Math.min(4, fitZoom)) });
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

  if (focusMode) {
    return (
      <header className="fixed top-0 left-0 right-0 z-40 h-0 group">
        <div className={cn(
          'h-12 flex items-center justify-center gap-2 px-4',
          'bg-surface-1/80 backdrop-blur-xl border-b border-border/50',
          'opacity-0 group-hover:opacity-100 transition-opacity duration-300',
          '-translate-y-full group-hover:translate-y-0 transition-transform duration-300',
        )}>
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
    );
  }

  return (
    <header className="h-13 flex items-center gap-1 px-3 bg-surface-1 border-b border-border shrink-0 z-30">
      {/* Left section */}
      <div className="flex items-center gap-1">
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
          <div className="flex items-center gap-2.5 pl-1">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-glow">
              <BookOpen size={14} className="text-white" />
            </div>
            <h1 className="text-sm font-bold tracking-tight">
              <span className="text-on-surface">PDF Reader</span>
              <span className="text-brand-400 ml-0.5">Pro</span>
            </h1>
          </div>
        )}
      </div>

      {/* Center section - zoom controls when reading */}
      {isReader && (
        <div className="flex-1 flex items-center justify-center gap-1">
          <IconButton onClick={handleZoomOut} tooltip="Zoom out" shortcut="Ctrl+-" size="sm">
            <ZoomOut size={16} />
          </IconButton>

          {/* Zoom level picker */}
          <div className="relative" ref={zoomMenuRef}>
            <button
              onClick={() => setZoomMenuOpen(s => !s)}
              className="flex items-center gap-0.5 min-w-[64px] h-7 px-2 rounded-lg text-xs font-medium text-on-surface-secondary hover:bg-white/10 transition-colors"
            >
              {Math.round(activeTab.zoom * 100)}%
              <ChevronDown size={11} className="ml-0.5" />
            </button>

            {zoomMenuOpen && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-40 bg-surface-2 border border-border rounded-xl shadow-elevation-3 py-1 z-50 max-h-72 overflow-y-auto">
                <button
                  onClick={handleFitWidth}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-on-surface-secondary hover:bg-white/5 hover:text-on-surface"
                >
                  <Maximize size={12} />
                  Fit Width
                </button>
                <button
                  onClick={handleFitPage}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-on-surface-secondary hover:bg-white/5 hover:text-on-surface"
                >
                  <Maximize2 size={12} />
                  Fit Page
                </button>
                <div className="my-1 border-t border-border/50" />
                {ZOOM_LEVELS.map(level => (
                  <button
                    key={level}
                    onClick={() => {
                      updateTab(activeTab.id, { zoom: level });
                      setZoomMenuOpen(false);
                    }}
                    className={cn(
                      'w-full px-3 py-1.5 text-xs text-left transition-colors',
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

          <IconButton onClick={handleZoomIn} tooltip="Zoom in" shortcut="Ctrl+=" size="sm">
            <ZoomIn size={16} />
          </IconButton>
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

        {isReader && (
          <IconButton
            onClick={handlePrint}
            tooltip="Print document (Ctrl+P)"
            size="sm"
          >
            <Printer size={16} />
          </IconButton>
        )}

        {/* Export/Download dropdown */}
        {isReader && (
          <div className="relative" ref={exportMenuRef}>
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
                  <Download size={12} />
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
          <IconButton
            onClick={() => setFocusMode(true)}
            tooltip="Focus mode (F11)"
            size="sm"
          >
            <Maximize2 size={16} />
          </IconButton>
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
