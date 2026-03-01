import React from 'react';
import {
  MousePointer2, Highlighter, Underline, Strikethrough,
  MessageSquare, Pencil, Eraser, Square, Undo2, Redo2,
  Type, PenLine, Stamp, Circle, Minus, MoveRight,
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

// ─── Tool list ────────────────────────────────────────────────────────────────
// All tools in one flat array — no "More" button needed.
// Scroll horizontally on mobile to access any tool instantly.

const allTools: ToolDef[] = [
  { id: 'select',        icon: MousePointer2, label: 'Select',        shortcut: 'V' },
  { id: 'highlight',     icon: Highlighter,   label: 'Highlight',     shortcut: 'H' },
  { id: 'underline',     icon: Underline,     label: 'Underline',     shortcut: 'U' },
  { id: 'strikethrough', icon: Strikethrough, label: 'Strikethrough' },
  { id: 'squiggly',      icon: Underline,     label: 'Squiggly' },
  { id: 'freehand',      icon: Pencil,        label: 'Draw',          shortcut: 'P' },
  { id: 'eraser',        icon: Eraser,        label: 'Eraser',        shortcut: 'E' },
  { id: 'note',          icon: MessageSquare, label: 'Note',          shortcut: 'N' },
  { id: 'text',          icon: Type,          label: 'Text',          shortcut: 'T' },
  { id: 'shape',         icon: Square,        label: 'Shape',         shortcut: 'S' },
  { id: 'signature',     icon: PenLine,       label: 'Signature' },
  { id: 'stamp',         icon: Stamp,         label: 'Stamp' },
];

// Visual group separators: a thin divider is inserted BEFORE these tool IDs.
const GROUP_START = new Set<AnnotationTool>(['highlight', 'freehand', 'note', 'shape']);

const shapeTypes: { id: ShapeSubType; icon: typeof Square; label: string }[] = [
  { id: 'rectangle', icon: Square,    label: 'Rectangle' },
  { id: 'circle',    icon: Circle,    label: 'Circle' },
  { id: 'arrow',     icon: MoveRight, label: 'Arrow' },
  { id: 'line',      icon: Minus,     label: 'Line' },
];

const STROKE_WIDTHS = [1, 2, 4, 8];

// ─── Component ───────────────────────────────────────────────────────────────

export function AnnotationToolbar() {
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

  return (
    <div className="shrink-0 bg-surface-1 border-t border-border" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>

      {/* ── Main toolbar row ──────────────────────────────────────────────────
           All tools are always visible — scroll horizontally on mobile.
           No "More" button, no hidden tools, no active-tool chip.          */}
      <div
        className="flex items-center gap-0.5 overflow-x-auto px-2 py-1.5 md:justify-center md:px-3 md:h-12 md:py-0"
        style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
      >
        {/* Tool buttons with visual group separators */}
        <div className="flex items-center gap-0.5 shrink-0">
          {allTools.map(tool => (
            <React.Fragment key={tool.id}>
              {GROUP_START.has(tool.id) && (
                <div className="w-px h-5 bg-border mx-0.5 shrink-0" />
              )}
              <IconButton
                tooltip={tool.label}
                shortcut={tool.shortcut}
                tooltipSide="top"
                size="sm"
                active={activeTool === tool.id}
                onClick={() => handleToolClick(tool.id)}
              >
                <tool.icon size={16} />
              </IconButton>
            </React.Fragment>
          ))}
        </div>

        <div className="w-px h-6 bg-border mx-1 shrink-0" />

        {/* Color swatches — inline so they're reachable by scrolling on mobile */}
        {showColorPicker && (
          <>
            <div className="flex items-center gap-1.5 px-1 shrink-0">
              {HIGHLIGHT_COLORS.map(color => (
                <button
                  key={color.value}
                  onClick={() => setActiveColor(color.value)}
                  className={cn(
                    'rounded-full transition-all border-2 shrink-0',
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

      {/* ── Secondary row: shape sub-type + stroke width ─────────────────── */}
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
