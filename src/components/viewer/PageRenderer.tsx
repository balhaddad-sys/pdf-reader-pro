import { useRef, useEffect, useState, useCallback, memo } from 'react';
import { renderPage, paintFromCache } from '@/utils/pdf';
import { useUIStore } from '@/stores/uiStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useDocumentStore } from '@/stores/documentStore';
import { useSearchStore } from '@/stores/searchStore';
import type { PDFDocumentProxy } from '@/utils/pdf';

// No debounce here — PDFViewer controls when renderZoom changes.
// When zoom prop changes, it means renderZoom settled and we should render.

interface PageRendererProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
}

export const PageRenderer = memo(function PageRenderer({ pdf, pageNumber, zoom }: PageRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const annotLayerRef = useRef<HTMLDivElement>(null);

  const renderedZoomRef = useRef<number>(0);
  const cancelledRef = useRef(false);

  const [initialLoading, setInitialLoading] = useState(true);
  const textItemsRef = useRef<TextItem[]>([]);
  const textStringsRef = useRef<string[]>([]);

  const activeTool = useUIStore(s => s.activeTool);
  const activeColor = useUIStore(s => s.activeColor);
  const annotations = useAnnotationStore(s => s.annotations);
  const addAnnotation = useAnnotationStore(s => s.addAnnotation);
  const tabs = useDocumentStore(s => s.tabs);
  const activeTabId = useDocumentStore(s => s.activeTabId);
  const activeTab = tabs.find(t => t.id === activeTabId);

  const matches = useSearchStore(s => s.matches);
  const currentMatchIndex = useSearchStore(s => s.currentMatchIndex);
  const scrollTrigger = useSearchStore(s => s.scrollTrigger);

  // ── Core render ───────────────────────────────────────────────────────────
  const doRender = useCallback(async (targetZoom: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    cancelledRef.current = false;

    // Cache hit — instant
    if (paintFromCache(canvas, pageNumber, targetZoom)) {
      renderedZoomRef.current = targetZoom;
      setInitialLoading(false);
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelledRef.current) return;
        const textContent = await page.getTextContent();
        if (cancelledRef.current || !textLayerRef.current) return;
        buildTextLayer(textLayerRef.current, textContent, targetZoom, textItemsRef, textStringsRef);
      } catch { /* ignore */ }
      return;
    }

    // Full render
    try {
      const page = await pdf.getPage(pageNumber);
      if (cancelledRef.current) return;
      await renderPage(page, canvas, targetZoom);
      if (cancelledRef.current) return;
      renderedZoomRef.current = targetZoom;
      setInitialLoading(false);

      if (textLayerRef.current) {
        const textContent = await page.getTextContent();
        if (cancelledRef.current) return;
        buildTextLayer(textLayerRef.current, textContent, targetZoom, textItemsRef, textStringsRef);
      }
    } catch (err) {
      if (!cancelledRef.current && !(err instanceof Error && err.message.includes('Rendering cancelled'))) {
        console.error(`Error rendering page ${pageNumber}:`, err);
      }
    }
  }, [pdf, pageNumber]);

  // ── Render when zoom, page, or pdf changes ─────────────────────────────────
  // zoom here is actually renderZoom (controlled by PDFViewer). It only changes
  // after zoom gestures settle, so this won't fire during active pinching.
  useEffect(() => {
    if (!canvasRef.current) return;
    cancelledRef.current = false;
    doRender(zoom);
    return () => { cancelledRef.current = true; };
  }, [pdf, pageNumber, zoom, doRender]);

  // ── Search highlighting ───────────────────────────────────────────────────
  useEffect(() => {
    const textLayer = textLayerRef.current;
    if (!textLayer) return;

    const pageMatches = matches.filter(m => m.page === pageNumber);
    const currentMatch = matches[currentMatchIndex];
    const isCurrentPage = currentMatch?.page === pageNumber;

    textLayer.querySelectorAll('.search-highlight').forEach(el => {
      const parent = el.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(el.textContent || ''), el);
      parent.normalize();
    });

    if (pageMatches.length === 0) return;

    const spans = Array.from(textLayer.querySelectorAll('span'));
    if (spans.length === 0) return;
    const textStrings = textStringsRef.current;
    if (textStrings.length === 0) return;

    let totalLen = 0;
    const spanStarts: number[] = [];
    for (let i = 0; i < textStrings.length; i++) {
      spanStarts.push(totalLen);
      totalLen += textStrings[i].length;
      if (i < textStrings.length - 1) totalLen += 1;
    }

    for (const match of pageMatches) {
      const isCurrent = isCurrentPage && match === currentMatch;
      const matchStart = match.charOffset;
      const matchEnd = matchStart + match.charLength;

      for (let si = 0; si < spans.length; si++) {
        const spanStart = spanStarts[si];
        if (spanStart === undefined) continue;
        const spanText = textStrings[si] || '';
        const spanEnd = spanStart + spanText.length;
        if (matchEnd <= spanStart || matchStart >= spanEnd) continue;
        highlightSpan(spans[si], spanText, Math.max(0, matchStart - spanStart), Math.min(spanText.length, matchEnd - spanStart), isCurrent);
      }
    }

    if (isCurrentPage && scrollTrigger > 0) {
      textLayer.querySelector('.search-highlight-current')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [matches, currentMatchIndex, scrollTrigger, pageNumber]);

  // ── Annotation overlays ───────────────────────────────────────────────────
  useEffect(() => {
    const layer = annotLayerRef.current;
    if (!layer) return;

    const pageAnnotations = annotations.filter(
      a => a.page === pageNumber && a.rects && a.rects.length > 0,
    );

    const frag = document.createDocumentFragment();
    pageAnnotations.forEach(ann => {
      ann.rects!.forEach(rect => {
        const el = document.createElement('div');
        el.style.position = 'absolute';
        el.style.left = `${rect.x * zoom}px`;
        el.style.top = `${rect.y * zoom}px`;
        el.style.width = `${rect.width * zoom}px`;
        el.style.height = `${rect.height * zoom}px`;
        el.style.pointerEvents = 'none';
        el.title = ann.selectedText || ann.content || '';

        if (ann.type === 'highlight') {
          el.style.backgroundColor = ann.color + '55';
          el.style.mixBlendMode = 'multiply';
        } else if (ann.type === 'underline') {
          el.style.borderBottom = `2px solid ${ann.color}`;
        } else if (ann.type === 'strikethrough') {
          el.style.top = `${(rect.y + rect.height / 2) * zoom - 1}px`;
          el.style.height = '2px';
          el.style.backgroundColor = ann.color;
        } else if (ann.type === 'squiggly') {
          const encodedColor = encodeURIComponent(ann.color);
          el.style.backgroundImage = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='4'%3E%3Cpath d='M0 4 Q2 0 4 4 Q6 8 8 4' fill='none' stroke='${encodedColor}' stroke-width='1.5'/%3E%3C/svg%3E")`;
          el.style.backgroundRepeat = 'repeat-x';
          el.style.backgroundPosition = `0 ${rect.height * zoom - 4}px`;
          el.style.backgroundSize = '8px 4px';
        } else if (ann.type === 'note') {
          el.style.backgroundColor = ann.color + '33';
          el.style.borderBottom = `1.5px dashed ${ann.color}`;
        }
        frag.appendChild(el);
      });
    });

    layer.innerHTML = '';
    layer.appendChild(frag);
  }, [annotations, pageNumber, zoom]);

  // ── Text selection → annotation ───────────────────────────────────────────
  const handleTextSelection = useCallback(() => {
    if (!activeTab) return;
    const textAnnotTools = ['highlight', 'underline', 'strikethrough', 'squiggly', 'note'] as const;
    type TextAnnotTool = typeof textAnnotTools[number];
    if (!textAnnotTools.includes(activeTool as TextAnnotTool)) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const textLayer = textLayerRef.current;
    if (!textLayer || !textLayer.contains(range.commonAncestorContainer)) return;

    const selectedText = selection.toString().trim();
    if (!selectedText) return;

    const rects: DOMRect[] = [];
    const layerRect = textLayer.getBoundingClientRect();

    Array.from(range.getClientRects()).forEach(r => {
      if (r.width > 0 && r.height > 0) {
        rects.push(new DOMRect(
          (r.left - layerRect.left) / zoom,
          (r.top  - layerRect.top)  / zoom,
          r.width  / zoom,
          r.height / zoom,
        ));
      }
    });

    if (rects.length === 0) return;
    addAnnotation({
      documentId: activeTab.documentId,
      page: pageNumber,
      type: activeTool as TextAnnotTool,
      color: activeColor,
      rects,
      selectedText,
    });
    selection.removeAllRanges();
  }, [activeTool, activeColor, activeTab, pageNumber, addAnnotation, zoom]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      {initialLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
          <div className="w-6 h-6 border-2 border-brand-400 border-t-transparent rounded-full animate-spinner" />
        </div>
      )}
      <canvas ref={canvasRef} className="block w-full h-full" />
      <div ref={annotLayerRef} className="absolute inset-0 overflow-hidden pointer-events-none" />
      <div
        ref={textLayerRef}
        className="absolute inset-0 overflow-hidden leading-none select-text"
        style={{ mixBlendMode: 'multiply' }}
        onPointerUp={handleTextSelection}
      />
    </div>
  );
});

// ── Helpers ──────────────────────────────────────────────────────────────────

interface TextItem {
  str: string;
  transform: number[];
}

function buildTextLayer(
  container: HTMLDivElement,
  textContent: { items: unknown[] },
  zoom: number,
  textItemsRef: React.MutableRefObject<TextItem[]>,
  textStringsRef: React.MutableRefObject<string[]>,
) {
  const items: TextItem[] = [];
  const strings: string[] = [];
  const frag = document.createDocumentFragment();

  textContent.items.forEach(item => {
    const ti = item as TextItem;
    if (!ti.str) return;
    items.push(ti);
    strings.push(ti.str);
    const tx = ti.transform;
    const fontSize = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]);
    const span = document.createElement('span');
    span.textContent = ti.str;
    span.style.cssText = `position:absolute;left:${tx[4] * zoom}px;bottom:${tx[5] * zoom}px;font-size:${fontSize * zoom}px;font-family:sans-serif;color:transparent;white-space:pre;transform-origin:0% 0%`;
    frag.appendChild(span);
  });

  container.innerHTML = '';
  container.appendChild(frag);
  textItemsRef.current = items;
  textStringsRef.current = strings;
}

function highlightSpan(span: Element, fullText: string, hlStart: number, hlEnd: number, isCurrent: boolean) {
  const existingText = span.textContent || '';
  if (!existingText) return;
  const text = fullText.length === existingText.length ? fullText : existingText;
  span.textContent = '';

  if (hlStart > 0) span.appendChild(document.createTextNode(text.slice(0, hlStart)));

  const mark = document.createElement('mark');
  mark.className = isCurrent ? 'search-highlight search-highlight-current' : 'search-highlight';
  mark.textContent = text.slice(hlStart, hlEnd);
  span.appendChild(mark);

  if (hlEnd < text.length) span.appendChild(document.createTextNode(text.slice(hlEnd)));
}
