import { MessageSquare, Highlighter, Underline, Strikethrough, Pencil, Trash2, Type } from 'lucide-react';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useDocumentStore } from '@/stores/documentStore';
import { formatDate, cn } from '@/utils/helpers';
import type { AnnotationType } from '@/types';

const typeIcons: Record<AnnotationType, typeof Highlighter> = {
  highlight: Highlighter,
  underline: Underline,
  strikethrough: Strikethrough,
  note: MessageSquare,
  freehand: Pencil,
  shape: Type,
  text: Type,
};

const typeLabels: Record<AnnotationType, string> = {
  highlight: 'Highlight',
  underline: 'Underline',
  strikethrough: 'Strikethrough',
  note: 'Note',
  freehand: 'Drawing',
  shape: 'Shape',
  text: 'Text',
};

export function AnnotationPanel() {
  const annotations = useAnnotationStore(s => s.annotations);
  const removeAnnotation = useAnnotationStore(s => s.removeAnnotation);
  const tabs = useDocumentStore(s => s.tabs);
  const activeTabId = useDocumentStore(s => s.activeTabId);
  const updateTab = useDocumentStore(s => s.updateTab);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const sorted = [...annotations].sort((a, b) => a.page - b.page || a.createdAt - b.createdAt);

  // Group by page
  const byPage = sorted.reduce<Record<number, typeof sorted>>((acc, ann) => {
    (acc[ann.page] ??= []).push(ann);
    return acc;
  }, {});

  if (annotations.length === 0) {
    return (
      <div className="p-6 text-center">
        <MessageSquare size={24} className="text-on-surface-secondary mx-auto mb-2" />
        <p className="text-xs text-on-surface-secondary">No annotations yet</p>
        <p className="text-2xs text-on-surface-secondary mt-1">Select text or use the toolbar to annotate</p>
      </div>
    );
  }

  return (
    <div className="py-2">
      {Object.entries(byPage).map(([pageStr, anns]) => {
        const page = parseInt(pageStr, 10);
        return (
          <div key={page} className="mb-3">
            <button
              className="w-full px-3 py-1 text-2xs font-semibold text-on-surface-secondary uppercase tracking-wider text-left hover:text-on-surface transition-colors"
              onClick={() => activeTab && updateTab(activeTab.id, { page })}
            >
              Page {page}
            </button>
            {anns.map(ann => {
              const Icon = typeIcons[ann.type];
              return (
                <div
                  key={ann.id}
                  className="group flex items-start gap-2 px-3 py-2 hover:bg-white/5 transition-colors cursor-pointer"
                  onClick={() => activeTab && updateTab(activeTab.id, { page: ann.page })}
                >
                  <div
                    className="w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5"
                    style={{ backgroundColor: ann.color + '30' }}
                  >
                    <Icon size={10} style={{ color: ann.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-on-surface">
                      {ann.selectedText
                        ? `"${ann.selectedText.slice(0, 60)}${ann.selectedText.length > 60 ? '...' : ''}"`
                        : typeLabels[ann.type]}
                    </p>
                    {ann.content && (
                      <p className="text-2xs text-on-surface-secondary mt-0.5 truncate">{ann.content}</p>
                    )}
                    <p className="text-2xs text-on-surface-secondary mt-0.5">{formatDate(ann.createdAt)}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeAnnotation(ann.id); }}
                    className={cn(
                      'w-5 h-5 rounded flex items-center justify-center shrink-0',
                      'opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all',
                    )}
                  >
                    <Trash2 size={10} className="text-on-surface-secondary" />
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
