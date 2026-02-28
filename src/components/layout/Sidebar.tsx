import {
  Image, List, Bookmark, MessageSquare,
} from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useDocumentStore } from '@/stores/documentStore';
import { ThumbnailPanel } from '@/components/viewer/ThumbnailPanel';
import { OutlinePanel } from '@/components/viewer/OutlinePanel';
import { BookmarkPanel } from '@/components/viewer/BookmarkPanel';
import { AnnotationPanel } from '@/components/viewer/AnnotationPanel';
import { cn } from '@/utils/helpers';
import type { SidebarPanel } from '@/types';

const panels: { id: SidebarPanel; icon: typeof Image; label: string }[] = [
  { id: 'thumbnails', icon: Image, label: 'Pages' },
  { id: 'outline', icon: List, label: 'Outline' },
  { id: 'bookmarks', icon: Bookmark, label: 'Bookmarks' },
  { id: 'annotations', icon: MessageSquare, label: 'Annotations' },
];

export function Sidebar() {
  const sidebarOpen = useUIStore(s => s.sidebarOpen);
  const sidebarPanel = useUIStore(s => s.sidebarPanel);
  const setSidebarPanel = useUIStore(s => s.setSidebarPanel);
  const activeTabId = useDocumentStore(s => s.activeTabId);
  const tabs = useDocumentStore(s => s.tabs);

  const activeTab = tabs.find(t => t.id === activeTabId);

  if (!sidebarOpen || !activeTab) return null;

  return (
    <aside className="w-64 bg-surface-1 border-r border-border flex shrink-0 animate-slide-in-right overflow-hidden">
      {/* Icon strip */}
      <div className="w-11 bg-surface-1 border-r border-border flex flex-col items-center py-2 gap-1 shrink-0">
        {panels.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setSidebarPanel(id)}
            className={cn(
              'w-9 h-9 rounded-xl flex items-center justify-center transition-all',
              sidebarPanel === id
                ? 'bg-brand-500/20 text-brand-400'
                : 'text-on-surface-secondary hover:text-on-surface hover:bg-white/10',
            )}
            title={label}
          >
            <Icon size={16} />
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-hidden flex flex-col min-w-0">
        <div className="px-3 py-2.5 border-b border-border shrink-0">
          <h3 className="text-xs font-semibold text-on-surface-secondary uppercase tracking-wider">
            {panels.find(p => p.id === sidebarPanel)?.label}
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {sidebarPanel === 'thumbnails' && <ThumbnailPanel />}
          {sidebarPanel === 'outline' && <OutlinePanel />}
          {sidebarPanel === 'bookmarks' && <BookmarkPanel />}
          {sidebarPanel === 'annotations' && <AnnotationPanel />}
        </div>
      </div>
    </aside>
  );
}
