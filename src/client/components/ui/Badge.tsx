import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

export type BadgeTone = 'neutral' | 'accent' | 'danger' | 'success' | 'warning';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-muted text-fg-muted',
  accent: 'bg-accent-soft text-accent-fg',
  danger: 'bg-danger-solid text-danger-on',
  success: 'bg-success-soft text-success-fg',
  warning: 'bg-warning-soft text-warning-fg',
};

/** Small status / count pill. */
export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-2 py-0.5',
        'text-xs font-semibold',
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
