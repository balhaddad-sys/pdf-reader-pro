import { useRef, useCallback, useEffect } from 'react';
import {
  Image, List, Bookmark, MessageSquare, X,
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
  const toggleSidebar = useUIStore(s => s.toggleSidebar);
  const sidebarPanel = useUIStore(s => s.sidebarPanel);
  const setSidebarPanel = useUIStore(s => s.setSidebarPanel);
  const activeTabId = useDocumentStore(s => s.activeTabId);
  const tabs = useDocumentStore(s => s.tabs);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const panelRef = useRef<HTMLElement>(null);

  // ── Swipe-to-close on mobile ───────────────────────────────────────────────
  const dragRef = useRef({ startX: 0, dragging: false });

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    dragRef.current = { startX: e.touches[0].clientX, dragging: true };
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragRef.current.dragging || !panelRef.current) return;
    const dx = dragRef.current.startX - e.touches[0].clientX;
    if (dx > 0) panelRef.current.style.transform = `translateX(${-dx}px)`;
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!dragRef.current.dragging || !panelRef.current) return;
    const dx = dragRef.current.startX - e.changedTouches[0].clientX;
    dragRef.current.dragging = false;
    panelRef.current.style.transform = '';
    if (dx > 80) toggleSidebar();
  }, [toggleSidebar]);

  // Close sidebar on Escape
  useEffect(() => {
    if (!sidebarOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') toggleSidebar();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sidebarOpen, toggleSidebar]);

  if (!sidebarOpen || !activeTab) return null;

  return (
    <>
      {/* Mobile backdrop — only on small screens */}
      <div
        className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px] animate-fade-in sm:hidden"
        onClick={toggleSidebar}
      />

      {/* Sidebar panel */}
      <aside
        ref={panelRef}
        className={cn(
          // Mobile: full overlay from left edge, wider
          'fixed top-0 left-0 bottom-0 z-40 w-[280px] max-w-[85vw]',
          // Desktop: static in the layout
          'sm:static sm:z-auto sm:w-64 sm:max-w-none',
          'bg-surface-1 border-r border-border flex shrink-0 animate-slide-in-left overflow-hidden',
        )}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Icon strip */}
        <div className="w-12 sm:w-11 bg-surface-1 border-r border-border flex flex-col items-center py-2 gap-1 shrink-0">
          {panels.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setSidebarPanel(id)}
              className={cn(
                'w-10 h-10 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center transition-all',
                sidebarPanel === id
                  ? 'bg-brand-500/20 text-brand-400'
                  : 'text-on-surface-secondary hover:text-on-surface hover:bg-white/10',
              )}
              title={label}
            >
              <Icon size={18} className="sm:w-4 sm:h-4" />
            </button>
          ))}

          {/* Mobile close button at bottom of icon strip */}
          <div className="mt-auto sm:hidden">
            <button
              onClick={toggleSidebar}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-on-surface-secondary hover:text-on-surface hover:bg-white/10 transition-all"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Panel content */}
        <div className="flex-1 overflow-hidden flex flex-col min-w-0">
          <div className="px-3 py-2.5 border-b border-border shrink-0 flex items-center justify-between">
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
    </>
  );
}
