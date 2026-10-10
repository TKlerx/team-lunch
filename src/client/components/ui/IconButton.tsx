import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

/**
 * Icon-only button used in the toolbar. Bundles the themed hover/focus styling
 * so callers only supply the icon and behaviour.
 */
export function IconButton({ className, type, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type ?? 'button'}
      className={cn(
        'inline-flex min-h-11 min-w-11 items-center justify-center rounded p-1.5 text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg sm:min-h-0 sm:min-w-0',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        className,
      )}
      {...props}
    />
  );
}
