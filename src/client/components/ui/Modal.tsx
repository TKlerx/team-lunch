import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn.js';

interface ModalProps {
  open: boolean;
  /** Called on backdrop click / Escape. Omit for non-dismissible modals. */
  onClose?: () => void;
  /** id of the element labelling the dialog (for aria-labelledby). */
  labelledBy?: string;
  className?: string;
  /** Forwarded to the dialog element (e.g. for tests). */
  'data-testid'?: string;
  children: ReactNode;
}

/**
 * Themed modal dialog: dimmed backdrop + raised surface, rendered in a portal.
 * Handles Escape-to-close when `onClose` is provided.
 */
export function Modal({
  open,
  onClose,
  labelledBy,
  className,
  'data-testid': testId,
  children,
}: ModalProps) {
  useEffect(() => {
    if (!open || !onClose) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        aria-hidden
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        data-testid={testId}
        className={cn(
          'relative z-10 w-full max-w-md rounded-xl border border-border',
          'bg-surface-raised p-6 text-fg shadow-xl',
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
