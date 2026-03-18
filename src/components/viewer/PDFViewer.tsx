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
  zoom: number,
  gap: number,
  padding: number,
): PageLayout {
  const offsets: number[] = [];
  const heights: number[] = [];
  const widths: number[] = [];
  let y = padding;
  for (let i = 1; i <= numPages; i++) {
    const d = dims.get(i);
    const w = d ? d.width * zoom : DEFAULT_W * zoom;
    const h = d ? d.height * zoom : DEFAULT_H * zoom;
    offsets.push(y);
    heights.push(h);
    widths.push(w);
    y += h + gap;
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

/** Find page index + fraction for a given scroll Y position */
function findPageAtY(
  offsets: number[],
  heights: number[],
  y: number,
): { pageIndex: number; fraction: number } {
  let idx = 0;
  for (let i = 0; i < offsets.length; i++) {
    if (offsets[i] <= y) idx = i;
    else break;
  }
  const offset = offsets[idx];
  const h = heights[idx];
  const fraction = h > 0 ? Math.max(0, Math.min(1, (y - offset) / h)) : 0;
  return { pageIndex: idx, fraction };
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
// Architecture:
// - Layout is computed at displayZoom (current zoom) so scroll positions
//   are always correct and the scrollbar height matches the content.
// - Pages are RENDERED at renderZoom (which lags behind displayZoom).
//   Each page canvas is CSS-scaled to fill its displayZoom slot.
// - During zoom gestures: layout recomputes (just math, no DOM), scroll
//   position is preserved page-aware, but NO page re-renders happen
//   because renderZoom doesn't change.
// - After zoom settles (500ms): renderZoom catches up, pages re-render
//   at full quality via double-buffered canvases. The canvas swap is
//   atomic so there's no visible flash.
// ═════════════════════════════════════════════════════════════════════════════

export function PDFViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
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
  // renderZoom only changes after zoom gestures settle. PageRenderers only
  // re-render when renderZoom changes, so active pinching never triggers renders.
  const [renderZoom, setRenderZoom] = useState(displayZoom);
  const renderZoomTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(renderZoomTimer.current);
    if (renderZoom === displayZoom) return;
    renderZoomTimer.current = setTimeout(() => setRenderZoom(displayZoom), 500);
    return () => clearTimeout(renderZoomTimer.current);
  }, [displayZoom, renderZoom]);

  // When document changes, sync renderZoom immediately
  useEffect(() => { setRenderZoom(displayZoom); }, [activeTab?.documentId]);

  // ── Layout at displayZoom ──────────────────────────────────────────────────
  // Layout is always at displayZoom so scroll positions and scrollbar are correct.
  const gap = focusMode ? PAGE_GAP_FOCUS : PAGE_GAP;
  const padding = focusMode ? PAGE_PADDING_FOCUS : PAGE_PADDING;
  const numPages = pdf?.numPages ?? 0;

  const layout = useMemo(
    () => computeLayout(numPages, naturalDimensions, displayZoom, gap, padding),
    [numPages, naturalDimensions, displayZoom, gap, padding],
  );

  // ── Page-aware scroll preservation on zoom ─────────────────────────────────
  // When zoom changes, find which page the viewport center is on and where
  // within that page, then compute the new scroll position from the new layout.
  // This avoids cumulative gap/padding error that a simple ratio would have.
  const prevZoomRef = useRef(displayZoom);
  const prevLayoutRef = useRef(layout);
  const isZoomingRef = useRef(false);

  useLayoutEffect(() => {
    const oldZoom = prevZoomRef.current;
    const oldLayout = prevLayoutRef.current;
    prevZoomRef.current = displayZoom;
    prevLayoutRef.current = layout;

    if (oldZoom === displayZoom) return;
    isZoomingRef.current = true;

    const container = containerRef.current;
    if (!container || oldLayout.offsets.length === 0 || layout.offsets.length === 0) {
      requestAnimationFrame(() => { isZoomingRef.current = false; });
      return;
    }

    const vh = container.clientHeight;
    const vw = container.clientWidth;

    // Find what page the viewport center was on in the OLD layout
    const oldCenterY = container.scrollTop + vh / 2;
    const { pageIndex, fraction } = findPageAtY(oldLayout.offsets, oldLayout.heights, oldCenterY);

    // Compute new center Y from the NEW layout
    const newCenterY = layout.offsets[pageIndex] + fraction * layout.heights[pageIndex];
    container.scrollTop = Math.max(0, newCenterY - vh / 2);

    // Horizontal: simple ratio (no gap accumulation issue)
    if (container.scrollLeft > 0) {
      const oldCenterX = container.scrollLeft + vw / 2;
      container.scrollLeft = Math.max(0, oldCenterX * (displayZoom / oldZoom) - vw / 2);
    }

    requestAnimationFrame(() => { isZoomingRef.current = false; });
  }, [displayZoom, layout]);

  // ── Visible window ────────────────────────────────────────────────────────
  const [visibleRange, setVisibleRange] = useState<[number, number]>([0, Math.min(5, Math.max(numPages - 1, 0))]);

  const recalcVisible = useCallback(() => {
    const container = containerRef.current;
    if (!container || layout.offsets.length === 0) {
      if (numPages > 0) setVisibleRange([0, Math.min(OVERSCAN, numPages - 1)]);
      return;
    }

    const scrollTop = container.scrollTop;
    const viewH = container.clientHeight;

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
  }, [layout, updateTab, numPages]);

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
    container.scrollTo({ top: layout.offsets[idx] - 20, behavior: 'smooth' });
  }, [activeTab?.page, layout.offsets]);

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
  // Strategy: touch-action "pan-y pinch-zoom" tells the browser to allow
  // native vertical scroll AND deliver pinch gesture touch events to JS.
  // We preventDefault on touchmove during a pinch to stop the browser from
  // actually zooming the page. This works because pinch-zoom in touch-action
  // means "deliver pinch events" not "let the browser zoom."
  //
  // Fallback: VisualViewport API detects if the browser zoomed despite our
  // prevention (Chrome Android sometimes ignores viewport meta restrictions).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let pinchActive = false;
    let pinchDist   = 0;
    let pinchZoom   = 1;

    const getDist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        pinchActive = true;
        pinchDist   = getDist(e.touches);
        pinchZoom   = activeTabRef.current?.zoom ?? 1;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pinchActive && e.touches.length >= 2) {
        pinchActive = true;
        pinchDist   = getDist(e.touches);
        pinchZoom   = activeTabRef.current?.zoom ?? 1;
      }
      if (!pinchActive || e.touches.length < 2 || pinchDist === 0) return;
      e.preventDefault();
      const scale = getDist(e.touches) / pinchDist;
      const newZoom = clamp(Math.round(pinchZoom * scale * 100) / 100, 0.25, 4);
      const tab = activeTabRef.current;
      if (tab && Math.abs(newZoom - tab.zoom) > 0.005) {
        updateTab(tab.id, { zoom: newZoom });
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (pinchActive && e.touches.length < 2) {
        pinchActive = false;
        pinchDist   = 0;
      }
    };

    const onTouchCancel = () => { pinchActive = false; pinchDist = 0; };

    // Safari gesture events
    const preventGesture = (e: Event) => e.preventDefault();

    container.addEventListener('touchstart',    onTouchStart,   { passive: true });
    container.addEventListener('touchmove',     onTouchMove,    { passive: false });
    container.addEventListener('touchend',      onTouchEnd,     { passive: true });
    container.addEventListener('touchcancel',   onTouchCancel,  { passive: true });
    container.addEventListener('gesturestart',  preventGesture as EventListener);
    container.addEventListener('gesturechange', preventGesture as EventListener);

    // ── VisualViewport fallback ─────────────────────────────────────────
    // If the browser handles pinch zoom despite our touch prevention
    // (Chrome Android ignores viewport meta), detect it via VisualViewport
    // and mirror the scale change into our app zoom.
    const vv = window.visualViewport;
    let lastVVScale = vv?.scale ?? 1;

    const onVVResize = () => {
      if (!vv || pinchActive) return;
      const scale = vv.scale;
      if (Math.abs(scale - lastVVScale) > 0.01 && scale !== 1) {
        const tab = activeTabRef.current;
        if (tab) {
          const newZoom = clamp(Math.round(tab.zoom * (scale / lastVVScale) * 100) / 100, 0.25, 4);
          if (newZoom !== tab.zoom) updateTab(tab.id, { zoom: newZoom });
        }
      }
      lastVVScale = scale;
    };

    vv?.addEventListener('resize', onVVResize);

    return () => {
      container.removeEventListener('touchstart',    onTouchStart);
      container.removeEventListener('touchmove',     onTouchMove);
      container.removeEventListener('touchend',      onTouchEnd);
      container.removeEventListener('touchcancel',   onTouchCancel);
      container.removeEventListener('gesturestart',  preventGesture as EventListener);
      container.removeEventListener('gesturechange', preventGesture as EventListener);
      vv?.removeEventListener('resize', onVVResize);
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
        style={{ touchAction: 'pan-y pinch-zoom' }}
        className={cn(
          'flex-1 min-h-0 overflow-y-auto overflow-x-auto',
          'bg-surface-0',
          isDrawingMode && 'cursor-crosshair',
        )}
        onScroll={handleScroll}
      >
        <div style={{ height: `${layout.totalHeight}px`, position: 'relative' }}>
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
                width={hasLayout ? layout.widths[idx] : DEFAULT_W * displayZoom}
                height={hasLayout ? layout.heights[idx] : DEFAULT_H * displayZoom}
                top={hasLayout ? layout.offsets[idx] : PAGE_PADDING + idx * (DEFAULT_H * displayZoom + PAGE_GAP)}
                defer={fastScrolling}
              />
            );
          })}
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
