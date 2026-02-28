import { useState, useRef, useCallback, type ReactNode } from 'react';
import { cn } from '@/utils/helpers';

interface TooltipProps {
  content: string;
  shortcut?: string;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

export function Tooltip({ content, shortcut, children, side = 'top', delay = 400 }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback(() => {
    timeout.current = setTimeout(() => setVisible(true), delay);
  }, [delay]);

  const hide = useCallback(() => {
    clearTimeout(timeout.current);
    setVisible(false);
  }, []);

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {visible && (
        <div
          className={cn(
            'absolute z-[100] pointer-events-none animate-fade-in',
            'px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap',
            'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900',
            'shadow-elevation-3',
            positionClasses[side],
          )}
        >
          <span>{content}</span>
          {shortcut && (
            <span className="ml-2 opacity-60 font-mono text-2xs">{shortcut}</span>
          )}
        </div>
      )}
    </div>
  );
}
