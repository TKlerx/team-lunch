import type { ReactNode } from 'react';
import { cn } from '../../lib/cn.js';

interface FormFieldProps {
  /** Field label. Associate with the control via `htmlFor` + the control's `id`. */
  label?: ReactNode;
  htmlFor?: string;
  /** Validation message — rendered in the danger color and replaces `hint`. */
  error?: ReactNode;
  /** Helper text shown when there's no error. */
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * Label + control + help/error wrapper. Bundles the themed label and message
 * styling so forms read as `<FormField label=...><Input/></FormField>`.
 */
export function FormField({ label, htmlFor, error, hint, className, children }: FormFieldProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {label != null && (
        <label htmlFor={htmlFor} className="text-sm font-medium text-fg">
          {label}
        </label>
      )}
      {children}
      {error == null && hint != null && <p className="text-xs text-fg-muted">{hint}</p>}
      {error != null && <p className="text-xs text-danger-fg">{error}</p>}
    </div>
  );
}
