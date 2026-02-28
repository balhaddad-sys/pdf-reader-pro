import { Moon, Sun, Sunset, Monitor, Keyboard } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { useUIStore } from '@/stores/uiStore';
import { cn } from '@/utils/helpers';
import type { Theme } from '@/types';

const themes: { id: Theme; label: string; icon: typeof Sun; description: string }[] = [
  { id: 'light', label: 'Light', icon: Sun, description: 'Clean and bright' },
  { id: 'dark', label: 'Dark', icon: Moon, description: 'Easy on the eyes' },
  { id: 'midnight', label: 'Midnight', icon: Monitor, description: 'True dark OLED' },
  { id: 'sepia', label: 'Sepia', icon: Sunset, description: 'Warm paper tone' },
];

export function SettingsDialog() {
  const settingsOpen = useUIStore(s => s.settingsOpen);
  const setSettingsOpen = useUIStore(s => s.setSettingsOpen);
  const theme = useUIStore(s => s.theme);
  const setTheme = useUIStore(s => s.setTheme);
  const setShortcutsOpen = useUIStore(s => s.setShortcutsOpen);

  return (
    <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Settings" size="md">
      {/* Theme */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-on-surface mb-3">Appearance</h3>
        <div className="grid grid-cols-2 gap-3">
          {themes.map(t => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={cn(
                'flex items-center gap-3 p-3 rounded-xl border transition-all text-left',
                theme === t.id
                  ? 'border-brand-500 bg-brand-500/10'
                  : 'border-border hover:border-border-strong hover:bg-white/5',
              )}
            >
              <div className={cn(
                'w-9 h-9 rounded-lg flex items-center justify-center',
                theme === t.id ? 'bg-brand-500/20 text-brand-400' : 'bg-surface-3 text-on-surface-secondary',
              )}>
                <t.icon size={18} />
              </div>
              <div>
                <p className="text-sm font-medium text-on-surface">{t.label}</p>
                <p className="text-2xs text-on-surface-secondary">{t.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Keyboard Shortcuts */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-on-surface mb-3">Keyboard Shortcuts</h3>
        <button
          onClick={() => { setSettingsOpen(false); setShortcutsOpen(true); }}
          className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-border-strong hover:bg-white/5 transition-all w-full text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-surface-3 flex items-center justify-center">
            <Keyboard size={18} className="text-on-surface-secondary" />
          </div>
          <div>
            <p className="text-sm font-medium text-on-surface">View all shortcuts</p>
            <p className="text-2xs text-on-surface-secondary">Speed up your workflow</p>
          </div>
        </button>
      </div>

      {/* About */}
      <div>
        <h3 className="text-sm font-semibold text-on-surface mb-3">About</h3>
        <div className="bg-surface-3 rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-glow">
              <span className="text-white font-bold text-sm">P</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-on-surface">PDF Reader Pro</p>
              <p className="text-2xs text-on-surface-secondary">Version 2.0.0</p>
            </div>
          </div>
          <p className="text-xs text-on-surface-secondary leading-relaxed">
            A professional PDF reader built with privacy in mind. All your documents
            are stored locally and never leave your device. No accounts, no tracking,
            no compromises.
          </p>
        </div>
      </div>
    </Modal>
  );
}
