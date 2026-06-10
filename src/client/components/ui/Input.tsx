import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

const fieldClass = cn(
  'w-full rounded border border-border bg-surface px-3 py-2 text-sm text-fg',
  'placeholder:text-fg-muted focus:border-accent focus:outline-none',
  'focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50',
);

/** Themed text input. */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, type, ...props }, ref) {
    return (
      <input
        ref={ref}
        type={type ?? 'text'}
        className={cn(fieldClass, className)}
        {...props}
      />
    );
  },
);
