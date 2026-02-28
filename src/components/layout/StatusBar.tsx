import { useDocumentStore } from '@/stores/documentStore';
import { useUIStore } from '@/stores/uiStore';

export function StatusBar() {
  const tabs = useDocumentStore(s => s.tabs);
  const activeTabId = useDocumentStore(s => s.activeTabId);
  const documents = useDocumentStore(s => s.documents);
  const viewMode = useUIStore(s => s.viewMode);
  const focusMode = useUIStore(s => s.focusMode);
  const updateTab = useDocumentStore(s => s.updateTab);

  if (focusMode) return null;

  const activeTab = tabs.find(t => t.id === activeTabId);
  const doc = activeTab ? documents.find(d => d.id === activeTab.documentId) : null;

  if (viewMode !== 'reader' || !activeTab || !doc) return null;

  const handlePageInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const val = parseInt((e.target as HTMLInputElement).value, 10);
      if (val >= 1 && val <= doc.pageCount) {
        updateTab(activeTab.id, { page: val });
      }
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <footer className="h-7 flex items-center justify-between px-3 bg-surface-1 border-t border-border text-2xs text-on-surface-secondary shrink-0">
      <div className="flex items-center gap-3">
        <span className="font-medium text-on-surface truncate max-w-[200px]">{doc.name}</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span>Page</span>
          <input
            type="number"
            min={1}
            max={doc.pageCount}
            value={activeTab.page}
            onChange={e => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val)) updateTab(activeTab.id, { page: val });
            }}
            onKeyDown={handlePageInputKeyDown}
            className="w-12 h-5 px-1.5 text-center text-2xs rounded bg-surface-2 border border-border text-on-surface focus:border-brand-500 focus:outline-none"
          />
          <span>of {doc.pageCount}</span>
        </div>
      </div>
    </footer>
  );
}
