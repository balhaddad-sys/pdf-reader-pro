import { CheckCircle, Info, AlertCircle, X } from 'lucide-react';
import { cn } from '@/utils/helpers';
import { useUIStore } from '@/stores/uiStore';

export function ToastContainer() {
  const toasts = useUIStore(s => s.toasts);
  const removeToast = useUIStore(s => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={cn(
            'pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl',
            'shadow-elevation-3 animate-slide-up min-w-[280px] max-w-md',
            'bg-surface-3 border border-border',
          )}
        >
          {toast.type === 'success' && <CheckCircle size={18} className="text-green-400 shrink-0" />}
          {toast.type === 'info' && <Info size={18} className="text-brand-400 shrink-0" />}
          {toast.type === 'error' && <AlertCircle size={18} className="text-red-400 shrink-0" />}
          <span className="text-sm text-on-surface flex-1">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-white/10 shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
