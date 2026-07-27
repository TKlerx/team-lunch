import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'success'
  | 'warning'
  | 'danger-solid'
  | 'success-solid'
  | 'warning-solid';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent-solid text-accent-on hover:opacity-90',
  secondary: 'border border-border bg-surface text-fg hover:bg-surface-muted',
  ghost: 'text-fg-muted hover:bg-surface-muted hover:text-fg',
  danger: 'border border-danger bg-danger-soft text-danger-fg hover:bg-danger-soft/70',
  success: 'border border-success bg-success-soft text-success-fg hover:bg-success-soft/70',
  warning: 'border border-warning bg-warning-soft text-warning-fg hover:bg-warning-soft/70',
  // Filled counterparts for the primary action in a group; `primary` is already solid.
  'danger-solid': 'bg-danger-solid text-danger-on hover:opacity-90',
  'success-solid': 'bg-success-solid text-success-on hover:opacity-90',
  'warning-solid': 'bg-warning-solid text-warning-on hover:opacity-90',
};

/**
 * Themed button with semantic variants. Use this for actions instead of
 * hand-rolling `bg-blue-600 ...` so light/dark styling stays in one place.
 */
export function Button({ variant = 'primary', className, type, ...props }: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={cn(
        'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
