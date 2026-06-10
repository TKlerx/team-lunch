import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

/** Themed multi-line text input. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          'w-full rounded border border-border bg-surface px-3 py-2 text-sm text-fg',
          'placeholder:text-fg-muted focus:border-accent focus:outline-none',
          'focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50',
          className,
        )}
        {...props}
      />
    );
  },
);
