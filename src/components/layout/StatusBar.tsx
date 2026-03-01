import { useState, useEffect } from 'react';
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

  return (
    <footer
      className="flex items-center justify-between px-3 bg-surface-1 border-t border-border text-2xs text-on-surface-secondary shrink-0"
      style={{ minHeight: '2rem', paddingTop: '0.25rem', paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom))' }}
    >
      {/* Document name */}
      <span className="font-medium text-on-surface truncate max-w-[160px] sm:max-w-[240px]">
        {doc.name}
      </span>

      {/* Page navigation — uses local state so typing works correctly */}
      <PageInput
        page={activeTab.page}
        pageCount={doc.pageCount}
        onCommit={p => updateTab(activeTab.id, { page: p })}
      />
    </footer>
  );
}

// ─── PageInput ────────────────────────────────────────────────────────────────
// Separate component so it can hold local draft state independently of the
// store.  The draft is a plain string so the user can freely edit it; it's
// only validated and committed when they press Enter or leave the field.

interface PageInputProps {
  page: number;
  pageCount: number;
  onCommit: (page: number) => void;
}

function PageInput({ page, pageCount, onCommit }: PageInputProps) {
  const [draft, setDraft] = useState(String(page));

  // Keep the draft in sync when the page changes externally (e.g. scrolling).
  // We only overwrite when the input is NOT focused so we don't interrupt typing.
  useEffect(() => {
    setDraft(String(page));
  }, [page]);

  const commit = (raw: string) => {
    const val = parseInt(raw, 10);
    if (val >= 1 && val <= pageCount) {
      onCommit(val);
    } else {
      // Invalid — reset display to current page without navigating
      setDraft(String(page));
    }
  };

  return (
    <div className="flex items-center gap-1.5 ml-auto">
      <span>Page</span>
      <input
        type="number"
        min={1}
        max={pageCount}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            commit((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === 'Escape') {
            setDraft(String(page));
            (e.target as HTMLInputElement).blur();
          }
        }}
        onBlur={e => commit(e.target.value)}
        onFocus={e => e.target.select()}
        className="w-14 h-7 px-1.5 text-center text-xs rounded-lg bg-surface-2 border border-border text-on-surface focus:border-brand-500 focus:outline-none"
      />
      <span>of {pageCount}</span>
    </div>
  );
}
