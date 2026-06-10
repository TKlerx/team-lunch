import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

/**
 * Muted inset block — a subtly recessed container used inside cards/pages
 * (e.g. status callouts). Lower emphasis than `Card`.
 */
export function Panel({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg border border-border bg-surface-muted p-4', className)}
      {...props}
    >
      {children}
    </div>
  );
}
