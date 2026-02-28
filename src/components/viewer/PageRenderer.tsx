import { useRef, useEffect, useState, memo } from 'react';
import { renderPage } from '@/utils/pdf';
import type { PDFDocumentProxy } from '@/utils/pdf';

interface PageRendererProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
}

export const PageRenderer = memo(function PageRenderer({ pdf, pageNumber, zoom }: PageRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const renderTaskRef = useRef<{ cancel: boolean }>({ cancel: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Cancel previous render
    renderTaskRef.current.cancel = true;
    const currentTask = { cancel: false };
    renderTaskRef.current = currentTask;

    let cancelled = false;

    const doRender = async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled || currentTask.cancel) return;

        const viewport = page.getViewport({ scale: zoom });
        setDimensions({
          width: viewport.width,
          height: viewport.height,
        });

        await renderPage(page, canvas, zoom);
        if (cancelled || currentTask.cancel) return;

        // Render text layer for selection
        if (textLayerRef.current) {
          const textContent = await page.getTextContent();
          if (cancelled || currentTask.cancel) return;

          const textLayer = textLayerRef.current;
          textLayer.innerHTML = '';

          const dpr = window.devicePixelRatio || 1;

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

            if (item.width) {
              const expectedWidth = item.width * zoom;
              span.style.letterSpacing = '0px';
              // We'll adjust after measuring if needed
              const _ = expectedWidth; void _;
            }

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

    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber, zoom]);

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
      <canvas ref={canvasRef} className="block" />
      <div
        ref={textLayerRef}
        className="absolute inset-0 overflow-hidden leading-none select-text"
        style={{ mixBlendMode: 'multiply' }}
      />
    </div>
  );
});
