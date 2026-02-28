import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/utils/helpers';
import { Tooltip } from './Tooltip';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tooltip?: string;
  shortcut?: string;
  variant?: 'ghost' | 'filled' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ tooltip, shortcut, variant = 'ghost', size = 'md', active, tooltipSide, className, children, ...props }, ref) => {
    const sizeClasses = {
      sm: 'w-7 h-7',
      md: 'w-9 h-9',
      lg: 'w-11 h-11',
    };

    const variantClasses = {
      ghost: cn(
        'hover:bg-white/10 active:bg-white/15',
        active && 'bg-brand-500/20 text-brand-400 hover:bg-brand-500/25',
      ),
      filled: cn(
        'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700',
        active && 'bg-brand-600',
      ),
      outline: cn(
        'border border-border hover:bg-white/5 active:bg-white/10',
        active && 'border-brand-500 bg-brand-500/10 text-brand-400',
      ),
    };

    const button = (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-xl transition-all duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50',
          'disabled:opacity-40 disabled:pointer-events-none',
          sizeClasses[size],
          variantClasses[variant],
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );

    if (tooltip) {
      return (
        <Tooltip content={tooltip} shortcut={shortcut} side={tooltipSide}>
          {button}
        </Tooltip>
      );
    }

    return button;
  }
);

IconButton.displayName = 'IconButton';
