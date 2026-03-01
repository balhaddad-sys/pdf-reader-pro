import { X, Stamp } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { STAMP_DEFINITIONS, generateStampImage } from '@/utils/helpers';
import { cn } from '@/utils/helpers';

export function StampPicker() {
  const setStampPickerOpen = useUIStore(s => s.setStampPickerOpen);
  const setPendingStamp = useUIStore(s => s.setPendingStamp);
  const setActiveTool = useUIStore(s => s.setActiveTool);

  const handleSelect = (stamp: typeof STAMP_DEFINITIONS[number]) => {
    const imageData = generateStampImage(stamp.label, stamp.color, stamp.bgColor);
    setPendingStamp({ imageData, label: stamp.label });
    setActiveTool('stamp');
    setStampPickerOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[400px] bg-surface-1 border border-border rounded-2xl shadow-elevation-3 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Stamp size={18} className="text-brand-400" />
            <h2 className="text-sm font-semibold text-on-surface">Choose Stamp</h2>
          </div>
          <button
            onClick={() => setStampPickerOpen(false)}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 text-on-surface-secondary"
          >
            <X size={16} />
          </button>
        </div>

        {/* Stamp grid */}
        <div className="p-4 grid grid-cols-2 gap-2">
          {STAMP_DEFINITIONS.map(stamp => (
            <button
              key={stamp.id}
              onClick={() => handleSelect(stamp)}
              className={cn(
                'h-14 rounded-xl border-2 flex items-center justify-center',
                'transition-all hover:scale-105 active:scale-95',
              )}
              style={{
                borderColor: stamp.borderColor,
                backgroundColor: stamp.bgColor + 'cc',
              }}
            >
              <span
                className="text-xs font-bold tracking-widest"
                style={{ color: stamp.color }}
              >
                {stamp.label}
              </span>
            </button>
          ))}
        </div>

        <p className="px-5 pb-4 text-xs text-on-surface-secondary">
          Click a stamp, then click on the PDF to place it.
        </p>
      </div>
    </div>
  );
}
