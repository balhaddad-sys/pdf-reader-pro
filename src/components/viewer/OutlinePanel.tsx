import { useEffect, useState } from 'react';
import { ChevronRight, FileText } from 'lucide-react';
import { useDocumentStore } from '@/stores/documentStore';
import { getOutline, getDestinationPage, type OutlineNode } from '@/utils/pdf';
import { cn } from '@/utils/helpers';

export function OutlinePanel() {
  const [outline, setOutline] = useState<OutlineNode[]>([]);
  const [loading, setLoading] = useState(true);
  const tabs = useDocumentStore(s => s.tabs);
  const activeTabId = useDocumentStore(s => s.activeTabId);
  const getPdfInstance = useDocumentStore(s => s.getPdfInstance);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const pdf = activeTab ? getPdfInstance(activeTab.documentId) : null;

  useEffect(() => {
    if (!pdf) return;
    setLoading(true);
    getOutline(pdf).then(items => {
      setOutline(items);
      setLoading(false);
    });
  }, [pdf]);

  if (loading) {
    return (
      <div className="p-4 flex justify-center">
        <div className="w-5 h-5 border-2 border-brand-400 border-t-transparent rounded-full animate-spinner" />
      </div>
    );
  }

  if (outline.length === 0) {
    return (
      <div className="p-6 text-center">
        <FileText size={24} className="text-on-surface-secondary mx-auto mb-2" />
        <p className="text-xs text-on-surface-secondary">No outline available</p>
      </div>
    );
  }

  return (
    <div className="py-1">
      {outline.map((item, idx) => (
        <OutlineItem key={idx} item={item} depth={0} />
      ))}
    </div>
  );
}

function OutlineItem({ item, depth }: { item: OutlineNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const tabs = useDocumentStore(s => s.tabs);
  const activeTabId = useDocumentStore(s => s.activeTabId);
  const updateTab = useDocumentStore(s => s.updateTab);
  const getPdfInstance = useDocumentStore(s => s.getPdfInstance);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const pdf = activeTab ? getPdfInstance(activeTab.documentId) : null;
  const hasChildren = item.items.length > 0;

  const handleClick = async () => {
    if (!pdf || !activeTab) return;
    const page = await getDestinationPage(pdf, item.dest);
    updateTab(activeTab.id, { page: page + 1 });
  };

  return (
    <div>
      <button
        className={cn(
          'w-full flex items-center gap-1 py-1.5 px-3 text-xs text-left transition-colors',
          'text-on-surface-secondary hover:text-on-surface hover:bg-white/5',
        )}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={handleClick}
      >
        {hasChildren && (
          <span
            className="w-4 h-4 flex items-center justify-center shrink-0"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          >
            <ChevronRight
              size={12}
              className={cn('transition-transform', expanded && 'rotate-90')}
            />
          </span>
        )}
        {!hasChildren && <span className="w-4 shrink-0" />}
        <span className="truncate">{item.title}</span>
      </button>
      {hasChildren && expanded && (
        <div>
          {item.items.map((child, idx) => (
            <OutlineItem key={idx} item={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
