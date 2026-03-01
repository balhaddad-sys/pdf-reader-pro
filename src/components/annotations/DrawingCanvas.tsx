import { useRef, useEffect, useCallback, useState } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useDocumentStore } from '@/stores/documentStore';
import type { Point } from '@/types';

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

export function DrawingCanvas({ pageNumber, zoom }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [textEditor, setTextEditor] = useState<TextEditorState>({ active: false, x: 0, y: 0, value: '' });
  const pointsRef = useRef<Point[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeTool = useUIStore(s => s.activeTool);
  const activeColor = useUIStore(s => s.activeColor);
  const strokeWidth = useUIStore(s => s.strokeWidth);
  const shapeSubType = useUIStore(s => s.shapeSubType);
  const pendingSignature = useUIStore(s => s.pendingSignature);
  const setActiveTool = useUIStore(s => s.setActiveTool);
  const pendingStamp = useUIStore(s => s.pendingStamp);

  const addAnnotation = useAnnotationStore(s => s.addAnnotation);
  const annotations = useAnnotationStore(s => s.annotations);
  const removeAnnotation = useAnnotationStore(s => s.removeAnnotation);
  const tabs = useDocumentStore(s => s.tabs);
  const activeTabId = useDocumentStore(s => s.activeTabId);

  const activeTab = tabs.find(t => t.id === activeTabId);

  // Focus textarea when text editor opens
  useEffect(() => {
    if (textEditor.active) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [textEditor.active]);

  // Redraw canvas whenever annotations change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    canvas.width = parent.offsetWidth;
    canvas.height = parent.offsetHeight;

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const pageAnnotations = annotations.filter(a => a.page === pageNumber);

    // ── Freehand ──────────────────────────────────────────────────────────────
    pageAnnotations.filter(a => a.type === 'freehand' && a.points).forEach(ann => {
      if (!ann.points || ann.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = (ann.shape?.strokeWidth || 2) * zoom;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.85;
      ctx.moveTo(ann.points[0].x * zoom, ann.points[0].y * zoom);
      for (let i = 1; i < ann.points.length; i++) {
        ctx.lineTo(ann.points[i].x * zoom, ann.points[i].y * zoom);
      }
      ctx.stroke();
    });

    // ── Shapes ────────────────────────────────────────────────────────────────
    pageAnnotations.filter(a => a.type === 'shape' && a.shape).forEach(ann => {
      if (!ann.shape) return;
      const { type, startX, startY, endX, endY, strokeWidth: sw } = ann.shape;
      ctx.beginPath();
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = sw * zoom;
      ctx.globalAlpha = 0.85;
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
          const angle = Math.atan2(ey - sy, ex - sx);
          const headLen = 14 * zoom;
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

    // ── Notes (sticky notes) ──────────────────────────────────────────────────
    pageAnnotations.filter(a => a.type === 'note' && a.position && a.content).forEach(ann => {
      const x = ann.position!.x * zoom;
      const y = ann.position!.y * zoom;
      const fontSize = 13 * zoom;
      ctx.font = `${fontSize}px sans-serif`;
      const lines = ann.content!.split('\n');
      const lineH = fontSize * 1.4;
      const maxW = Math.max(...lines.map(l => ctx.measureText(l).width), 80 * zoom);
      const pad = 6 * zoom;
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(x - pad, y - fontSize, maxW + pad * 2, lineH * lines.length + pad * 2);
      ctx.strokeStyle = '#ca8a04';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - pad, y - fontSize, maxW + pad * 2, lineH * lines.length + pad * 2);
      ctx.fillStyle = '#422006';
      ctx.globalAlpha = 1;
      lines.forEach((line, i) => ctx.fillText(line, x, y + lineH * i));
    });

    // ── Text boxes ────────────────────────────────────────────────────────────
    pageAnnotations.filter(a => a.type === 'text' && a.position && a.content).forEach(ann => {
      const x = ann.position!.x * zoom;
      const y = ann.position!.y * zoom;
      const fontSize = (ann.fontSize || 16) * zoom;
      ctx.font = `${fontSize}px ${ann.fontFamily || 'sans-serif'}`;
      ctx.fillStyle = ann.color || '#1e293b';
      ctx.globalAlpha = 1;
      // Draw background
      const lines = ann.content!.split('\n');
      const lineH = fontSize * 1.4;
      const maxW = Math.max(...lines.map(l => ctx.measureText(l).width));
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(x - 4, y - fontSize, maxW + 8, lineH * lines.length + 8);
      ctx.fillStyle = ann.color || '#1e293b';
      lines.forEach((line, i) => {
        ctx.fillText(line, x, y + lineH * i);
      });
    });

    // ── Signature / Stamp images ───────────────────────────────────────────────
    const imageAnnotations = pageAnnotations.filter(
      a => (a.type === 'signature' || a.type === 'stamp') && a.imageData && a.position,
    );
    imageAnnotations.forEach(ann => {
      const img = new Image();
      img.onload = () => {
        if (!canvasRef.current) return;
        const c = canvasRef.current.getContext('2d')!;
        const x = ann.position!.x * zoom;
        const y = ann.position!.y * zoom;
        const w = (ann.width || 200) * zoom;
        const h = (ann.height || 60) * zoom;
        c.globalAlpha = 0.95;
        c.drawImage(img, x, y, w, h);
        c.globalAlpha = 1;
      };
      img.src = ann.imageData!;
    });

    ctx.globalAlpha = 1;
  }, [annotations, pageNumber, zoom]);

  const getPoint = useCallback(
    (e: React.PointerEvent): Point => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) / zoom,
        y: (e.clientY - rect.top) / zoom,
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
          // Also allow erasing shapes, stamps, signatures
          if ((ann.type === 'shape' || ann.type === 'text' || ann.type === 'signature' || ann.type === 'stamp') && ann.position) {
            const dx = Math.abs(ann.position.x - point.x);
            const dy = Math.abs(ann.position.y - point.y);
            if (dx < 30 && dy < 30) {
              removeAnnotation(ann.id);
              return;
            }
          }
        }
        return;
      }

      // ── Text / Note tool ─────────────────────────────────────────────────────
      if (activeTool === 'text' || activeTool === 'note') {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        setTextEditor({
          active: true,
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          value: '',
        });
        return;
      }

      // ── Signature placement ──────────────────────────────────────────────────
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
        // Stay in placement mode so multiple sigs can be placed
        return;
      }

      // ── Stamp placement ──────────────────────────────────────────────────────
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

      // ── Freehand & Shapes ────────────────────────────────────────────────────
      if (activeTool !== 'freehand' && activeTool !== 'shape') return;

      // Capture pointer here (only for stroke tools) so pointermove/up fire
      // even if the finger leaves the canvas mid-stroke
      (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
      setIsDrawing(true);
      pointsRef.current = [point];

      if (activeTool === 'freehand') {
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
          ctx.beginPath();
          ctx.strokeStyle = activeColor;
          ctx.lineWidth = strokeWidth * zoom;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
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

  // Determine if this canvas should capture events
  const isInteractive = activeTool === 'freehand' || activeTool === 'eraser'
    || activeTool === 'shape' || activeTool === 'text' || activeTool === 'note'
    || activeTool === 'signature' || activeTool === 'stamp';
  // Drawing tools need touchAction:none to prevent scroll stealing mid-stroke.
  // Tap-only tools (note/text/signature/stamp) allow pan so the user can scroll
  // to position before tapping to place.
  const isStrokeTool = activeTool === 'freehand' || activeTool === 'eraser' || activeTool === 'shape';

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-10"
        style={{
          pointerEvents: isInteractive ? 'auto' : 'none',
          // Stroke tools need none to prevent scroll mid-draw.
          // Tap-only tools use pan-x pan-y so the user can still scroll to position.
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
          // Stop pointer events from reaching the canvas so tapping the editor
          // doesn't re-trigger handlePointerDown
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
          {/* Explicit confirm / cancel buttons — onBlur is intentionally omitted
              because on mobile the tap that opened the editor fires a click that
              would blur the textarea before the user types anything */}
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
