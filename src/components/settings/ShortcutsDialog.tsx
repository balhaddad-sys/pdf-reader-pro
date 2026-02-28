import { Modal } from '@/components/common/Modal';
import { useUIStore } from '@/stores/uiStore';
import { cn } from '@/utils/helpers';

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string; description: string }[];
}

const shortcutGroups: ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: 'Esc', description: 'Back to library' },
      { keys: 'Ctrl + F', description: 'Search in document' },
      { keys: 'Ctrl + G', description: 'Go to page' },
      { keys: 'Ctrl + B', description: 'Toggle sidebar' },
      { keys: 'F11', description: 'Toggle focus mode' },
      { keys: 'Home', description: 'Go to first page' },
      { keys: 'End', description: 'Go to last page' },
    ],
  },
  {
    title: 'Zoom',
    shortcuts: [
      { keys: 'Ctrl + =', description: 'Zoom in' },
      { keys: 'Ctrl + -', description: 'Zoom out' },
      { keys: 'Ctrl + 0', description: 'Reset zoom' },
      { keys: 'Ctrl + Scroll', description: 'Zoom with mouse wheel' },
    ],
  },
  {
    title: 'Annotations',
    shortcuts: [
      { keys: 'V', description: 'Select tool' },
      { keys: 'H', description: 'Highlight tool' },
      { keys: 'U', description: 'Underline tool' },
      { keys: 'N', description: 'Sticky note tool' },
      { keys: 'P', description: 'Pen/draw tool' },
      { keys: 'E', description: 'Eraser tool' },
      { keys: 'S', description: 'Shape tool' },
      { keys: 'Ctrl + Z', description: 'Undo' },
      { keys: 'Ctrl + Y', description: 'Redo' },
    ],
  },
  {
    title: 'Document',
    shortcuts: [
      { keys: 'Ctrl + D', description: 'Toggle bookmark' },
      { keys: 'Ctrl + O', description: 'Open document' },
      { keys: 'Ctrl + ,', description: 'Settings' },
    ],
  },
];

export function ShortcutsDialog() {
  const shortcutsOpen = useUIStore(s => s.shortcutsOpen);
  const setShortcutsOpen = useUIStore(s => s.setShortcutsOpen);

  return (
    <Modal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title="Keyboard Shortcuts" size="lg">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {shortcutGroups.map(group => (
          <div key={group.title}>
            <h3 className="text-xs font-semibold text-on-surface-secondary uppercase tracking-wider mb-3">
              {group.title}
            </h3>
            <div className="space-y-1.5">
              {group.shortcuts.map(shortcut => (
                <div
                  key={shortcut.keys}
                  className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/5"
                >
                  <span className="text-sm text-on-surface">{shortcut.description}</span>
                  <kbd className={cn(
                    'px-2 py-0.5 rounded-md text-2xs font-mono font-medium',
                    'bg-surface-3 text-on-surface-secondary border border-border',
                  )}>
                    {shortcut.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
