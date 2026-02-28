import { useRef, useEffect, useCallback, useState } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useDocumentStore } from '@/stores/documentStore';
import type { Point } from '@/types';

interface DrawingCanvasProps {
  pageNumber: number;
  zoom: number;
}

export function DrawingCanvas({ pageNumber, zoom }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const pointsRef = useRef<Point[]>([]);

  const activeTool = useUIStore(s => s.activeTool);
  const activeColor = useUIStore(s => s.activeColor);
  const strokeWidth = useUIStore(s => s.strokeWidth);
  const addAnnotation = useAnnotationStore(s => s.addAnnotation);
  const annotations = useAnnotationStore(s => s.annotations);
  const removeAnnotation = useAnnotationStore(s => s.removeAnnotation);
  const tabs = useDocumentStore(s => s.tabs);
  const activeTabId = useDocumentStore(s => s.activeTabId);

  const activeTab = tabs.find(t => t.id === activeTabId);

  // Draw existing freehand annotations for this page
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    canvas.width = parent.offsetWidth;
    canvas.height = parent.offsetHeight;

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const pageAnnotations = annotations.filter(
      a => a.page === pageNumber && a.type === 'freehand' && a.points,
    );

    pageAnnotations.forEach(ann => {
      if (!ann.points || ann.points.length < 2) return;

      ctx.beginPath();
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = (ann.shape?.strokeWidth || 2) * zoom;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.8;

      ctx.moveTo(ann.points[0].x * zoom, ann.points[0].y * zoom);
      for (let i = 1; i < ann.points.length; i++) {
        ctx.lineTo(ann.points[i].x * zoom, ann.points[i].y * zoom);
      }
      ctx.stroke();
    });

    // Draw shape annotations
    const shapeAnnotations = annotations.filter(
      a => a.page === pageNumber && a.type === 'shape' && a.shape,
    );

    shapeAnnotations.forEach(ann => {
      if (!ann.shape) return;
      const { type, startX, startY, endX, endY, strokeWidth: sw } = ann.shape;

      ctx.beginPath();
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = sw * zoom;
      ctx.globalAlpha = 0.8;

      const sx = startX * zoom, sy = startY * zoom;
      const ex = endX * zoom, ey = endY * zoom;

      switch (type) {
        case 'rectangle':
          ctx.strokeRect(sx, sy, ex - sx, ey - sy);
          break;
        case 'circle': {
          const rx = (ex - sx) / 2, ry = (ey - sy) / 2;
          ctx.ellipse(sx + rx, sy + ry, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'line':
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
          ctx.stroke();
          break;
        case 'arrow': {
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
          ctx.stroke();
          // Arrowhead
          const angle = Math.atan2(ey - sy, ex - sx);
          const headLen = 12 * zoom;
          ctx.beginPath();
          ctx.moveTo(ex, ey);
          ctx.lineTo(ex - headLen * Math.cos(angle - 0.4), ey - headLen * Math.sin(angle - 0.4));
          ctx.moveTo(ex, ey);
          ctx.lineTo(ex - headLen * Math.cos(angle + 0.4), ey - headLen * Math.sin(angle + 0.4));
          ctx.stroke();
          break;
        }
      }
    });

    ctx.globalAlpha = 1;
  }, [annotations, pageNumber, zoom]);

  const getPoint = useCallback(
    (e: React.MouseEvent | React.TouchEvent): Point => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      return {
        x: (clientX - rect.left) / zoom,
        y: (clientY - rect.top) / zoom,
      };
    },
    [zoom],
  );

  const handlePointerDown = useCallback(
    (e: React.MouseEvent) => {
      if (activeTool === 'eraser') {
        // Find annotation near click point
        const point = getPoint(e);
        const pageAnnotations = annotations.filter(a => a.page === pageNumber);
        for (const ann of pageAnnotations) {
          if (ann.type === 'freehand' && ann.points) {
            for (const p of ann.points) {
              const dist = Math.sqrt((p.x - point.x) ** 2 + (p.y - point.y) ** 2);
              if (dist < 15) {
                removeAnnotation(ann.id);
                return;
              }
            }
          }
        }
        return;
      }

      if (activeTool !== 'freehand' && activeTool !== 'shape') return;

      setIsDrawing(true);
      const point = getPoint(e);
      pointsRef.current = [point];

      if (activeTool === 'freehand') {
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
          ctx.beginPath();
          ctx.strokeStyle = activeColor;
          ctx.lineWidth = strokeWidth * zoom;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.globalAlpha = 0.8;
          ctx.moveTo(point.x * zoom, point.y * zoom);
        }
      }
    },
    [activeTool, activeColor, strokeWidth, zoom, getPoint, annotations, pageNumber, removeAnnotation],
  );

  const handlePointerMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawing) return;
      const point = getPoint(e);
      pointsRef.current.push(point);

      if (activeTool === 'freehand') {
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
          ctx.lineTo(point.x * zoom, point.y * zoom);
          ctx.stroke();
        }
      }
    },
    [isDrawing, activeTool, zoom, getPoint],
  );

  const handlePointerUp = useCallback(() => {
    if (!isDrawing || !activeTab) return;
    setIsDrawing(false);

    const points = pointsRef.current;
    if (points.length < 2) return;

    if (activeTool === 'freehand') {
      addAnnotation({
        documentId: activeTab.documentId,
        page: pageNumber,
        type: 'freehand',
        color: activeColor,
        points: [...points],
        shape: { type: 'line', startX: 0, startY: 0, endX: 0, endY: 0, strokeWidth },
      });
    } else if (activeTool === 'shape') {
      const start = points[0];
      const end = points[points.length - 1];
      addAnnotation({
        documentId: activeTab.documentId,
        page: pageNumber,
        type: 'shape',
        color: activeColor,
        shape: {
          type: 'rectangle',
          startX: start.x,
          startY: start.y,
          endX: end.x,
          endY: end.y,
          strokeWidth,
        },
      });
    }

    pointsRef.current = [];
  }, [isDrawing, activeTool, activeColor, strokeWidth, pageNumber, activeTab, addAnnotation]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-10"
      style={{ cursor: activeTool === 'eraser' ? 'crosshair' : 'crosshair' }}
      onMouseDown={handlePointerDown}
      onMouseMove={handlePointerMove}
      onMouseUp={handlePointerUp}
      onMouseLeave={handlePointerUp}
    />
  );
}
