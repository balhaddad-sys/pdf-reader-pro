import { useRef, useEffect, useState, useCallback, memo } from 'react';
import { renderPage, paintFromCache } from '@/utils/pdf';
import { useUIStore } from '@/stores/uiStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useDocumentStore } from '@/stores/documentStore';
import { useSearchStore } from '@/stores/searchStore';
import type { PDFDocumentProxy } from '@/utils/pdf';

interface PageRendererProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
}

export const PageRenderer = memo(function PageRenderer({ pdf, pageNumber, zoom }: PageRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const annotLayerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  /** Store text items + their strings for search highlighting */
  const textItemsRef = useRef<TextItem[]>([]);
  const textStringsRef = useRef<string[]>([]);

  const activeTool = useUIStore(s => s.activeTool);
  const activeColor = useUIStore(s => s.activeColor);
  const annotations = useAnnotationStore(s => s.annotations);
  const addAnnotation = useAnnotationStore(s => s.addAnnotation);
  const tabs = useDocumentStore(s => s.tabs);
  const activeTabId = useDocumentStore(s => s.activeTabId);
  const activeTab = tabs.find(t => t.id === activeTabId);

  // Search state
  const matches = useSearchStore(s => s.matches);
  const currentMatchIndex = useSearchStore(s => s.currentMatchIndex);
  const scrollTrigger = useSearchStore(s => s.scrollTrigger);

  // ── Render PDF canvas + text layer ───────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Try cache first — instant paint, no async work needed
    if (paintFromCache(canvas, pageNumber, zoom)) {
      setLoading(false);
      let cancelled = false;
      pdf.getPage(pageNumber).then(page => {
        if (cancelled || !textLayerRef.current) return;
        return page.getTextContent().then(textContent => {
          if (cancelled || !textLayerRef.current) return;
          buildTextLayer(textLayerRef.current, textContent, zoom, textItemsRef, textStringsRef);
        });
      });
      return () => { cancelled = true; };
    }

    // Cache miss — full render
    let cancelled = false;
    setLoading(true);

    const doRender = async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;

        await renderPage(page, canvas, zoom);
        if (cancelled) return;
        setLoading(false);

        if (textLayerRef.current) {
          const textContent = await page.getTextContent();
          if (cancelled) return;
          buildTextLayer(textLayerRef.current, textContent, zoom, textItemsRef, textStringsRef);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof Error && err.message.includes('Rendering cancelled')) return;
          console.error(`Error rendering page ${pageNumber}:`, err);
        }
      }
    };

    doRender();
    return () => { cancelled = true; };
  }, [pdf, pageNumber, zoom]);

  // ── Search highlighting ────────────────────────────────────────────────────
  useEffect(() => {
    const textLayer = textLayerRef.current;
    if (!textLayer) return;

    const pageMatches = matches.filter(m => m.page === pageNumber);
    const currentMatch = matches[currentMatchIndex];
    const isCurrentPage = currentMatch?.page === pageNumber;

    // Clear previous highlights
    textLayer.querySelectorAll('.search-highlight').forEach(el => {
      const parent = el.parentNode;
      if (!parent) return;
      // Restore original text
      const text = el.textContent || '';
      parent.replaceChild(document.createTextNode(text), el);
      parent.normalize(); // merge adjacent text nodes
    });

    if (pageMatches.length === 0) return;

    // Get all text spans in the layer
    const spans = Array.from(textLayer.querySelectorAll('span'));
    if (spans.length === 0) return;

    // Build concatenated text and mapping: charIndex → { spanIdx, offsetInSpan }
    const textStrings = textStringsRef.current;
    if (textStrings.length === 0) return;

    let totalLen = 0;
    const spanStarts: number[] = []; // start char index of each span in concat text
    for (let i = 0; i < textStrings.length; i++) {
      spanStarts.push(totalLen);
      totalLen += textStrings[i].length;
      // Account for the space added between items by getPageText
      if (i < textStrings.length - 1) totalLen += 1; // the space separator
    }

    // For each match on this page, find which spans to highlight
    for (const match of pageMatches) {
      const isCurrent = isCurrentPage && match === currentMatch;
      const matchStart = match.charOffset;
      const matchEnd = matchStart + match.charLength;

      // Find which spans are affected
      for (let si = 0; si < spans.length; si++) {
        const spanStart = spanStarts[si];
        if (spanStart === undefined) continue;
        const spanText = textStrings[si] || '';
        const spanEnd = spanStart + spanText.length;

        // Check overlap
        if (matchEnd <= spanStart || matchStart >= spanEnd) continue;

        // Calculate overlap within this span
        const hlStart = Math.max(0, matchStart - spanStart);
        const hlEnd = Math.min(spanText.length, matchEnd - spanStart);

        const span = spans[si];
        highlightSpan(span, spanText, hlStart, hlEnd, isCurrent);
      }
    }

    // Scroll to the current match
    if (isCurrentPage && scrollTrigger > 0) {
      const selected = textLayer.querySelector('.search-highlight-current');
      if (selected) {
        selected.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
  }, [matches, currentMatchIndex, scrollTrigger, pageNumber]);

  // ── Annotation overlays ──────────────────────────────────────────────────
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

  // ── Text selection → annotation ──────────────────────────────────────────
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
    <div className="relative w-full h-full">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
          <div className="w-6 h-6 border-2 border-brand-400 border-t-transparent rounded-full animate-spinner" />
        </div>
      )}

      <canvas ref={canvasRef} className="block" />

      <div
        ref={annotLayerRef}
        className="absolute inset-0 overflow-hidden pointer-events-none"
      />

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

/**
 * Highlight a portion of a text span by splitting it into text nodes
 * and wrapping the highlighted part in a <mark> element.
 */
function highlightSpan(
  span: Element,
  fullText: string,
  hlStart: number,
  hlEnd: number,
  isCurrent: boolean,
) {
  // Get the current text content (may already have some highlights)
  const existingText = span.textContent || '';
  if (!existingText) return;

  // We need to work with the original span text.
  // Re-map hlStart/hlEnd if span text differs from fullText (shouldn't happen)
  const text = fullText.length === existingText.length ? fullText : existingText;

  // Clear the span
  span.textContent = '';

  // Before highlight
  if (hlStart > 0) {
    span.appendChild(document.createTextNode(text.slice(0, hlStart)));
  }

  // Highlighted part
  const mark = document.createElement('mark');
  mark.className = isCurrent
    ? 'search-highlight search-highlight-current'
    : 'search-highlight';
  mark.textContent = text.slice(hlStart, hlEnd);
  span.appendChild(mark);

  // After highlight
  if (hlEnd < text.length) {
    span.appendChild(document.createTextNode(text.slice(hlEnd)));
  }
}
