import { X, FileText } from 'lucide-react';
import { useDocumentStore } from '@/stores/documentStore';
import { cn } from '@/utils/helpers';

export function TabBar() {
  const tabs = useDocumentStore(s => s.tabs);
  const activeTabId = useDocumentStore(s => s.activeTabId);
  const setActiveTab = useDocumentStore(s => s.setActiveTab);
  const closeTab = useDocumentStore(s => s.closeTab);

  if (tabs.length <= 1) return null;

  return (
    <div className="h-9 flex items-end bg-surface-1 border-b border-border overflow-x-auto shrink-0 px-1">
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={cn(
            'group relative flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-t-lg transition-all',
            'min-w-[120px] max-w-[200px]',
            tab.id === activeTabId
              ? 'bg-surface-0 text-on-surface border-t border-x border-border'
              : 'text-on-surface-secondary hover:text-on-surface hover:bg-white/5',
          )}
          onClick={() => setActiveTab(tab.id)}
        >
          <FileText size={12} className="shrink-0 opacity-50" />
          <span className="truncate flex-1 text-left">{tab.name}</span>
          <span
            role="button"
            className={cn(
              'w-5 h-5 rounded-md flex items-center justify-center shrink-0',
              'opacity-0 group-hover:opacity-100 hover:bg-white/15 transition-all',
              tab.id === activeTabId && 'opacity-50',
            )}
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
          >
            <X size={12} />
          </span>
        </button>
      ))}
    </div>
  );
}
