import { useRef, useEffect, useCallback, useState, memo } from 'react';
import { useDocumentStore } from '@/stores/documentStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useUIStore } from '@/stores/uiStore';
import { PageRenderer } from './PageRenderer';
import { AnnotationToolbar } from '@/components/annotations/AnnotationToolbar';
import { SearchPanel } from './SearchPanel';
import { DrawingCanvas } from '@/components/annotations/DrawingCanvas';
import { SignatureDialog } from '@/components/annotations/SignatureDialog';
import { StampPicker } from '@/components/annotations/StampPicker';
import { cn, debounce, clamp } from '@/utils/helpers';
import type { PDFDocumentProxy } from '@/utils/pdf';

// ─── Virtual Page ─────────────────────────────────────────────────────────────
// Lazy-renders the PDF page only when near the scroll container's visible area.
// The scroll container (not the window) is passed as the IntersectionObserver
// root so that overflow-clipped pages are detected correctly.

interface VirtualPageProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
  isDrawingMode: boolean;
  pageDimensions: Map<number, { width: number; height: number }>;
  /** The scroll container — required for correct IntersectionObserver root */
  scrollRoot: HTMLDivElement | null;
  /** Seed the first N pages as visible without waiting for the observer */
  initialVisible: boolean;
}

const VirtualPage = memo(function VirtualPage({
  pdf,
  pageNumber,
  zoom,
  isDrawingMode,
  pageDimensions,
  scrollRoot,
  initialVisible,
}: VirtualPageProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Start visible for the first pages so the document is never blank on open
  const [shouldRender, setShouldRender] = useState(initialVisible);

  useEffect(() => {
    if (shouldRender) return; // already rendered — no need to observe
    const el = wrapperRef.current;
    if (!el || !scrollRoot) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setShouldRender(true);
        // Never unrender once visible — avoids blank flash on scroll-back
      },
      // Use the scroll container as root so rootMargin works relative to it
      { root: scrollRoot, rootMargin: '400px 0px', threshold: 0 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollRoot, shouldRender]);

  const dims = pageDimensions.get(pageNumber);
  const w = dims ? `${dims.width}px` : '595px';
  const h = dims ? `${dims.height}px` : '842px';

  return (
    <div
      data-page-number={pageNumber}
      ref={wrapperRef}
      className="relative shadow-elevation-2 bg-white"
      style={{ width: w, height: h }}
    >
      {shouldRender ? (
        <>
          <PageRenderer pdf={pdf} pageNumber={pageNumber} zoom={zoom} />
          {isDrawingMode && (
            <DrawingCanvas pageNumber={pageNumber} zoom={zoom} />
          )}
        </>
      ) : (
        <div className="absolute inset-0 bg-white" />
      )}
    </div>
  );
});

// ─── Main PDFViewer ───────────────────────────────────────────────────────────

// How many pages to pre-render immediately on open (before IntersectionObserver kicks in)
const INITIAL_PAGES = 5;

export function PDFViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  // Keep a state copy of the container so VirtualPage gets it after mount
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);

  const tabs = useDocumentStore(s => s.tabs);
  const activeTabId = useDocumentStore(s => s.activeTabId);
  const updateTab = useDocumentStore(s => s.updateTab);
  const getPdfInstance = useDocumentStore(s => s.getPdfInstance);
  const loadAnnotations = useAnnotationStore(s => s.loadAnnotations);
  const loadBookmarks = useAnnotationStore(s => s.loadBookmarks);
  const searchOpen = useUIStore(s => s.searchOpen);
  const activeTool = useUIStore(s => s.activeTool);
  const focusMode = useUIStore(s => s.focusMode);
  const signatureDialogOpen = useUIStore(s => s.signatureDialogOpen);
  const stampPickerOpen = useUIStore(s => s.stampPickerOpen);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const pdf = activeTab ? getPdfInstance(activeTab.documentId) : null;

  // Stable ref so touch handlers always see the latest tab without re-adding listeners
  const activeTabRef = useRef(activeTab);
  useEffect(() => { activeTabRef.current = activeTab; });

  // Callback ref: captures the container element the moment it mounts
  // so IntersectionObserver can use it as root immediately
  const containerRefCallback = useCallback((el: HTMLDivElement | null) => {
    containerRef.current = el;
    setScrollRoot(el);
  }, []);

  // Pre-calculate all page dimensions (lightweight — just viewport geometry, no rendering)
  const [pageDimensions, setPageDimensions] = useState<Map<number, { width: number; height: number }>>(new Map());

  useEffect(() => {
    if (!pdf || !activeTab) return;
    let cancelled = false;

    // Load first page synchronously then rest progressively
    const loadDimensions = async () => {
      const dims = new Map<number, { width: number; height: number }>();
      for (let i = 1; i <= pdf.numPages; i++) {
        if (cancelled) return;
        try {
          const page = await pdf.getPage(i);
          const vp = page.getViewport({ scale: activeTab.zoom });
          dims.set(i, { width: vp.width, height: vp.height });
          // Update state every 10 pages so placeholders resize progressively
          if (i % 10 === 0 && !cancelled) {
            setPageDimensions(new Map(dims));
          }
        } catch { /* ignore */ }
      }
      if (!cancelled) setPageDimensions(new Map(dims));
    };

    loadDimensions();
    return () => { cancelled = true; };
  }, [pdf, activeTab?.documentId, activeTab?.zoom]);

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
      const midPoint = scrollTop + container.clientHeight / 3;

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

  // Scroll to page when page changes from external source
  useEffect(() => {
    if (!containerRef.current || !activeTab) return;
    const pageEl = containerRef.current.querySelector(`[data-page-number="${activeTab.page}"]`);
    if (pageEl) {
      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      const pageRect = pageEl.getBoundingClientRect();
      const relativeTop = pageRect.top - containerRect.top + container.scrollTop;
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
        updateTab(activeTab.id, { zoom: clamp(Math.round((activeTab.zoom + 0.1) * 100) / 100, 0.25, 4) });
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        updateTab(activeTab.id, { zoom: clamp(Math.round((activeTab.zoom - 0.1) * 100) / 100, 0.25, 4) });
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        updateTab(activeTab.id, { zoom: 1 });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, updateTab]);

  // Mouse wheel zoom with focal-point scroll (Ctrl+wheel also handles Chrome Android pinch).
  // Uses activeTabRef so the listener is only attached once — no churn on every zoom change.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const tab = activeTabRef.current;
      if (!tab) return;
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const oldZoom = tab.zoom;
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const newZoom = clamp(Math.round((oldZoom + delta) * 100) / 100, 0.25, 4);
      if (newZoom === oldZoom) return;
      // Content-space position of the cursor (PDF units, independent of zoom)
      const contentX = (mouseX + container.scrollLeft) / oldZoom;
      const contentY = (mouseY + container.scrollTop) / oldZoom;
      updateTab(tab.id, { zoom: newZoom });
      // After React re-renders at the new zoom, scroll so the focal point stays put
      requestAnimationFrame(() => {
        container.scrollLeft = Math.max(0, contentX * newZoom - mouseX);
        container.scrollTop  = Math.max(0, contentY * newZoom - mouseY);
      });
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [updateTab]); // activeTab read via activeTabRef — no re-subscription on each zoom change

  // Pinch-to-zoom: locks in the content-space position of the pinch centre at
  // touchStart so every subsequent move applies an *absolute* scale — avoids the
  // stale-zoom bug even when React state updates lag behind.
  // touchmove is intentionally non-passive so e.preventDefault() can stop the
  // browser's own pinch-zoom / scroll during a two-finger gesture.
  useEffect(() => {
    const container = scrollRoot;
    if (!container) return;

    let pinchActive  = false;
    let pinchDist    = 0;
    let pinchZoom    = 1;
    let pinchContentX = 0; // content-space coords of the pinch midpoint
    let pinchContentY = 0;
    let pinchScreenX  = 0; // screen coords of the pinch midpoint
    let pinchScreenY  = 0;

    const getDist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchActive = true;
        pinchDist   = getDist(e.touches);
        pinchZoom   = activeTabRef.current?.zoom ?? 1;
        const containerEl = container as HTMLDivElement;
        const r = containerEl.getBoundingClientRect();
        pinchScreenX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        pinchScreenY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        // Lock the content-space position of the pinch centre so all subsequent
        // move events reference the same anchor — no cumulative drift.
        pinchContentX = (pinchScreenX - r.left + containerEl.scrollLeft) / pinchZoom;
        pinchContentY = (pinchScreenY - r.top  + containerEl.scrollTop)  / pinchZoom;
      } else {
        pinchActive = false;
        pinchDist   = 0;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pinchActive || e.touches.length !== 2 || pinchDist === 0) return;
      e.preventDefault(); // Block native scroll / browser zoom during the gesture
      const scale   = getDist(e.touches) / pinchDist;
      const newZoom = clamp(Math.round(pinchZoom * scale * 100) / 100, 0.25, 4);
      const tab     = activeTabRef.current;
      if (!tab) return;
      const containerEl = container as HTMLDivElement;
      const r = containerEl.getBoundingClientRect();
      // Scroll so the locked content point stays under the pinch centre
      const targetLeft = pinchContentX * newZoom - (pinchScreenX - r.left);
      const targetTop  = pinchContentY * newZoom - (pinchScreenY - r.top);
      updateTab(tab.id, { zoom: newZoom });
      requestAnimationFrame(() => {
        containerEl.scrollLeft = Math.max(0, targetLeft);
        containerEl.scrollTop  = Math.max(0, targetTop);
      });
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) { pinchActive = false; pinchDist = 0; }
    };

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove',  onTouchMove,  { passive: false });
    container.addEventListener('touchend',   onTouchEnd,   { passive: true });
    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove',  onTouchMove);
      container.removeEventListener('touchend',   onTouchEnd);
    };
  }, [scrollRoot, updateTab]);

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
  const isDrawingMode = activeTool === 'freehand' || activeTool === 'eraser' || activeTool === 'shape'
    || activeTool === 'text' || activeTool === 'note' || activeTool === 'signature' || activeTool === 'stamp';

  // Determine initial starting page (resume position)
  const startPage = activeTab.page;

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden">
      {searchOpen && <SearchPanel />}

      <div
        ref={containerRefCallback}
        className={cn(
          'flex-1 min-h-0 overflow-y-auto overflow-x-auto',
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
            <VirtualPage
              key={pageNum}
              pdf={pdf}
              pageNumber={pageNum}
              zoom={activeTab.zoom}
              isDrawingMode={isDrawingMode}
              pageDimensions={pageDimensions}
              scrollRoot={scrollRoot}
              // Pre-render pages around the starting page so it never opens blank
              initialVisible={Math.abs(pageNum - startPage) < INITIAL_PAGES}
            />
          ))}
        </div>
      </div>

      <AnnotationToolbar />

      {signatureDialogOpen && <SignatureDialog />}
      {stampPickerOpen && <StampPicker />}
    </div>
  );
}
