import { useState } from 'react';
import { Star, MoreVertical, Trash2, FileText, Clock } from 'lucide-react';
import { useDocumentStore } from '@/stores/documentStore';
import { useUIStore } from '@/stores/uiStore';
import { formatFileSize, formatDate, cn } from '@/utils/helpers';
import type { PDFDocument, LibraryLayout } from '@/types';

interface DocumentCardProps {
  document: PDFDocument;
  layout: LibraryLayout;
  onOpen: () => void;
}

export function DocumentCard({ document, layout, onOpen }: DocumentCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleFavorite = useDocumentStore(s => s.toggleFavorite);
  const removeDocument = useDocumentStore(s => s.removeDocument);
  const addToast = useUIStore(s => s.addToast);

  const handleDelete = async () => {
    setMenuOpen(false);
    await removeDocument(document.id);
    addToast(`Deleted "${document.name}"`, 'info');
  };

  if (layout === 'list') {
    return (
      <div
        className={cn(
          'group flex items-center gap-4 px-4 py-3 rounded-xl transition-all cursor-pointer',
          'hover:bg-surface-2 active:bg-surface-3',
        )}
        onClick={onOpen}
      >
        {/* Thumbnail */}
        <div className="w-10 h-13 rounded-lg bg-surface-3 overflow-hidden shrink-0 flex items-center justify-center shadow-sm">
          {document.thumbnail ? (
            <img src={document.thumbnail} alt="" className="w-full h-full object-cover" />
          ) : (
            <FileText size={16} className="text-on-surface-secondary" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-on-surface truncate">{document.name}</h3>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-2xs text-on-surface-secondary">{document.pageCount} pages</span>
            <span className="text-2xs text-on-surface-secondary">{formatFileSize(document.size)}</span>
            <span className="text-2xs text-on-surface-secondary flex items-center gap-1">
              <Clock size={10} />
              {formatDate(document.lastOpenedAt)}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); toggleFavorite(document.id); }}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10"
          >
            <Star size={14} fill={document.favorite ? 'currentColor' : 'none'} className={document.favorite ? 'text-yellow-400' : 'text-on-surface-secondary'} />
          </button>
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10"
            >
              <MoreVertical size={14} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
                <div className="absolute right-0 top-full mt-1 w-40 bg-surface-3 border border-border rounded-xl shadow-elevation-3 z-20 py-1 animate-scale-in">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 size={14} />
                    Delete document
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Grid layout
  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-2xl transition-all cursor-pointer',
        'bg-surface-2 hover:bg-surface-3 active:scale-[0.98]',
        'border border-border hover:border-border-strong',
        'shadow-elevation-1 hover:shadow-elevation-2',
      )}
      onClick={onOpen}
    >
      {/* Thumbnail */}
      <div className="relative aspect-[3/4] rounded-t-2xl overflow-hidden bg-surface-3">
        {document.thumbnail ? (
          <img src={document.thumbnail} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="flex items-center justify-center w-full h-full">
            <FileText size={32} className="text-on-surface-secondary" />
          </div>
        )}

        {/* Progress bar */}
        {document.lastPage > 1 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
            <div
              className="h-full bg-brand-500 transition-all"
              style={{ width: `${(document.lastPage / document.pageCount) * 100}%` }}
            />
          </div>
        )}

        {/* Favorite badge */}
        {document.favorite && (
          <div className="absolute top-2 right-2">
            <Star size={14} fill="currentColor" className="text-yellow-400 drop-shadow-md" />
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
      </div>

      {/* Info */}
      <div className="px-3 py-2.5">
        <h3 className="text-xs font-medium text-on-surface truncate leading-tight">{document.name}</h3>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-2xs text-on-surface-secondary">{document.pageCount}p</span>
          <span className="text-2xs text-on-surface-secondary">{formatFileSize(document.size)}</span>
        </div>
      </div>

      {/* Context menu trigger */}
      <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            className="w-7 h-7 rounded-lg bg-black/40 backdrop-blur-sm flex items-center justify-center hover:bg-black/60 text-white"
          >
            <MoreVertical size={12} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
              <div className="absolute left-0 top-full mt-1 w-40 bg-surface-3 border border-border rounded-xl shadow-elevation-3 z-20 py-1 animate-scale-in">
                <button
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(document.id); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-on-surface-secondary hover:text-on-surface hover:bg-white/5 transition-colors"
                >
                  <Star size={14} fill={document.favorite ? 'currentColor' : 'none'} />
                  {document.favorite ? 'Unfavorite' : 'Favorite'}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
