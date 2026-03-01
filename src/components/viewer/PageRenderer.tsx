import { useRef, useEffect, useState, useCallback, memo } from 'react';
import { renderPage } from '@/utils/pdf';
import { useUIStore } from '@/stores/uiStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useDocumentStore } from '@/stores/documentStore';
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
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const renderTaskRef = useRef<{ cancel: boolean }>({ cancel: false });

  const activeTool = useUIStore(s => s.activeTool);
  const activeColor = useUIStore(s => s.activeColor);
  const annotations = useAnnotationStore(s => s.annotations);
  const addAnnotation = useAnnotationStore(s => s.addAnnotation);
  const tabs = useDocumentStore(s => s.tabs);
  const activeTabId = useDocumentStore(s => s.activeTabId);
  const activeTab = tabs.find(t => t.id === activeTabId);

  // ── Render PDF canvas + text layer ────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    renderTaskRef.current.cancel = true;
    const currentTask = { cancel: false };
    renderTaskRef.current = currentTask;

    let cancelled = false;

    const doRender = async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled || currentTask.cancel) return;

        const viewport = page.getViewport({ scale: zoom });
        setDimensions({ width: viewport.width, height: viewport.height });

        await renderPage(page, canvas, zoom);
        if (cancelled || currentTask.cancel) return;

        if (textLayerRef.current) {
          const textContent = await page.getTextContent();
          if (cancelled || currentTask.cancel) return;

          const textLayer = textLayerRef.current;
          textLayer.innerHTML = '';

          textContent.items.forEach(item => {
            if (!('str' in item) || !item.str) return;
            const tx = item.transform;
            const fontSize = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]);
            const span = document.createElement('span');
            span.textContent = item.str;
            span.style.position = 'absolute';
            span.style.left = `${tx[4] * zoom}px`;
            span.style.bottom = `${tx[5] * zoom}px`;
            span.style.fontSize = `${fontSize * zoom}px`;
            span.style.fontFamily = 'sans-serif';
            span.style.color = 'transparent';
            span.style.whiteSpace = 'pre';
            span.style.transformOrigin = '0% 0%';
            textLayer.appendChild(span);
          });
        }
      } catch (err) {
        if (!cancelled && !currentTask.cancel) {
          console.error(`Error rendering page ${pageNumber}:`, err);
        }
      }
    };

    doRender();
    return () => { cancelled = true; };
  }, [pdf, pageNumber, zoom]);

  // ── Render text-based annotation overlays ─────────────────────────────────
  // Rects are stored normalised (÷zoom at creation time) so they must be
  // scaled back (×zoom) here.  Adding zoom to deps ensures overlays reposition
  // whenever the user zooms in or out.
  useEffect(() => {
    const layer = annotLayerRef.current;
    if (!layer) return;
    layer.innerHTML = '';

    const pageAnnotations = annotations.filter(
      a => a.page === pageNumber && a.rects && a.rects.length > 0,
    );

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
          // Centre a 2 px line through the rect (override top after scaling)
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

        layer.appendChild(el);
      });
    });
  }, [annotations, pageNumber, zoom]); // zoom added — overlays rescale on every zoom change

  // ── Text selection → annotation creation ──────────────────────────────────
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
        // Normalise to PDF units (÷zoom) so the overlay layer can re-scale
        // correctly at any future zoom level by multiplying back by zoom.
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
  }, [activeTool, activeColor, activeTab, pageNumber, addAnnotation]);

  return (
    <div
      className="relative"
      style={{
        width: dimensions ? `${dimensions.width}px` : 'auto',
        height: dimensions ? `${dimensions.height}px` : 'auto',
        minWidth: '200px',
        minHeight: '280px',
      }}
    >
      {/* PDF canvas */}
      <canvas ref={canvasRef} className="block" />

      {/* Annotation visual overlay (highlight, underline, strikethrough, squiggly) */}
      <div
        ref={annotLayerRef}
        className="absolute inset-0 overflow-hidden pointer-events-none"
      />

      {/* Text selection layer */}
      <div
        ref={textLayerRef}
        className="absolute inset-0 overflow-hidden leading-none select-text"
        style={{ mixBlendMode: 'multiply' }}
        onPointerUp={handleTextSelection}
      />
    </div>
  );
});
