import { useState, useEffect } from 'react';
import {
  MousePointer2, Highlighter, Underline, Strikethrough,
  MessageSquare, Pencil, Eraser, Square, Undo2, Redo2,
  Type, PenLine, Stamp, Circle, Minus, MoveRight, MoreHorizontal, ChevronUp,
} from 'lucide-react';
import { IconButton } from '@/components/common/IconButton';
import { useUIStore } from '@/stores/uiStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { HIGHLIGHT_COLORS, cn } from '@/utils/helpers';
import type { AnnotationTool, ShapeSubType } from '@/types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ToolDef {
  id: AnnotationTool;
  icon: typeof Highlighter;
  label: string;
  shortcut?: string;
}

// ─── Tool lists ──────────────────────────────────────────────────────────────

/** Always shown on every screen size */
const essentialTools: ToolDef[] = [
  { id: 'select',    icon: MousePointer2, label: 'Select',    shortcut: 'V' },
  { id: 'highlight', icon: Highlighter,   label: 'Highlight', shortcut: 'H' },
  { id: 'freehand',  icon: Pencil,        label: 'Draw',      shortcut: 'P' },
  { id: 'eraser',    icon: Eraser,        label: 'Eraser',    shortcut: 'E' },
  { id: 'note',      icon: MessageSquare, label: 'Note',      shortcut: 'N' },
];

/** Hidden on mobile unless the user taps "More"; always shown on desktop */
const extendedTools: ToolDef[] = [
  { id: 'underline',     icon: Underline,     label: 'Underline',        shortcut: 'U' },
  { id: 'strikethrough', icon: Strikethrough, label: 'Strikethrough' },
  { id: 'squiggly',      icon: Underline,     label: 'Squiggly' },
  { id: 'text',          icon: Type,          label: 'Text box',         shortcut: 'T' },
  { id: 'shape',         icon: Square,        label: 'Shape',            shortcut: 'S' },
  { id: 'signature',     icon: PenLine,       label: 'Signature' },
  { id: 'stamp',         icon: Stamp,         label: 'Stamp' },
];

const shapeTypes: { id: ShapeSubType; icon: typeof Square; label: string }[] = [
  { id: 'rectangle', icon: Square,    label: 'Rectangle' },
  { id: 'circle',    icon: Circle,    label: 'Circle' },
  { id: 'arrow',     icon: MoveRight, label: 'Arrow' },
  { id: 'line',      icon: Minus,     label: 'Line' },
];

const STROKE_WIDTHS = [1, 2, 4, 8];

// ─── Responsive hook ─────────────────────────────────────────────────────────

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    setIsMobile(mq.matches);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AnnotationToolbar() {
  const isMobile = useIsMobile();
  const [moreOpen, setMoreOpen] = useState(false);

  const activeTool       = useUIStore(s => s.activeTool);
  const setActiveTool    = useUIStore(s => s.setActiveTool);
  const activeColor      = useUIStore(s => s.activeColor);
  const setActiveColor   = useUIStore(s => s.setActiveColor);
  const strokeWidth      = useUIStore(s => s.strokeWidth);
  const setStrokeWidth   = useUIStore(s => s.setStrokeWidth);
  const shapeSubType     = useUIStore(s => s.shapeSubType);
  const setShapeSubType  = useUIStore(s => s.setShapeSubType);
  const focusMode        = useUIStore(s => s.focusMode);
  const setSignatureDialogOpen = useUIStore(s => s.setSignatureDialogOpen);
  const setStampPickerOpen     = useUIStore(s => s.setStampPickerOpen);
  const setPendingSignature    = useUIStore(s => s.setPendingSignature);
  const setPendingStamp        = useUIStore(s => s.setPendingStamp);

  const canUndo = useAnnotationStore(s => s.canUndo);
  const canRedo = useAnnotationStore(s => s.canRedo);
  const undo    = useAnnotationStore(s => s.undo);
  const redo    = useAnnotationStore(s => s.redo);

  if (focusMode) return null;

  const showColorPicker = activeTool === 'highlight' || activeTool === 'underline'
    || activeTool === 'squiggly' || activeTool === 'freehand' || activeTool === 'shape'
    || activeTool === 'text';
  const showStrokeWidth = activeTool === 'freehand' || activeTool === 'shape';
  const showShapePicker = activeTool === 'shape';

  const handleToolClick = (toolId: AnnotationTool) => {
    if (toolId === 'signature') {
      setPendingSignature(null);
      setSignatureDialogOpen(true);
      return;
    }
    if (toolId === 'stamp') {
      setPendingStamp(null);
      setStampPickerOpen(true);
      return;
    }
    setActiveTool(activeTool === toolId ? null : toolId);
  };

  // On mobile show only essentials unless expanded; on desktop always show all
  const visibleTools = isMobile && !moreOpen
    ? essentialTools
    : [...essentialTools, ...extendedTools];

  // Active tool name (shown on mobile as context indicator)
  const activeToolDef = [...essentialTools, ...extendedTools].find(t => t.id === activeTool);

  return (
    <div className="shrink-0 bg-surface-1 border-t border-border" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>

      {/* ── Active tool chip (mobile only, shown when a tool is active) ────── */}
      {isMobile && activeTool && activeTool !== 'select' && activeToolDef && (
        <div className="flex items-center justify-between px-3 py-1 bg-brand-500/10 border-b border-brand-500/20">
          <span className="text-xs font-medium text-brand-400">
            {activeToolDef.label} active
          </span>
          <button
            onClick={() => setActiveTool(null)}
            className="text-2xs text-on-surface-secondary hover:text-on-surface px-2 py-0.5 rounded bg-white/5"
          >
            Done
          </button>
        </div>
      )}

      {/* ── Main toolbar row ─────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-0.5 overflow-x-auto px-2 py-1.5 md:justify-center md:px-3 md:h-12 md:py-0"
        style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
      >
        {/* Tool buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {visibleTools.map(tool => (
            <IconButton
              key={tool.id}
              tooltip={tool.label}
              shortcut={tool.shortcut}
              tooltipSide="top"
              size="sm"
              active={activeTool === tool.id}
              onClick={() => handleToolClick(tool.id)}
            >
              <tool.icon size={16} />
            </IconButton>
          ))}
        </div>

        {/* "More / Less" toggle — mobile only */}
        {isMobile && (
          <>
            <div className="w-px h-5 bg-border mx-0.5 shrink-0" />
            <IconButton
              tooltip={moreOpen ? 'Show less' : 'More tools'}
              tooltipSide="top"
              size="sm"
              active={moreOpen}
              onClick={() => setMoreOpen(v => !v)}
              className="shrink-0"
            >
              {moreOpen ? <ChevronUp size={15} /> : <MoreHorizontal size={15} />}
            </IconButton>
          </>
        )}

        <div className="w-px h-6 bg-border mx-1 shrink-0" />

        {/* Color picker */}
        {showColorPicker && (
          <>
            <div className="flex items-center gap-1.5 px-1 shrink-0">
              {HIGHLIGHT_COLORS.map(color => (
                <button
                  key={color.value}
                  onClick={() => setActiveColor(color.value)}
                  className={cn(
                    'rounded-full transition-all border-2 shrink-0',
                    // Larger on mobile for easier tapping
                    'w-7 h-7 md:w-5 md:h-5',
                    activeColor === color.value
                      ? 'border-white scale-110 shadow-glow'
                      : 'border-transparent hover:scale-105',
                  )}
                  style={{ backgroundColor: color.value }}
                  title={color.name}
                />
              ))}
            </div>
            <div className="w-px h-6 bg-border mx-1 shrink-0" />
          </>
        )}

        {/* Undo / Redo */}
        <div className="flex items-center gap-0.5 shrink-0">
          <IconButton
            tooltip="Undo" shortcut="Ctrl+Z" tooltipSide="top" size="sm"
            onClick={undo} disabled={!canUndo()}
          >
            <Undo2 size={16} />
          </IconButton>
          <IconButton
            tooltip="Redo" shortcut="Ctrl+Y" tooltipSide="top" size="sm"
            onClick={redo} disabled={!canRedo()}
          >
            <Redo2 size={16} />
          </IconButton>
        </div>
      </div>

      {/* ── Secondary row: shape + stroke width ──────────────────────────── */}
      {(showShapePicker || showStrokeWidth) && (
        <div
          className="flex items-center gap-2 overflow-x-auto px-2 py-1.5 border-t border-border/50 bg-surface-0/50 md:justify-center md:h-9 md:py-0"
          style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
        >
          {showShapePicker && (
            <div className="flex items-center gap-0.5 shrink-0">
              <span className="text-2xs text-on-surface-secondary mr-1 shrink-0">Shape:</span>
              {shapeTypes.map(st => (
                <IconButton
                  key={st.id}
                  tooltip={st.label}
                  tooltipSide="top"
                  size="sm"
                  active={shapeSubType === st.id}
                  onClick={() => setShapeSubType(st.id)}
                >
                  <st.icon size={14} />
                </IconButton>
              ))}
            </div>
          )}

          {showShapePicker && showStrokeWidth && (
            <div className="w-px h-5 bg-border mx-1 shrink-0" />
          )}

          {showStrokeWidth && (
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-2xs text-on-surface-secondary mr-1 shrink-0">Width:</span>
              {STROKE_WIDTHS.map(w => (
                <button
                  key={w}
                  onClick={() => setStrokeWidth(w)}
                  className={cn(
                    'w-9 h-9 md:w-7 md:h-7 rounded-lg flex items-center justify-center transition-colors shrink-0',
                    strokeWidth === w
                      ? 'bg-brand-500/20 text-brand-400'
                      : 'text-on-surface-secondary hover:bg-white/5',
                  )}
                  title={`${w}px`}
                >
                  <div
                    className="rounded-full bg-current"
                    style={{ width: `${Math.min(w * 3, 16)}px`, height: `${w}px` }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
