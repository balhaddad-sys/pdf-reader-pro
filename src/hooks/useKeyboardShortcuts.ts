import { useEffect } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useDocumentStore } from '@/stores/documentStore';
import { useAnnotationStore } from '@/stores/annotationStore';

export function useKeyboardShortcuts() {
  const setViewMode = useUIStore(s => s.setViewMode);
  const viewMode = useUIStore(s => s.viewMode);
  const toggleSidebar = useUIStore(s => s.toggleSidebar);
  const setSearchOpen = useUIStore(s => s.setSearchOpen);
  const setSettingsOpen = useUIStore(s => s.setSettingsOpen);
  const setShortcutsOpen = useUIStore(s => s.setShortcutsOpen);
  const setActiveTool = useUIStore(s => s.setActiveTool);
  const focusMode = useUIStore(s => s.focusMode);
  const setFocusMode = useUIStore(s => s.setFocusMode);

  const tabs = useDocumentStore(s => s.tabs);
  const activeTabId = useDocumentStore(s => s.activeTabId);
  const updateTab = useDocumentStore(s => s.updateTab);
  const documents = useDocumentStore(s => s.documents);

  const bookmarks = useAnnotationStore(s => s.bookmarks);
  const addBookmark = useAnnotationStore(s => s.addBookmark);
  const removeBookmark = useAnnotationStore(s => s.removeBookmark);
  const undo = useAnnotationStore(s => s.undo);
  const redo = useAnnotationStore(s => s.redo);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const doc = activeTab ? documents.find(d => d.id === activeTab.documentId) : null;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // Always available
      if (e.key === 'Escape') {
        if (focusMode) {
          e.preventDefault();
          setFocusMode(false);
          return;
        }
        if (viewMode === 'reader') {
          e.preventDefault();
          setViewMode('library');
          return;
        }
      }

      if (ctrl && e.key === ',') {
        e.preventDefault();
        setSettingsOpen(true);
        return;
      }

      if (e.key === '?' && ctrl) {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      // Reader mode shortcuts
      if (viewMode === 'reader' && activeTab) {
        if (ctrl && e.key === 'f') {
          e.preventDefault();
          setSearchOpen(true);
          return;
        }

        if (ctrl && e.key === 'b') {
          e.preventDefault();
          toggleSidebar();
          return;
        }

        if (ctrl && e.key === 'd') {
          e.preventDefault();
          const existing = bookmarks.find(b => b.page === activeTab.page);
          if (existing) {
            removeBookmark(existing.id);
          } else {
            addBookmark(activeTab.documentId, activeTab.page);
          }
          return;
        }

        if (ctrl && e.key === 'z') {
          e.preventDefault();
          undo();
          return;
        }

        if (ctrl && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
          e.preventDefault();
          redo();
          return;
        }

        if (e.key === 'F11') {
          e.preventDefault();
          setFocusMode(!focusMode);
          return;
        }

        // Tool shortcuts (only when not in input)
        if (!isInput && !ctrl) {
          const toolMap: Record<string, Parameters<typeof setActiveTool>[0]> = {
            v: 'select',
            h: 'highlight',
            u: 'underline',
            n: 'note',
            p: 'freehand',
            e: 'eraser',
            s: 'shape',
            t: 'text',
          };

          const tool = toolMap[e.key.toLowerCase()];
          if (tool) {
            e.preventDefault();
            setActiveTool(tool);
            return;
          }
        }

        // Page navigation
        if (!isInput) {
          if (e.key === 'Home') {
            e.preventDefault();
            updateTab(activeTab.id, { page: 1 });
          }
          if (e.key === 'End' && doc) {
            e.preventDefault();
            updateTab(activeTab.id, { page: doc.pageCount });
          }
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
}
