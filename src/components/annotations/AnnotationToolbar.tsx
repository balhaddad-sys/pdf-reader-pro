import {
  MousePointer2, Highlighter, Underline, Strikethrough,
  MessageSquare, Pencil, Eraser, Square, Undo2, Redo2,
} from 'lucide-react';
import { IconButton } from '@/components/common/IconButton';
import { useUIStore } from '@/stores/uiStore';
import { useAnnotationStore } from '@/stores/annotationStore';
import { HIGHLIGHT_COLORS, cn } from '@/utils/helpers';
import type { AnnotationTool } from '@/types';

interface ToolDef {
  id: AnnotationTool;
  icon: typeof Highlighter;
  label: string;
  shortcut?: string;
}

const tools: ToolDef[] = [
  { id: 'select', icon: MousePointer2, label: 'Select', shortcut: 'V' },
  { id: 'highlight', icon: Highlighter, label: 'Highlight', shortcut: 'H' },
  { id: 'underline', icon: Underline, label: 'Underline', shortcut: 'U' },
  { id: 'strikethrough', icon: Strikethrough, label: 'Strikethrough' },
  { id: 'note', icon: MessageSquare, label: 'Sticky note', shortcut: 'N' },
  { id: 'freehand', icon: Pencil, label: 'Draw', shortcut: 'P' },
  { id: 'eraser', icon: Eraser, label: 'Eraser', shortcut: 'E' },
  { id: 'shape', icon: Square, label: 'Shape', shortcut: 'S' },
];

export function AnnotationToolbar() {
  const activeTool = useUIStore(s => s.activeTool);
  const setActiveTool = useUIStore(s => s.setActiveTool);
  const activeColor = useUIStore(s => s.activeColor);
  const setActiveColor = useUIStore(s => s.setActiveColor);
  const focusMode = useUIStore(s => s.focusMode);
  const canUndo = useAnnotationStore(s => s.canUndo);
  const canRedo = useAnnotationStore(s => s.canRedo);
  const undo = useAnnotationStore(s => s.undo);
  const redo = useAnnotationStore(s => s.redo);

  if (focusMode) return null;

  const showColorPicker = activeTool === 'highlight' || activeTool === 'underline' || activeTool === 'freehand' || activeTool === 'shape';

  return (
    <div className="h-12 flex items-center justify-center gap-1 px-3 bg-surface-1 border-t border-border shrink-0">
      {/* Tools */}
      <div className="flex items-center gap-0.5 px-1">
        {tools.map(tool => (
          <IconButton
            key={tool.id}
            tooltip={tool.label}
            shortcut={tool.shortcut}
            tooltipSide="top"
            size="sm"
            active={activeTool === tool.id}
            onClick={() => setActiveTool(activeTool === tool.id ? null : tool.id)}
          >
            <tool.icon size={16} />
          </IconButton>
        ))}
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-border mx-1" />

      {/* Color picker */}
      {showColorPicker && (
        <div className="flex items-center gap-1 px-1">
          {HIGHLIGHT_COLORS.map(color => (
            <button
              key={color.value}
              onClick={() => setActiveColor(color.value)}
              className={cn(
                'w-5 h-5 rounded-full transition-all border-2',
                activeColor === color.value
                  ? 'border-white scale-110 shadow-glow'
                  : 'border-transparent hover:scale-105',
              )}
              style={{ backgroundColor: color.value }}
              title={color.name}
            />
          ))}
        </div>
      )}

      {showColorPicker && <div className="w-px h-6 bg-border mx-1" />}

      {/* Undo/Redo */}
      <div className="flex items-center gap-0.5">
        <IconButton
          tooltip="Undo"
          shortcut="Ctrl+Z"
          tooltipSide="top"
          size="sm"
          onClick={undo}
          disabled={!canUndo()}
        >
          <Undo2 size={16} />
        </IconButton>
        <IconButton
          tooltip="Redo"
          shortcut="Ctrl+Y"
          tooltipSide="top"
          size="sm"
          onClick={redo}
          disabled={!canRedo()}
        >
          <Redo2 size={16} />
        </IconButton>
      </div>
    </div>
  );
}
