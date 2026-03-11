import React, { useRef, useEffect, useCallback, useState, useMemo, memo } from 'react';
import { useDocumentStore } from '@/stores/documentStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useUIStore } from '@/stores/uiStore';
import { PageRenderer } from './PageRenderer';
import { AnnotationToolbar } from '@/components/annotations/AnnotationToolbar';
import { SearchPanel } from './SearchPanel';
import { DrawingCanvas } from '@/components/annotations/DrawingCanvas';
import { SignatureDialog } from '@/components/annotations/SignatureDialog';
import { StampPicker } from '@/components/annotations/StampPicker';
import { AIDrawer } from './AIDrawer';
import { Sparkles } from 'lucide-react';
import { cn, clamp } from '@/utils/helpers';
import type { PDFDocumentProxy } from '@/utils/pdf';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Gap between pages in px */
const PAGE_GAP = 16;
const PAGE_GAP_FOCUS = 8;
/** Vertical padding above/below all pages */
const PAGE_PADDING = 24;
const PAGE_PADDING_FOCUS = 8;
/** How many pages to render beyond the visible viewport in each direction */
const OVERSCAN = 4;
/** Default page dimensions before real dimensions are loaded */
const DEFAULT_W = 595;
const DEFAULT_H = 842;

// ─── Layout helpers ──────────────────────────────────────────────────────────

interface PageLayout {
  /** Top offset of each page (index = pageNum-1) */
  offsets: number[];
  /** Height of each page */
  heights: number[];
  /** Width of each page */
  widths: number[];
  /** Total scrollable height */
  totalHeight: number;
}

function computeLayout(
  numPages: number,
  dims: Map<number, { width: number; height: number }>,
  gap: number,
  padding: number,
): PageLayout {
  const offsets: number[] = [];
  const heights: number[] = [];
  const widths: number[] = [];
  let y = padding;

  for (let i = 1; i <= numPages; i++) {
    const d = dims.get(i);
    const w = d ? d.width : DEFAULT_W;
    const h = d ? d.height : DEFAULT_H;
    offsets.push(y);
    heights.push(h);
    widths.push(w);
    y += h + gap;
  }

  return { offsets, heights, widths, totalHeight: y - gap + padding };
}

/** Binary search: find the first page whose bottom edge is >= scrollTop */
function findFirstVisible(offsets: number[], heights: number[], scrollTop: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (offsets[mid] + heights[mid] < scrollTop) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// ─── VirtualPage ─────────────────────────────────────────────────────────────

interface VirtualPageProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
  isDrawingMode: boolean;
  width: number;
  height: number;
  top: number;
  /** When true, show a lightweight placeholder instead of rendering */
  defer: boolean;
}

const VirtualPage = memo(function VirtualPage({
  pdf,
  pageNumber,
  zoom,
  isDrawingMode,
  width,
  height,
  top,
  defer,
}: VirtualPageProps): React.JSX.Element {
  return (
    <div
      data-page-number={pageNumber}
      className="absolute left-1/2 shadow-elevation-2 bg-white"
      style={{
        width: `${width}px`,
        height: `${height}px`,
        top: `${top}px`,
        transform: 'translateX(-50%)',
      }}
    >
      {defer ? (
        <div className="flex items-center justify-center w-full h-full text-on-surface-secondary/30 text-sm select-none">
          {pageNumber}
        </div>
      ) : (
        <>
          <PageRenderer pdf={pdf} pageNumber={pageNumber} zoom={zoom} />
          {isDrawingMode && <DrawingCanvas pageNumber={pageNumber} zoom={zoom} />}
        </>
      )}
    </div>
  );
});

// ─── Main PDFViewer ──────────────────────────────────────────────────────────

export function PDFViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pagesContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollRoot = useRef<HTMLDivElement | null>(null);
  const rafId = useRef(0);
  const lastPageRef = useRef(0);
  const lastScrollTop = useRef(0);
  const lastScrollTime = useRef(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout>>();
  const [fastScrolling, setFastScrolling] = useState(false);

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

  const activeTabRef = useRef(activeTab);
  useEffect(() => { activeTabRef.current = activeTab; });

  // ── Page dimensions ──────────────────────────────────────────────────────
  const [pageDimensions, setPageDimensions] = useState<Map<number, { width: number; height: number }>>(new Map());

  useEffect(() => {
    if (!pdf || !activeTab) return;
    let cancelled = false;

    const loadDimensions = async () => {
      const dims = new Map<number, { width: number; height: number }>();
      for (let i = 1; i <= pdf.numPages; i++) {
        if (cancelled) return;
        try {
          const page = await pdf.getPage(i);
          const vp = page.getViewport({ scale: activeTab.zoom });
          dims.set(i, { width: vp.width, height: vp.height });
          // Flush early: after page 1, then every 10 pages
          if ((i === 1 || i % 10 === 0) && !cancelled) setPageDimensions(new Map(dims));
        } catch { /* ignore */ }
      }
      if (!cancelled) setPageDimensions(new Map(dims));
    };

    loadDimensions();
    return () => { cancelled = true; };
  }, [pdf, activeTab?.documentId, activeTab?.zoom]);

  // ── Computed layout (O(n) but only recalculated when dims/zoom change) ──
  const gap = focusMode ? PAGE_GAP_FOCUS : PAGE_GAP;
  const padding = focusMode ? PAGE_PADDING_FOCUS : PAGE_PADDING;
  const numPages = pdf?.numPages ?? 0;

  const layout = useMemo(
    () => computeLayout(numPages, pageDimensions, gap, padding),
    [numPages, pageDimensions, gap, padding],
  );

  // ── Visible window (which pages to mount) ──────────────────────────────
  const [visibleRange, setVisibleRange] = useState<[number, number]>([0, Math.min(5, Math.max(numPages - 1, 0))]);

  const recalcVisible = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    // If layout isn't ready yet (dimensions still loading), show first few pages
    if (layout.offsets.length === 0) {
      if (numPages > 0) {
        setVisibleRange([0, Math.min(OVERSCAN, numPages - 1)]);
      }
      return;
    }

    const scrollTop = container.scrollTop;
    const viewH = container.clientHeight;

    const first = findFirstVisible(layout.offsets, layout.heights, scrollTop);
    let last = first;
    while (last < layout.offsets.length - 1 && layout.offsets[last + 1] < scrollTop + viewH) {
      last++;
    }

    const rangeStart = Math.max(0, first - OVERSCAN);
    const rangeEnd = Math.min(layout.offsets.length - 1, last + OVERSCAN);
    setVisibleRange(prev => (prev[0] === rangeStart && prev[1] === rangeEnd) ? prev : [rangeStart, rangeEnd]);

    // Update current page indicator (the page at 1/3 from top)
    const midPoint = scrollTop + viewH / 3;
    let currentPage = 1;
    for (let i = 0; i < layout.offsets.length; i++) {
      if (layout.offsets[i] <= midPoint) currentPage = i + 1;
      else break;
    }
    if (currentPage !== lastPageRef.current) {
      lastPageRef.current = currentPage;
      const tab = activeTabRef.current;
      if (tab && currentPage !== tab.page) {
        updateTab(tab.id, { page: currentPage });
      }
    }
  }, [layout, updateTab, numPages]);

  // ── Scroll handler with velocity detection ─────────────────────────────
  // During fast scrollbar drags, skip rendering and show placeholders.
  // Only render once scrolling settles (150ms of no scroll events).
  const FAST_THRESHOLD = 3000; // px/sec — above this = fast scrolling

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const now = performance.now();
    const dt = now - lastScrollTime.current;
    const dy = Math.abs(container.scrollTop - lastScrollTop.current);
    lastScrollTop.current = container.scrollTop;
    lastScrollTime.current = now;

    // Detect fast scroll (scrollbar drag or flick)
    const velocity = dt > 0 ? (dy / dt) * 1000 : 0;
    if (velocity > FAST_THRESHOLD) {
      setFastScrolling(true);
    }

    // Always update visible range (lightweight — just math, no rendering)
    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(recalcVisible);

    // Schedule settle: after 150ms of no scroll, enable rendering
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      setFastScrolling(false);
    }, 150);
  }, [recalcVisible]);

  // Recalculate on mount and when layout changes
  useEffect(() => { recalcVisible(); }, [recalcVisible]);

  // ── Load annotations when document changes ─────────────────────────────
  useEffect(() => {
    if (activeTab) {
      loadAnnotations(activeTab.documentId);
      loadBookmarks(activeTab.documentId);
    }
  }, [activeTab?.documentId, loadAnnotations, loadBookmarks]);

  // ── Scroll to page when page changes from external source (sidebar) ────
  const scrollingToPage = useRef(false);
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !activeTab || layout.offsets.length === 0) return;
    const idx = activeTab.page - 1;
    if (idx < 0 || idx >= layout.offsets.length) return;
    // Don't scroll if we just set this page from the scroll handler
    if (activeTab.page === lastPageRef.current) return;

    scrollingToPage.current = true;
    container.scrollTo({ top: layout.offsets[idx] - 20, behavior: 'smooth' });
    setTimeout(() => { scrollingToPage.current = false; }, 500);
  }, [activeTab?.page, layout.offsets]);

  // ── Keyboard zoom ──────────────────────────────────────────────────────
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

  // ── Mouse wheel zoom ──────────────────────────────────────────────────
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
      const contentX = (mouseX + container.scrollLeft) / oldZoom;
      const contentY = (mouseY + container.scrollTop) / oldZoom;
      updateTab(tab.id, { zoom: newZoom });
      requestAnimationFrame(() => {
        container.scrollLeft = Math.max(0, contentX * newZoom - mouseX);
        container.scrollTop  = Math.max(0, contentY * newZoom - mouseY);
      });
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [updateTab]);

  // ── Pinch-to-zoom ─────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    scrollRoot.current = container;

    let pinchActive   = false;
    let pinchDist     = 0;
    let pinchZoom     = 1;
    let currentScale  = 1;
    let pinchContentX = 0;
    let pinchContentY = 0;
    let pinchScreenX  = 0;
    let pinchScreenY  = 0;

    const getDist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchActive  = true;
        pinchDist    = getDist(e.touches);
        pinchZoom    = activeTabRef.current?.zoom ?? 1;
        currentScale = 1;
        const r = container.getBoundingClientRect();
        pinchScreenX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        pinchScreenY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        pinchContentX = (pinchScreenX - r.left + container.scrollLeft) / pinchZoom;
        pinchContentY = (pinchScreenY - r.top  + container.scrollTop)  / pinchZoom;
      } else {
        pinchActive = false;
        pinchDist   = 0;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pinchActive || e.touches.length !== 2 || pinchDist === 0) return;
      e.preventDefault();
      currentScale = getDist(e.touches) / pinchDist;
      const pagesEl = pagesContainerRef.current;
      if (!pagesEl) return;
      const r = container.getBoundingClientRect();
      const originX = container.scrollLeft + (pinchScreenX - r.left);
      const originY = container.scrollTop  + (pinchScreenY - r.top);
      pagesEl.style.transformOrigin = `${originX}px ${originY}px`;
      pagesEl.style.transform       = `scale(${currentScale})`;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!pinchActive || e.touches.length >= 2) return;
      pinchActive = false;
      pinchDist   = 0;
      const pagesEl = pagesContainerRef.current;
      const tab     = activeTabRef.current;
      const r       = container.getBoundingClientRect();
      if (pagesEl) { pagesEl.style.transform = ''; pagesEl.style.transformOrigin = ''; }
      if (!tab) return;
      const finalZoom  = clamp(Math.round(pinchZoom * currentScale * 100) / 100, 0.25, 4);
      const targetLeft = pinchContentX * finalZoom - (pinchScreenX - r.left);
      const targetTop  = pinchContentY * finalZoom - (pinchScreenY - r.top);
      updateTab(tab.id, { zoom: finalZoom });
      requestAnimationFrame(() => {
        container.scrollLeft = Math.max(0, targetLeft);
        container.scrollTop  = Math.max(0, targetTop);
      });
    };

    const onTouchCancel = () => {
      pinchActive = false;
      pinchDist   = 0;
      const pagesEl = pagesContainerRef.current;
      if (pagesEl) { pagesEl.style.transform = ''; pagesEl.style.transformOrigin = ''; }
    };

    container.addEventListener('touchstart',  onTouchStart,  { passive: true });
    container.addEventListener('touchmove',   onTouchMove,   { passive: false });
    container.addEventListener('touchend',    onTouchEnd,    { passive: true });
    container.addEventListener('touchcancel', onTouchCancel, { passive: true });
    return () => {
      container.removeEventListener('touchstart',  onTouchStart);
      container.removeEventListener('touchmove',   onTouchMove);
      container.removeEventListener('touchend',    onTouchEnd);
      container.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [updateTab]);

  // ── Render ─────────────────────────────────────────────────────────────
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

  const isDrawingMode = activeTool === 'freehand' || activeTool === 'eraser' || activeTool === 'shape'
    || activeTool === 'text' || activeTool === 'note' || activeTool === 'signature' || activeTool === 'stamp';

  const [startIdx, endIdx] = visibleRange;

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden">
      {searchOpen && <SearchPanel />}

      <div
        ref={containerRef}
        className={cn(
          'flex-1 min-h-0 overflow-y-auto overflow-x-auto',
          'bg-surface-0',
          isDrawingMode && 'cursor-crosshair',
        )}
        onScroll={handleScroll}
      >
        {/* Single container with explicit total height — only visible pages are mounted */}
        <div
          ref={pagesContainerRef}
          className="relative w-full"
          style={{ height: `${layout.totalHeight || (numPages * (DEFAULT_H + PAGE_GAP) + PAGE_PADDING * 2)}px` }}
        >
          {Array.from({ length: Math.max(0, endIdx - startIdx + 1) }, (_, i) => {
            const idx = startIdx + i;
            if (idx < 0 || idx >= numPages) return null;
            const pageNum = idx + 1;
            const hasLayout = idx < layout.offsets.length;
            return (
              <VirtualPage
                key={pageNum}
                pdf={pdf}
                pageNumber={pageNum}
                zoom={activeTab.zoom}
                isDrawingMode={isDrawingMode}
                width={hasLayout ? layout.widths[idx] : DEFAULT_W}
                height={hasLayout ? layout.heights[idx] : DEFAULT_H}
                top={hasLayout ? layout.offsets[idx] : PAGE_PADDING + idx * (DEFAULT_H + PAGE_GAP)}
                defer={fastScrolling}
              />
            );
          })}
        </div>
      </div>

      <AnnotationToolbar />

      <button
        onClick={() => useUIStore.getState().setAiDrawerOpen(true)}
        className="absolute right-4 bottom-20 z-20 w-12 h-12 flex items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-elevation-3 shadow-brand-500/25 hover:shadow-glow active:scale-95 transition-all"
        title="AI Assistant"
      >
        <Sparkles size={18} />
      </button>
      <AIDrawer />

      {signatureDialogOpen && <SignatureDialog />}
      {stampPickerOpen && <StampPicker />}
    </div>
  );
}
