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
      {/* Header */}
      {!focusMode && <Header />}
      {focusMode && <Header />}

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
