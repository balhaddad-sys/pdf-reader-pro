import { Bookmark, Trash2 } from 'lucide-react';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useDocumentStore } from '@/stores/documentStore';
import { cn } from '@/utils/helpers';

export function BookmarkPanel() {
  const bookmarks = useAnnotationStore(s => s.bookmarks);
  const removeBookmark = useAnnotationStore(s => s.removeBookmark);
  const tabs = useDocumentStore(s => s.tabs);
  const activeTabId = useDocumentStore(s => s.activeTabId);
  const updateTab = useDocumentStore(s => s.updateTab);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const sorted = [...bookmarks].sort((a, b) => a.page - b.page);

  if (sorted.length === 0) {
    return (
      <div className="p-6 text-center">
        <Bookmark size={24} className="text-on-surface-secondary mx-auto mb-2" />
        <p className="text-xs text-on-surface-secondary">No bookmarks yet</p>
        <p className="text-2xs text-on-surface-secondary mt-1">Press Ctrl+D to bookmark a page</p>
      </div>
    );
  }

  return (
    <div className="py-1">
      {sorted.map(bookmark => (
        <div
          key={bookmark.id}
          className={cn(
            'group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors',
            'hover:bg-white/5',
            activeTab?.page === bookmark.page && 'bg-brand-500/10',
          )}
          onClick={() => activeTab && updateTab(activeTab.id, { page: bookmark.page })}
        >
          <Bookmark
            size={14}
            fill="currentColor"
            className="text-brand-400 shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-on-surface truncate">{bookmark.label}</p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); removeBookmark(bookmark.id); }}
            className="w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all"
          >
            <Trash2 size={12} className="text-on-surface-secondary" />
          </button>
        </div>
      ))}
    </div>
  );
}
