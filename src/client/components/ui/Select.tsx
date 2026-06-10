import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

/** Themed native `<select>`. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          'rounded border border-border bg-surface px-3 py-2 text-sm text-fg',
          'focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
          'disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  },
);
