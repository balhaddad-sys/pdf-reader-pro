import {
  Search, Settings, PanelLeft, Maximize2, Minimize2,
  ZoomIn, ZoomOut, ChevronLeft, BookOpen, Bookmark,
  Moon, Sun, Monitor,
} from 'lucide-react';
import { IconButton } from '@/components/common/IconButton';
import { useUIStore } from '@/stores/uiStore';
import { useDocumentStore } from '@/stores/documentStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { getNextZoom, getPrevZoom, cn } from '@/utils/helpers';

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

  const tabs = useDocumentStore(s => s.tabs);
  const activeTabId = useDocumentStore(s => s.activeTabId);
  const updateTab = useDocumentStore(s => s.updateTab);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const isPageBookmarked = useAnnotationStore(s => s.isPageBookmarked);
  const addBookmark = useAnnotationStore(s => s.addBookmark);
  const bookmarks = useAnnotationStore(s => s.bookmarks);
  const removeBookmark = useAnnotationStore(s => s.removeBookmark);

  const isReader = viewMode === 'reader' && activeTab;

  const handleZoomIn = () => {
    if (!activeTab) return;
    updateTab(activeTab.id, { zoom: getNextZoom(activeTab.zoom) });
  };

  const handleZoomOut = () => {
    if (!activeTab) return;
    updateTab(activeTab.id, { zoom: getPrevZoom(activeTab.zoom) });
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

  const themeIcon = theme === 'light' ? <Sun size={18} /> : theme === 'dark' ? <Moon size={18} /> : <Monitor size={18} />;

  if (focusMode) {
    return (
      <header
        className="fixed top-0 left-0 right-0 z-40 h-0 group"
      >
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
          <button
            onClick={() => activeTab && updateTab(activeTab.id, { zoom: 1 })}
            className="min-w-[52px] h-7 px-2 rounded-lg text-xs font-medium text-on-surface-secondary hover:bg-white/10 transition-colors"
          >
            {Math.round(activeTab.zoom * 100)}%
          </button>
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
            onClick={() => setFocusMode(true)}
            tooltip="Focus mode"
            shortcut="F11"
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
