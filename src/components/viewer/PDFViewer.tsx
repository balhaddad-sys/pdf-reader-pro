import { useRef, useEffect, useCallback, useState } from 'react';
import { useDocumentStore } from '@/stores/documentStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useUIStore } from '@/stores/uiStore';
import { PageRenderer } from './PageRenderer';
import { AnnotationToolbar } from '@/components/annotations/AnnotationToolbar';
import { SearchPanel } from './SearchPanel';
import { DrawingCanvas } from '@/components/annotations/DrawingCanvas';
import { cn, debounce, clamp } from '@/utils/helpers';

export function PDFViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const tabs = useDocumentStore(s => s.tabs);
  const activeTabId = useDocumentStore(s => s.activeTabId);
  const updateTab = useDocumentStore(s => s.updateTab);
  const getPdfInstance = useDocumentStore(s => s.getPdfInstance);
  const loadAnnotations = useAnnotationStore(s => s.loadAnnotations);
  const loadBookmarks = useAnnotationStore(s => s.loadBookmarks);
  const searchOpen = useUIStore(s => s.searchOpen);
  const activeTool = useUIStore(s => s.activeTool);
  const focusMode = useUIStore(s => s.focusMode);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const pdf = activeTab ? getPdfInstance(activeTab.documentId) : null;
  const [, setPageElements] = useState<Map<number, HTMLDivElement>>(new Map());

  // Load annotations when document changes
  useEffect(() => {
    if (activeTab) {
      loadAnnotations(activeTab.documentId);
      loadBookmarks(activeTab.documentId);
    }
  }, [activeTab?.documentId, loadAnnotations, loadBookmarks]);

  // Track scroll position to update current page
  const handleScroll = useCallback(
    debounce(() => {
      if (!containerRef.current || !activeTab) return;
      const container = containerRef.current;
      const scrollTop = container.scrollTop;
      const containerHeight = container.clientHeight;
      const midPoint = scrollTop + containerHeight / 3;

      // Find which page is most visible
      const pages = container.querySelectorAll('[data-page-number]');
      let currentPage = 1;

      pages.forEach(page => {
        const rect = page.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const pageTop = rect.top - containerRect.top + scrollTop;

        if (pageTop <= midPoint) {
          currentPage = parseInt(page.getAttribute('data-page-number') || '1', 10);
        }
      });

      if (currentPage !== activeTab.page) {
        updateTab(activeTab.id, { page: currentPage });
      }
    }, 100),
    [activeTab, updateTab],
  );

  // Scroll to page when page changes from external source (status bar, thumbnails)
  useEffect(() => {
    if (!containerRef.current || !activeTab) return;
    const pageEl = containerRef.current.querySelector(`[data-page-number="${activeTab.page}"]`);
    if (pageEl) {
      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      const pageRect = pageEl.getBoundingClientRect();
      const relativeTop = pageRect.top - containerRect.top + container.scrollTop;

      // Only scroll if the page is not already in view
      if (pageRect.top < containerRect.top || pageRect.bottom > containerRect.bottom) {
        container.scrollTo({ top: relativeTop - 20, behavior: 'smooth' });
      }
    }
  }, [activeTab?.page]);

  // Keyboard zoom
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!activeTab) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        const newZoom = clamp(activeTab.zoom + 0.1, 0.25, 4);
        updateTab(activeTab.id, { zoom: Math.round(newZoom * 100) / 100 });
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        const newZoom = clamp(activeTab.zoom - 0.1, 0.25, 4);
        updateTab(activeTab.id, { zoom: Math.round(newZoom * 100) / 100 });
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        updateTab(activeTab.id, { zoom: 1 });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, updateTab]);

  // Mouse wheel zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (!activeTab || !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      const newZoom = clamp(activeTab.zoom + delta, 0.25, 4);
      updateTab(activeTab.id, { zoom: Math.round(newZoom * 100) / 100 });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [activeTab, updateTab]);

  const registerPage = useCallback((pageNum: number, el: HTMLDivElement | null) => {
    setPageElements(prev => {
      const next = new Map(prev);
      if (el) {
        next.set(pageNum, el);
      } else {
        next.delete(pageNum);
      }
      return next;
    });
  }, []);

  if (!pdf || !activeTab) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface-0">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-surface-2 flex items-center justify-center mx-auto mb-3 animate-pulse-slow">
            <div className="w-5 h-5 border-2 border-brand-400 border-t-transparent rounded-full animate-spinner" />
          </div>
          <p className="text-sm text-on-surface-secondary">Loading document...</p>
        </div>
      </div>
    );
  }

  const pageNumbers = Array.from({ length: pdf.numPages }, (_, i) => i + 1);
  const isDrawingMode = activeTool === 'freehand' || activeTool === 'eraser' || activeTool === 'shape';

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden">
      {searchOpen && <SearchPanel />}

      <div
        ref={containerRef}
        className={cn(
          'flex-1 overflow-y-auto overflow-x-auto',
          'bg-surface-0',
          isDrawingMode && 'cursor-crosshair',
        )}
        onScroll={handleScroll}
      >
        <div className={cn(
          'flex flex-col items-center gap-4 py-6 min-h-full',
          focusMode && 'py-2 gap-2',
        )}>
          {pageNumbers.map(pageNum => (
            <div
              key={pageNum}
              data-page-number={pageNum}
              ref={el => registerPage(pageNum, el)}
              className="relative shadow-elevation-2 bg-white"
              style={{ transform: `scale(1)` }}
            >
              <PageRenderer
                pdf={pdf}
                pageNumber={pageNum}
                zoom={activeTab.zoom}
              />
              {isDrawingMode && (
                <DrawingCanvas
                  pageNumber={pageNum}
                  zoom={activeTab.zoom}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <AnnotationToolbar />
    </div>
  );
}
