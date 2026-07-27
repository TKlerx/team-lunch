import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

/**
 * Raised surface container (page cards). Pads via `className` so it can wrap both
 * padded content and edge-to-edge children.
 */
export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-2xl border border-border bg-surface shadow-sm', className)}
      {...props}
    >
      {children}
    </div>
  );
}
