import React from 'react';
import {
  MousePointer2, Highlighter, Underline, Strikethrough,
  MessageSquare, Pencil, Eraser, Square, Undo2, Redo2,
  Type, PenLine, Stamp, Circle, Minus, MoveRight,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { Tooltip } from '@/components/common/Tooltip';
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
// All tools in one flat array — always visible, scroll horizontally on mobile.

const allTools: ToolDef[] = [
  { id: 'select',        icon: MousePointer2, label: 'Select',    shortcut: 'V' },
  { id: 'highlight',     icon: Highlighter,   label: 'Highlight', shortcut: 'H' },
  { id: 'underline',     icon: Underline,     label: 'Underline', shortcut: 'U' },
  { id: 'strikethrough', icon: Strikethrough, label: 'Strike' },
  { id: 'squiggly',      icon: Underline,     label: 'Squiggly' },
  { id: 'freehand',      icon: Pencil,        label: 'Draw',      shortcut: 'P' },
  { id: 'eraser',        icon: Eraser,        label: 'Eraser',    shortcut: 'E' },
  { id: 'note',          icon: MessageSquare, label: 'Note',      shortcut: 'N' },
  { id: 'text',          icon: Type,          label: 'Text',      shortcut: 'T' },
  { id: 'shape',         icon: Square,        label: 'Shape',     shortcut: 'S' },
  { id: 'signature',     icon: PenLine,       label: 'Sign' },
  { id: 'stamp',         icon: Stamp,         label: 'Stamp' },
];

// Thin divider inserted BEFORE these IDs to group related tools visually.
const GROUP_START = new Set<AnnotationTool>(['highlight', 'freehand', 'note', 'shape']);

const shapeTypes: { id: ShapeSubType; icon: typeof Square; label: string }[] = [
  { id: 'rectangle', icon: Square,    label: 'Rectangle' },
  { id: 'circle',    icon: Circle,    label: 'Circle' },
  { id: 'arrow',     icon: MoveRight, label: 'Arrow' },
  { id: 'line',      icon: Minus,     label: 'Line' },
];

const STROKE_WIDTHS = [1, 2, 4, 8];

// ─── ToolButton ───────────────────────────────────────────────────────────────
// Mobile: 44px tall with icon + text label for easy tapping and identification.
// Desktop: 28px icon-only button with a hover tooltip.

interface ToolButtonProps {
  tool: ToolDef;
  active: boolean;
  onClick: () => void;
}

function ToolButton({ tool, active, onClick }: ToolButtonProps) {
  const btn = (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center shrink-0 rounded-xl transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50',
        // Mobile: 44 × 44px with label; Desktop: 28 × 28px icon-only
        'w-11 h-11 gap-[3px] md:w-7 md:h-7 md:gap-0',
        active
          ? 'bg-brand-500/25 text-brand-400 ring-1 ring-brand-500/40'
          : 'text-on-surface-secondary hover:bg-white/10 active:bg-white/15 hover:text-on-surface',
      )}
    >
      {/* Icon — slightly larger on mobile for clarity */}
      <tool.icon className="w-[18px] h-[18px] md:w-[15px] md:h-[15px] shrink-0" />
      {/* Label — mobile only */}
      <span className="md:hidden text-[8px] font-medium leading-none select-none">
        {tool.label}
      </span>
    </button>
  );

  // Wrap with tooltip for desktop hover; tooltip never shows on touch devices
  return (
    <Tooltip content={tool.label} shortcut={tool.shortcut} side="top">
      {btn}
    </Tooltip>
  );
}

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
  const toolbarCollapsed    = useUIStore(s => s.toolbarCollapsed);
  const setToolbarCollapsed = useUIStore(s => s.setToolbarCollapsed);
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

      {/* ── Collapse / expand toggle ──────────────────────────────────────── */}
      <button
        onClick={() => setToolbarCollapsed(!toolbarCollapsed)}
        className="w-full flex items-center justify-center h-6 text-on-surface-secondary hover:bg-white/5 transition-colors"
      >
        {toolbarCollapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {/* ── Main toolbar ──────────────────────────────────────────────────────
           Mobile: 44px tall buttons with icon + label, horizontal scroll.
           Desktop: 28px icon-only buttons, centered, no scroll needed.      */}
      {!toolbarCollapsed && <div
        className="flex items-center gap-0.5 overflow-x-auto px-2 py-1 md:justify-center md:px-3 md:h-12 md:py-0"
        style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
      >
        {/* All tools */}
        <div className="flex items-center gap-0.5 shrink-0">
          {allTools.map(tool => (
            <React.Fragment key={tool.id}>
              {GROUP_START.has(tool.id) && (
                <div className="w-px h-6 bg-border mx-0.5 shrink-0" />
              )}
              <ToolButton
                tool={tool}
                active={activeTool === tool.id}
                onClick={() => handleToolClick(tool.id)}
              />
            </React.Fragment>
          ))}
        </div>

        <div className="w-px h-6 bg-border mx-1 shrink-0" />

        {/* Color swatches — inline, scroll with toolbar on mobile */}
        {showColorPicker && (
          <>
            <div className="flex items-center gap-2 px-1 shrink-0">
              {HIGHLIGHT_COLORS.map(color => (
                <button
                  key={color.value}
                  onClick={() => setActiveColor(color.value)}
                  className={cn(
                    'rounded-full transition-all border-2 shrink-0',
                    // 32px on mobile (good tap target), 20px on desktop
                    'w-8 h-8 md:w-5 md:h-5',
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
      </div>}

      {/* ── Secondary row: shape sub-type + stroke width ─────────────────── */}
      {!toolbarCollapsed && (showShapePicker || showStrokeWidth) && (
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
