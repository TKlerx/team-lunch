import type { ReactNode } from 'react';
import { cn } from '../../lib/cn.js';

interface SectionProps {
  /** Small uppercase section heading. */
  title?: ReactNode;
  /** Optional supporting copy under the title. */
  description?: ReactNode;
  /** Draw a top divider to separate stacked sections. Default: true. */
  divided?: boolean;
  className?: string;
  children?: ReactNode;
}

/**
 * Titled content block used to structure pages/cards. Renders the heading +
 * optional description with consistent theming, leaving the body to the caller.
 */
export function Section({
  title,
  description,
  divided = true,
  className,
  children,
}: SectionProps) {
  const hasHeader = title != null || description != null;
  return (
    <section className={cn(divided && 'border-t border-border pt-6', className)}>
      {title != null && (
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">{title}</h2>
      )}
      {description != null && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      <div className={cn(hasHeader && 'mt-3')}>{children}</div>
    </section>
  );
}
