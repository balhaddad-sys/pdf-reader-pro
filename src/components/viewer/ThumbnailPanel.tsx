import { useEffect, useState, memo } from 'react';
import { useDocumentStore } from '@/stores/documentStore';
import { renderPageThumbnail } from '@/utils/pdf';
import { cn } from '@/utils/helpers';

export function ThumbnailPanel() {
  const tabs = useDocumentStore(s => s.tabs);
  const activeTabId = useDocumentStore(s => s.activeTabId);
  const updateTab = useDocumentStore(s => s.updateTab);
  const getPdfInstance = useDocumentStore(s => s.getPdfInstance);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const pdf = activeTab ? getPdfInstance(activeTab.documentId) : null;

  if (!pdf || !activeTab) return null;

  const pages = Array.from({ length: pdf.numPages }, (_, i) => i + 1);

  return (
    <div className="p-2 flex flex-col gap-2">
      {pages.map(pageNum => (
        <ThumbnailItem
          key={pageNum}
          pageNumber={pageNum}
          documentId={activeTab.documentId}
          isActive={pageNum === activeTab.page}
          onClick={() => updateTab(activeTab.id, { page: pageNum })}
        />
      ))}
    </div>
  );
}

interface ThumbnailItemProps {
  pageNumber: number;
  documentId: string;
  isActive: boolean;
  onClick: () => void;
}

const ThumbnailItem = memo(function ThumbnailItem({
  pageNumber,
  documentId,
  isActive,
  onClick,
}: ThumbnailItemProps) {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const getPdfInstance = useDocumentStore(s => s.getPdfInstance);

  useEffect(() => {
    let cancelled = false;
    const pdf = getPdfInstance(documentId);
    if (!pdf) return;

    pdf.getPage(pageNumber).then(page => {
      if (cancelled) return;
      return renderPageThumbnail(page, 160);
    }).then(dataUrl => {
      if (cancelled && dataUrl) return;
      if (dataUrl) setThumbnail(dataUrl);
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [documentId, pageNumber, getPdfInstance]);

  return (
    <button
      onClick={onClick}
      className={cn(
        'relative rounded-lg overflow-hidden transition-all',
        'border-2',
        isActive
          ? 'border-brand-500 shadow-glow'
          : 'border-transparent hover:border-border-strong',
      )}
    >
      {thumbnail ? (
        <img src={thumbnail} alt={`Page ${pageNumber}`} className="w-full" />
      ) : (
        <div className="aspect-[3/4] bg-surface-3 animate-pulse-slow" />
      )}
      <div className={cn(
        'absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-2xs font-medium',
        isActive
          ? 'bg-brand-500 text-white'
          : 'bg-black/50 text-white/80',
      )}>
        {pageNumber}
      </div>
    </button>
  );
});
