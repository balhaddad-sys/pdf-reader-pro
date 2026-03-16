import React, { useRef, useEffect, useCallback, useState, useMemo, useLayoutEffect, memo } from 'react';
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
import { cancelIndexing } from '@/utils/textIndex';
import type { PDFDocumentProxy } from '@/utils/pdf';

// ─── Constants ───────────────────────────────────────────────────────────────

const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
const PAGE_GAP = isMobile ? 8 : 16;
const PAGE_GAP_FOCUS = isMobile ? 4 : 8;
const PAGE_PADDING = isMobile ? 12 : 24;
const PAGE_PADDING_FOCUS = isMobile ? 4 : 8;
const OVERSCAN = 4;
const DEFAULT_W = 595;
const DEFAULT_H = 842;
/** How long after the last zoom change before we re-render at full res */
const RENDER_SETTLE_MS = 500;

// ─── Layout helpers ──────────────────────────────────────────────────────────

interface PageLayout {
  offsets: number[];
  heights: number[];
  widths: number[];
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
    offsets.push(y);
    heights.push(d ? d.height : DEFAULT_H);
    widths.push(d ? d.width : DEFAULT_W);
    y += (d ? d.height : DEFAULT_H) + gap;
  }
  return { offsets, heights, widths, totalHeight: y - gap + padding };
}

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
  renderZoom: number;
  isDrawingMode: boolean;
  width: number;
  height: number;
  top: number;
  defer: boolean;
}

const VirtualPage = memo(function VirtualPage({
  pdf, pageNumber, renderZoom, isDrawingMode, width, height, top, defer,
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
          <PageRenderer pdf={pdf} pageNumber={pageNumber} zoom={renderZoom} />
          {isDrawingMode && <DrawingCanvas pageNumber={pageNumber} zoom={renderZoom} />}
        </>
      )}
    </div>
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// MAIN VIEWER
//
// Architecture: layout is ALWAYS computed at renderZoom. The visual difference
// between displayZoom and renderZoom is applied as a single CSS transform on
// the pages container. During zoom gestures, NOTHING re-renders — only the
// CSS transform and scroll position change. When zoom settles, renderZoom
// catches up and pages re-render at full quality via double-buffered canvases.
// ═════════════════════════════════════════════════════════════════════════════

export function PDFViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pagesContainerRef = useRef<HTMLDivElement | null>(null);
  const rafId = useRef(0);
  const lastPageRef = useRef(0);
  const lastScrollTop = useRef(0);
  const lastScrollTime = useRef(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
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
  const displayZoom = activeTab?.zoom ?? 1;

  const activeTabRef = useRef(activeTab);
  useEffect(() => { activeTabRef.current = activeTab; });

  // ── Page dimensions at scale=1 (fetched once per document) ────────────────
  const [naturalDimensions, setNaturalDimensions] = useState<Map<number, { width: number; height: number }>>(new Map());

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    const loadDimensions = async () => {
      const dims = new Map<number, { width: number; height: number }>();
      for (let i = 1; i <= pdf.numPages; i++) {
        if (cancelled) return;
        try {
          const page = await pdf.getPage(i);
          const vp = page.getViewport({ scale: 1 });
          dims.set(i, { width: vp.width, height: vp.height });
          if ((i === 1 || i % 10 === 0) && !cancelled) setNaturalDimensions(new Map(dims));
        } catch { /* ignore */ }
      }
      if (!cancelled) setNaturalDimensions(new Map(dims));
    };
    loadDimensions();
    return () => { cancelled = true; };
  }, [pdf, activeTab?.documentId]);

  // ── Render zoom (deferred) ────────────────────────────────────────────────
  // Layout is computed at renderZoom. Pages are rendered at renderZoom.
  // The CSS transform scale(displayZoom/renderZoom) bridges the visual gap.
  const [renderZoom, setRenderZoom] = useState(displayZoom);
  const renderZoomTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(renderZoomTimer.current);
    if (renderZoom === displayZoom) return;
    renderZoomTimer.current = setTimeout(() => setRenderZoom(displayZoom), RENDER_SETTLE_MS);
    return () => clearTimeout(renderZoomTimer.current);
  }, [displayZoom, renderZoom]);

  // When document changes, sync renderZoom immediately
  useEffect(() => { setRenderZoom(displayZoom); }, [activeTab?.documentId]);

  const scaleRatio = renderZoom > 0 ? displayZoom / renderZoom : 1;

  // ── Layout at renderZoom ──────────────────────────────────────────────────
  const renderDimensions = useMemo(() => {
    const zoomed = new Map<number, { width: number; height: number }>();
    naturalDimensions.forEach((dim, pageNum) => {
      zoomed.set(pageNum, { width: dim.width * renderZoom, height: dim.height * renderZoom });
    });
    return zoomed;
  }, [naturalDimensions, renderZoom]);

  const gap = focusMode ? PAGE_GAP_FOCUS : PAGE_GAP;
  const padding = focusMode ? PAGE_PADDING_FOCUS : PAGE_PADDING;
  const numPages = pdf?.numPages ?? 0;

  const layout = useMemo(
    () => computeLayout(numPages, renderDimensions, gap, padding),
    [numPages, renderDimensions, gap, padding],
  );

  // The visual height of the content (layout height × scale ratio)
  const visualHeight = layout.totalHeight * scaleRatio
    || (numPages * (DEFAULT_H + PAGE_GAP) + PAGE_PADDING * 2);

  // ── Apply CSS transform to pages container ────────────────────────────────
  // This runs on every displayZoom change — but it's just setting a CSS
  // property, zero React rendering.
  useEffect(() => {
    const pagesEl = pagesContainerRef.current;
    if (!pagesEl) return;
    if (Math.abs(scaleRatio - 1) < 0.001) {
      pagesEl.style.transform = '';
      pagesEl.style.transformOrigin = '';
    } else {
      pagesEl.style.transform = `scale(${scaleRatio})`;
      pagesEl.style.transformOrigin = 'top center';
    }
  }, [scaleRatio]);

  // ── Scroll position preservation on zoom ──────────────────────────────────
  // When displayZoom changes, adjust scroll to keep the same content visible.
  const prevDisplayZoom = useRef(displayZoom);
  const isZoomingRef = useRef(false);

  useLayoutEffect(() => {
    const oldZoom = prevDisplayZoom.current;
    if (oldZoom === displayZoom) return;
    prevDisplayZoom.current = displayZoom;
    isZoomingRef.current = true;

    const container = containerRef.current;
    if (container) {
      const vw = container.clientWidth;
      const vh = container.clientHeight;
      // Scale scroll positions proportionally
      const ratio = displayZoom / oldZoom;
      const centerY = container.scrollTop + vh / 2;
      const centerX = container.scrollLeft + vw / 2;
      container.scrollTop  = Math.max(0, centerY * ratio - vh / 2);
      container.scrollLeft = Math.max(0, centerX * ratio - vw / 2);
    }

    requestAnimationFrame(() => { isZoomingRef.current = false; });
  }, [displayZoom]);

  // ── Visible window ────────────────────────────────────────────────────────
  const [visibleRange, setVisibleRange] = useState<[number, number]>([0, Math.min(5, Math.max(numPages - 1, 0))]);

  const recalcVisible = useCallback(() => {
    const container = containerRef.current;
    if (!container || layout.offsets.length === 0) {
      if (numPages > 0) setVisibleRange([0, Math.min(OVERSCAN, numPages - 1)]);
      return;
    }

    // The scroll position is in visual space. Convert to layout space.
    const s = scaleRatio || 1;
    const scrollTop = container.scrollTop / s;
    const viewH = container.clientHeight / s;

    const first = findFirstVisible(layout.offsets, layout.heights, scrollTop);
    let last = first;
    while (last < layout.offsets.length - 1 && layout.offsets[last + 1] < scrollTop + viewH) last++;

    const rangeStart = Math.max(0, first - OVERSCAN);
    const rangeEnd = Math.min(layout.offsets.length - 1, last + OVERSCAN);
    setVisibleRange(prev => (prev[0] === rangeStart && prev[1] === rangeEnd) ? prev : [rangeStart, rangeEnd]);

    // Current page indicator
    const midPoint = scrollTop + viewH / 3;
    let currentPage = 1;
    for (let i = 0; i < layout.offsets.length; i++) {
      if (layout.offsets[i] <= midPoint) currentPage = i + 1;
      else break;
    }
    if (currentPage !== lastPageRef.current) {
      lastPageRef.current = currentPage;
      const tab = activeTabRef.current;
      if (tab && currentPage !== tab.page) updateTab(tab.id, { page: currentPage });
    }
  }, [layout, updateTab, numPages, scaleRatio]);

  // ── Scroll handler ────────────────────────────────────────────────────────
  const FAST_THRESHOLD = 3000;

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const now = performance.now();
    const dt = now - lastScrollTime.current;
    const dy = Math.abs(container.scrollTop - lastScrollTop.current);
    lastScrollTop.current = container.scrollTop;
    lastScrollTime.current = now;
    if (dt > 0 && (dy / dt) * 1000 > FAST_THRESHOLD) setFastScrolling(true);
    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(recalcVisible);
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => setFastScrolling(false), 150);
  }, [recalcVisible]);

  useEffect(() => { recalcVisible(); }, [recalcVisible]);

  // ── Load annotations ──────────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab) { loadAnnotations(activeTab.documentId); loadBookmarks(activeTab.documentId); }
  }, [activeTab?.documentId, loadAnnotations, loadBookmarks]);

  useEffect(() => {
    if (!activeTab) return;
    return () => { cancelIndexing(activeTab.documentId); };
  }, [activeTab?.documentId]);

  // ── Scroll to page (sidebar click) ────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !activeTab || layout.offsets.length === 0) return;
    const idx = activeTab.page - 1;
    if (idx < 0 || idx >= layout.offsets.length) return;
    if (activeTab.page === lastPageRef.current) return;
    if (isZoomingRef.current) return;
    // Convert layout-space offset to visual-space
    const s = scaleRatio || 1;
    container.scrollTo({ top: layout.offsets[idx] * s - 20, behavior: 'smooth' });
  }, [activeTab?.page, layout.offsets, scaleRatio]);

  // ── Header zoom requests ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const { tabId, newZoom } = (e as CustomEvent).detail;
      updateTab(tabId, { zoom: newZoom });
    };
    window.addEventListener('pdf-zoom-request', handler);
    return () => window.removeEventListener('pdf-zoom-request', handler);
  }, [updateTab]);

  // ── Keyboard zoom ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tab = activeTabRef.current;
      if (!tab) return;
      let newZoom: number | null = null;
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); newZoom = clamp(Math.round((tab.zoom + 0.1) * 100) / 100, 0.25, 4); }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); newZoom = clamp(Math.round((tab.zoom - 0.1) * 100) / 100, 0.25, 4); }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); newZoom = 1; }
      if (newZoom !== null && newZoom !== tab.zoom) updateTab(tab.id, { zoom: newZoom });
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [updateTab]);

  // ── Mouse wheel zoom ──────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const tab = activeTabRef.current;
      if (!tab) return;
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const newZoom = clamp(Math.round((tab.zoom + delta) * 100) / 100, 0.25, 4);
      if (newZoom !== tab.zoom) updateTab(tab.id, { zoom: newZoom });
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [updateTab]);

  // ── Pinch-to-zoom ─────────────────────────────────────────────────────────
  // During pinch: update displayZoom directly (CSS transform handles visuals).
  // No CSS transform on the pages container during gesture — the displayZoom
  // change updates scaleRatio which is applied via useEffect above.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let pinchActive = false;
    let pinchDist   = 0;
    let pinchZoom   = 1;

    const getDist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchActive = true;
        pinchDist   = getDist(e.touches);
        pinchZoom   = activeTabRef.current?.zoom ?? 1;
      } else {
        pinchActive = false;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pinchActive || e.touches.length !== 2 || pinchDist === 0) return;
      e.preventDefault();
      const scale = getDist(e.touches) / pinchDist;
      const newZoom = clamp(Math.round(pinchZoom * scale * 100) / 100, 0.25, 4);
      const tab = activeTabRef.current;
      if (tab && Math.abs(newZoom - tab.zoom) > 0.005) {
        updateTab(tab.id, { zoom: newZoom });
      }
    };

    const onTouchEnd = () => { pinchActive = false; };
    const onTouchCancel = () => { pinchActive = false; };

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

  // ── Render ────────────────────────────────────────────────────────────────
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
        data-pdf-viewer
        className={cn(
          'flex-1 min-h-0 overflow-y-auto overflow-x-auto',
          'bg-surface-0',
          isDrawingMode && 'cursor-crosshair',
        )}
        onScroll={handleScroll}
      >
        {/* Height wrapper — sets scrollable area to visual height */}
        <div style={{ height: `${visualHeight}px`, position: 'relative' }}>
          {/* Pages container — layout at renderZoom, CSS-scaled to displayZoom */}
          <div
            ref={pagesContainerRef}
            className="absolute top-0 left-0 w-full"
            style={{ height: `${layout.totalHeight || visualHeight}px` }}
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
                  renderZoom={renderZoom}
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
      </div>

      <AnnotationToolbar />

      <button
        onClick={() => useUIStore.getState().setAiDrawerOpen(true)}
        className="absolute right-3 sm:right-4 z-20 w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-elevation-3 shadow-brand-500/25 hover:shadow-glow active:scale-95 transition-all"
        style={{ bottom: 'max(5rem, calc(env(safe-area-inset-bottom, 0px) + 5rem))' }}
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
