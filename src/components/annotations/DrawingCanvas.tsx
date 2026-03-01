import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useDocumentStore } from '@/stores/documentStore';
import type { Point, ShapeSubType } from '@/types';

interface DrawingCanvasProps {
  pageNumber: number;
  zoom: number;
}

// Inline text editor that appears when user clicks with the text tool
interface TextEditorState {
  active: boolean;
  x: number;
  y: number;
  value: string;
}

// ─── Shape drawing helper ─────────────────────────────────────────────────────
// Caller sets strokeStyle / lineWidth / globalAlpha before calling.
function drawShapeOnCtx(
  ctx: CanvasRenderingContext2D,
  type: ShapeSubType,
  sx: number, sy: number,
  ex: number, ey: number,
  zoom: number,
) {
  const sxz = sx * zoom, syz = sy * zoom, exz = ex * zoom, eyz = ey * zoom;
  ctx.beginPath();
  switch (type) {
    case 'rectangle':
      ctx.strokeRect(sxz, syz, exz - sxz, eyz - syz);
      break;
    case 'circle': {
      const rx = (exz - sxz) / 2;
      const ry = (eyz - syz) / 2;
      ctx.ellipse(sxz + rx, syz + ry, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'line':
      ctx.moveTo(sxz, syz);
      ctx.lineTo(exz, eyz);
      ctx.stroke();
      break;
    case 'arrow': {
      ctx.moveTo(sxz, syz);
      ctx.lineTo(exz, eyz);
      ctx.stroke();
      const angle   = Math.atan2(eyz - syz, exz - sxz);
      const headLen = 14 * zoom;
      ctx.beginPath();
      ctx.moveTo(exz, eyz);
      ctx.lineTo(exz - headLen * Math.cos(angle - 0.4), eyz - headLen * Math.sin(angle - 0.4));
      ctx.moveTo(exz, eyz);
      ctx.lineTo(exz - headLen * Math.cos(angle + 0.4), eyz - headLen * Math.sin(angle + 0.4));
      ctx.stroke();
      break;
    }
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DrawingCanvas({ pageNumber, zoom }: DrawingCanvasProps) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [textEditor, setTextEditor] = useState<TextEditorState>({ active: false, x: 0, y: 0, value: '' });
  const pointsRef   = useRef<Point[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeTool       = useUIStore(s => s.activeTool);
  const activeColor      = useUIStore(s => s.activeColor);
  const strokeWidth      = useUIStore(s => s.strokeWidth);
  const shapeSubType     = useUIStore(s => s.shapeSubType);
  const pendingSignature = useUIStore(s => s.pendingSignature);
  const setActiveTool    = useUIStore(s => s.setActiveTool);
  const pendingStamp     = useUIStore(s => s.pendingStamp);

  const addAnnotation    = useAnnotationStore(s => s.addAnnotation);
  const annotations      = useAnnotationStore(s => s.annotations);
  const removeAnnotation = useAnnotationStore(s => s.removeAnnotation);
  const tabs             = useDocumentStore(s => s.tabs);
  const activeTabId      = useDocumentStore(s => s.activeTabId);
  const activeTab        = tabs.find(t => t.id === activeTabId);

  // Focus textarea when text editor opens
  useEffect(() => {
    if (textEditor.active) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [textEditor.active]);

  // ── Canvas redraw ─────────────────────────────────────────────────────────
  // Extracted as useCallback so shape-preview can call it to clear + repaint
  // all committed annotations before overlaying the in-progress ghost shape.
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    canvas.width  = parent.offsetWidth;
    canvas.height = parent.offsetHeight;

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const pageAnnotations = annotations.filter(a => a.page === pageNumber);

    // ── Freehand (bezier-smoothed) ───────────────────────────────────────────
    pageAnnotations.filter(a => a.type === 'freehand' && a.points).forEach(ann => {
      const pts = ann.points!;
      if (pts.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = ann.color;
      ctx.lineWidth   = (ann.shape?.strokeWidth || 2) * zoom;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.globalAlpha = 0.85;
      ctx.moveTo(pts[0].x * zoom, pts[0].y * zoom);
      // Quadratic bezier through midpoints — produces a smooth curve through all samples
      for (let i = 1; i < pts.length - 1; i++) {
        const midX = (pts[i].x + pts[i + 1].x) / 2 * zoom;
        const midY = (pts[i].y + pts[i + 1].y) / 2 * zoom;
        ctx.quadraticCurveTo(pts[i].x * zoom, pts[i].y * zoom, midX, midY);
      }
      ctx.lineTo(pts[pts.length - 1].x * zoom, pts[pts.length - 1].y * zoom);
      ctx.stroke();
    });

    // ── Shapes ───────────────────────────────────────────────────────────────
    pageAnnotations.filter(a => a.type === 'shape' && a.shape).forEach(ann => {
      const { type, startX, startY, endX, endY, strokeWidth: sw } = ann.shape!;
      ctx.strokeStyle = ann.color;
      ctx.lineWidth   = sw * zoom;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.globalAlpha = 0.85;
      drawShapeOnCtx(ctx, type, startX, startY, endX, endY, zoom);
    });

    // ── Notes (sticky notes) ─────────────────────────────────────────────────
    pageAnnotations.filter(a => a.type === 'note' && a.position && a.content).forEach(ann => {
      const x       = ann.position!.x * zoom;
      const y       = ann.position!.y * zoom;
      const fontSize = 13 * zoom;
      ctx.font = `${fontSize}px sans-serif`;
      const lines = ann.content!.split('\n');
      const lineH = fontSize * 1.4;
      const maxW  = Math.max(...lines.map(l => ctx.measureText(l).width), 80 * zoom);
      const pad   = 6 * zoom;
      ctx.globalAlpha = 0.95;
      ctx.fillStyle   = '#fef08a';
      ctx.fillRect(x - pad, y - fontSize, maxW + pad * 2, lineH * lines.length + pad * 2);
      ctx.strokeStyle = '#ca8a04';
      ctx.lineWidth   = 1.5;
      ctx.strokeRect(x - pad, y - fontSize, maxW + pad * 2, lineH * lines.length + pad * 2);
      ctx.fillStyle   = '#422006';
      ctx.globalAlpha = 1;
      lines.forEach((line, i) => ctx.fillText(line, x, y + lineH * i));
    });

    // ── Text boxes ───────────────────────────────────────────────────────────
    pageAnnotations.filter(a => a.type === 'text' && a.position && a.content).forEach(ann => {
      const x        = ann.position!.x * zoom;
      const y        = ann.position!.y * zoom;
      const fontSize = (ann.fontSize || 16) * zoom;
      ctx.font = `${fontSize}px ${ann.fontFamily || 'sans-serif'}`;
      const lines = ann.content!.split('\n');
      const lineH = fontSize * 1.4;
      const maxW  = Math.max(...lines.map(l => ctx.measureText(l).width));
      ctx.globalAlpha = 1;
      ctx.fillStyle   = 'rgba(255,255,255,0.85)';
      ctx.fillRect(x - 4, y - fontSize, maxW + 8, lineH * lines.length + 8);
      ctx.fillStyle = ann.color || '#1e293b';
      lines.forEach((line, i) => ctx.fillText(line, x, y + lineH * i));
    });

    // ── Signature / Stamp images (async loads) ────────────────────────────────
    pageAnnotations
      .filter(a => (a.type === 'signature' || a.type === 'stamp') && a.imageData && a.position)
      .forEach(ann => {
        const img = new Image();
        img.onload = () => {
          if (!canvasRef.current) return;
          const c = canvasRef.current.getContext('2d')!;
          const x = ann.position!.x * zoom;
          const y = ann.position!.y * zoom;
          const w = (ann.width  || 200) * zoom;
          const h = (ann.height ||  60) * zoom;
          c.globalAlpha = 0.95;
          c.drawImage(img, x, y, w, h);
          c.globalAlpha = 1;
        };
        img.src = ann.imageData!;
      });

    ctx.globalAlpha = 1;
  }, [annotations, pageNumber, zoom]);

  // Redraw whenever annotations, page, or zoom change
  useEffect(() => { redrawCanvas(); }, [redrawCanvas]);

  const getPoint = useCallback(
    (e: React.PointerEvent): Point => {
      const canvas = canvasRef.current!;
      const rect   = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) / zoom,
        y: (e.clientY - rect.top)  / zoom,
      };
    },
    [zoom],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!activeTab) return;
      const point = getPoint(e);

      // ── Eraser ──────────────────────────────────────────────────────────────
      if (activeTool === 'eraser') {
        const pageAnnotations = annotations.filter(a => a.page === pageNumber);
        for (const ann of pageAnnotations) {
          if (ann.type === 'freehand' && ann.points) {
            for (const p of ann.points) {
              if (Math.sqrt((p.x - point.x) ** 2 + (p.y - point.y) ** 2) < 15) {
                removeAnnotation(ann.id);
                return;
              }
            }
          }
          if (
            (ann.type === 'shape' || ann.type === 'text' || ann.type === 'signature' || ann.type === 'stamp') &&
            ann.position
          ) {
            if (Math.abs(ann.position.x - point.x) < 30 && Math.abs(ann.position.y - point.y) < 30) {
              removeAnnotation(ann.id);
              return;
            }
          }
        }
        return;
      }

      // ── Text / Note tool ──────────────────────────────────────────────────
      if (activeTool === 'text' || activeTool === 'note') {
        const canvas = canvasRef.current!;
        const rect   = canvas.getBoundingClientRect();
        setTextEditor({
          active: true,
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          value: '',
        });
        return;
      }

      // ── Signature placement ───────────────────────────────────────────────
      if (activeTool === 'signature' && pendingSignature) {
        addAnnotation({
          documentId: activeTab.documentId,
          page: pageNumber,
          type: 'signature',
          color: activeColor,
          position: point,
          imageData: pendingSignature,
          width: 200,
          height: 70,
        });
        return;
      }

      // ── Stamp placement ───────────────────────────────────────────────────
      if (activeTool === 'stamp' && pendingStamp) {
        addAnnotation({
          documentId: activeTab.documentId,
          page: pageNumber,
          type: 'stamp',
          color: activeColor,
          position: point,
          imageData: pendingStamp.imageData,
          content: pendingStamp.label,
          width: 180,
          height: 55,
        });
        return;
      }

      // ── Freehand & Shapes ─────────────────────────────────────────────────
      if (activeTool !== 'freehand' && activeTool !== 'shape') return;

      (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
      setIsDrawing(true);
      pointsRef.current = [point];

      if (activeTool === 'freehand') {
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
          ctx.beginPath();
          ctx.strokeStyle = activeColor;
          ctx.lineWidth   = strokeWidth * zoom;
          ctx.lineCap     = 'round';
          ctx.lineJoin    = 'round';
          ctx.globalAlpha = 0.85;
          ctx.moveTo(point.x * zoom, point.y * zoom);
        }
      }
    },
    [
      activeTool, activeColor, strokeWidth, zoom, getPoint,
      annotations, pageNumber, removeAnnotation, addAnnotation,
      activeTab, pendingSignature, pendingStamp,
    ],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDrawing) return;
      const point = getPoint(e);
      pointsRef.current.push(point);

      if (activeTool === 'freehand') {
        // ── Live smooth bezier ─────────────────────────────────────────────
        // Each move draws one segment: from the previous midpoint to the new
        // midpoint, using the previous sample as the quadratic control point.
        // This produces perfectly smooth, lag-free curves.
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
          const pts = pointsRef.current;
          if (pts.length >= 2) {
            const prev = pts[pts.length - 2];
            const midX = (prev.x + point.x) / 2 * zoom;
            const midY = (prev.y + point.y) / 2 * zoom;
            ctx.quadraticCurveTo(prev.x * zoom, prev.y * zoom, midX, midY);
            ctx.stroke();
            // Start the next segment from the midpoint for seamless curves
            ctx.beginPath();
            ctx.moveTo(midX, midY);
          }
        }
      } else if (activeTool === 'shape' && pointsRef.current.length > 0) {
        // ── Live shape preview (dashed ghost) ─────────────────────────────
        // Clear + repaint committed annotations, then overlay the ghost shape.
        redrawCanvas();
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
          const start = pointsRef.current[0];
          ctx.save();
          ctx.strokeStyle = activeColor;
          ctx.lineWidth   = strokeWidth * zoom;
          ctx.lineCap     = 'round';
          ctx.lineJoin    = 'round';
          ctx.globalAlpha = 0.75;
          ctx.setLineDash([6 * zoom, 4 * zoom]);
          drawShapeOnCtx(ctx, shapeSubType, start.x, start.y, point.x, point.y, zoom);
          ctx.restore();
        }
      }
    },
    [isDrawing, activeTool, zoom, getPoint, redrawCanvas, activeColor, strokeWidth, shapeSubType],
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
      const end   = points[points.length - 1];
      addAnnotation({
        documentId: activeTab.documentId,
        page: pageNumber,
        type: 'shape',
        color: activeColor,
        shape: {
          type: shapeSubType,
          startX: start.x,
          startY: start.y,
          endX: end.x,
          endY: end.y,
          strokeWidth,
        },
      });
    }

    pointsRef.current = [];
  }, [isDrawing, activeTool, activeColor, strokeWidth, shapeSubType, pageNumber, activeTab, addAnnotation]);

  const handleTextConfirm = useCallback(() => {
    if (!activeTab || !textEditor.value.trim()) {
      setTextEditor(s => ({ ...s, active: false, value: '' }));
      return;
    }
    addAnnotation({
      documentId: activeTab.documentId,
      page: pageNumber,
      type: activeTool === 'note' ? 'note' : 'text',
      color: activeColor,
      content: textEditor.value,
      position: {
        x: textEditor.x / zoom,
        y: textEditor.y / zoom,
      },
      fontSize: 16,
      fontFamily: 'sans-serif',
    });
    setTextEditor({ active: false, x: 0, y: 0, value: '' });
  }, [activeTab, textEditor, activeTool, activeColor, zoom, pageNumber, addAnnotation]);

  const isInteractive = activeTool === 'freehand' || activeTool === 'eraser'
    || activeTool === 'shape' || activeTool === 'text' || activeTool === 'note'
    || activeTool === 'signature' || activeTool === 'stamp';
  const isStrokeTool = activeTool === 'freehand' || activeTool === 'eraser' || activeTool === 'shape';

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-10"
        style={{
          pointerEvents: isInteractive ? 'auto' : 'none',
          touchAction: isStrokeTool ? 'none' : (isInteractive ? 'pan-x pan-y' : 'auto'),
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      {/* Inline text editor overlay */}
      {textEditor.active && (
        <div
          className="absolute z-20"
          style={{ left: textEditor.x, top: textEditor.y }}
          onPointerDown={e => e.stopPropagation()}
        >
          <textarea
            ref={textareaRef}
            value={textEditor.value}
            onChange={e => setTextEditor(s => ({ ...s, value: e.target.value }))}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                setTextEditor({ active: false, x: 0, y: 0, value: '' });
                setActiveTool(null);
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleTextConfirm();
              }
            }}
            placeholder={activeTool === 'note' ? 'Write note...' : 'Type text...'}
            className={`min-w-[160px] min-h-[72px] px-2 py-1.5 text-sm rounded-t border shadow-lg resize-none focus:outline-none block w-full ${
              activeTool === 'note'
                ? 'bg-yellow-100 border-yellow-400 text-yellow-900'
                : 'bg-white/95 border-brand-500 text-gray-900'
            }`}
            style={activeTool === 'note' ? undefined : { color: activeColor }}
            rows={3}
          />
          {/* Explicit confirm / cancel buttons */}
          <div className={`flex rounded-b border-x border-b overflow-hidden ${
            activeTool === 'note' ? 'border-yellow-400' : 'border-brand-500'
          }`}>
            <button
              onPointerDown={e => { e.preventDefault(); e.stopPropagation(); handleTextConfirm(); }}
              className="flex-1 py-1.5 text-xs font-medium bg-brand-500 text-white active:bg-brand-600"
            >
              ✓ Done
            </button>
            <button
              onPointerDown={e => {
                e.preventDefault(); e.stopPropagation();
                setTextEditor({ active: false, x: 0, y: 0, value: '' });
                setActiveTool(null);
              }}
              className="flex-1 py-1.5 text-xs font-medium bg-surface-2 text-on-surface-secondary active:bg-surface-3"
            >
              ✕ Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
