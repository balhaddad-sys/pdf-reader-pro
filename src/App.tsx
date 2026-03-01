import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Header } from '@/components/layout/Header';
import { TabBar } from '@/components/layout/TabBar';
import { Sidebar } from '@/components/layout/Sidebar';
import { StatusBar } from '@/components/layout/StatusBar';
import { LibraryView } from '@/components/library/LibraryView';
import { PDFViewer } from '@/components/viewer/PDFViewer';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { ShortcutsDialog } from '@/components/settings/ShortcutsDialog';
import { ToastContainer } from '@/components/common/Toast';
import { DropZone } from '@/components/common/DropZone';
import { useUIStore } from '@/stores/uiStore';
import { useDocumentStore } from '@/stores/documentStore';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/utils/helpers';

export default function App() {
  useTheme();
  useKeyboardShortcuts();

  const viewMode = useUIStore(s => s.viewMode);
  const focusMode = useUIStore(s => s.focusMode);
  const setViewMode = useUIStore(s => s.setViewMode);
  const activeTabId = useDocumentStore(s => s.activeTabId);
  const importFile = useDocumentStore(s => s.importFile);
  const openDocument = useDocumentStore(s => s.openDocument);
  const addToast = useUIStore(s => s.addToast);

  const isReader = viewMode === 'reader' && activeTabId;

  // ── Android back button ──────────────────────────────────────────────────────
  // Reader mode → return to library.  Library mode → exit the app.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let appPlugin: typeof import('@capacitor/app').App | null = null;
    let removeListener: (() => void) | null = null;

    import('@capacitor/app').then(({ App }) => {
      appPlugin = App;
      App.addListener('backButton', () => {
        if (viewMode === 'reader') {
          setViewMode('library');
        } else {
          App.exitApp();
        }
      }).then(handle => {
        removeListener = () => handle.remove();
      });
    });

    return () => { removeListener?.(); };
  }, [viewMode, setViewMode]);

  // ── Android share / "Open with" intent ──────────────────────────────────────
  // Fires when the user opens a PDF from file manager, email, Chrome downloads,
  // etc.  The OS passes a content:// URI; we read it via Capacitor Filesystem
  // and import it exactly like a regular file-picker selection.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let removeListener: (() => void) | null = null;

    Promise.all([
      import('@capacitor/app'),
      import('@capacitor/filesystem'),
    ]).then(([{ App }, { Filesystem }]) => {
      App.addListener('appUrlOpen', async (event) => {
        const url = event.url;
        if (!url) return;

        try {
          // Read the file from the content:// or file:// URI
          const result = await Filesystem.readFile({ path: url });
          const base64 = result.data as string;

          // Decode base64 → ArrayBuffer → File
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const blob = new Blob([bytes], { type: 'application/pdf' });
          const fileName = url.split('/').pop()?.split('?')[0] || 'document.pdf';
          const file = new File([blob], decodeURIComponent(fileName), { type: 'application/pdf' });

          const id = await importFile(file);
          addToast(`Opened "${file.name}"`, 'success');
          await openDocument(id);
          setViewMode('reader');
        } catch {
          addToast('Failed to open PDF', 'error');
        }
      }).then(handle => {
        removeListener = () => handle.remove();
      });
    });

    return () => { removeListener?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only register once — importFile/openDocument/addToast are stable

  // ──────────────────────────────────────────────────────────────────────────────

  const handleFileDrop = async (files: File[]) => {
    for (const file of files) {
      try {
        const id = await importFile(file);
        addToast(`Imported "${file.name}"`, 'success');
        if (files.length === 1) {
          await openDocument(id);
          setViewMode('reader');
        }
      } catch {
        addToast(`Failed to import "${file.name}"`, 'error');
      }
    }
  };

  return (
    <DropZone onDrop={handleFileDrop} fullScreen className="h-dvh flex flex-col bg-surface-0">
      {/* Header (always rendered; handles focus-mode appearance internally) */}
      <Header />

      {/* Tab bar (only when multiple tabs) */}
      {isReader && !focusMode && <TabBar />}

      {/* Main content area */}
      <div className={cn('flex-1 flex overflow-hidden', focusMode && 'pt-0')}>
        {/* Sidebar (reader mode only) */}
        {isReader && <Sidebar />}

        {/* Content */}
        {isReader ? <PDFViewer /> : <LibraryView />}
      </div>

      {/* Status bar */}
      {isReader && <StatusBar />}

      {/* Modals */}
      <SettingsDialog />
      <ShortcutsDialog />

      {/* Toasts */}
      <ToastContainer />
    </DropZone>
  );
}
