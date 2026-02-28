import { useState, useCallback, type ReactNode, type DragEvent } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/utils/helpers';

interface DropZoneProps {
  onDrop: (files: File[]) => void;
  children: ReactNode;
  className?: string;
  fullScreen?: boolean;
}

export function DropZone({ onDrop, children, className, fullScreen }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrag = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer?.items?.length) {
      setIsDragging(true);
    }
  }, []);

  const handleDragOut = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer?.files || []).filter(
        f => f.type === 'application/pdf',
      );
      if (files.length > 0) {
        onDrop(files);
      }
    },
    [onDrop],
  );

  return (
    <div
      className={cn('relative', className)}
      onDragEnter={handleDragIn}
      onDragLeave={handleDragOut}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      {children}
      {isDragging && (
        <div
          className={cn(
            'absolute inset-0 z-50 flex items-center justify-center',
            'bg-brand-500/10 backdrop-blur-sm border-2 border-dashed border-brand-500 rounded-2xl',
            fullScreen && 'fixed',
          )}
        >
          <div className="flex flex-col items-center gap-3 animate-scale-in">
            <div className="w-16 h-16 rounded-2xl bg-brand-500/20 flex items-center justify-center">
              <Upload size={28} className="text-brand-400" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-brand-400">Drop PDF here</p>
              <p className="text-sm text-on-surface-secondary mt-1">Release to import</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
