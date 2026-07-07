import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
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

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableElements(dialog: HTMLDivElement | null): HTMLElement[] {
  return Array.from(dialog?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []).filter(
    (element) => !element.hasAttribute('disabled') && !element.getAttribute('aria-hidden'),
  );
}

function trapTabKey(event: KeyboardEvent, dialog: HTMLDivElement | null) {
  const focusable = getFocusableElements(dialog);
  if (focusable.length === 0) {
    event.preventDefault();
    dialog?.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function useModalFocus(open: boolean, onClose: (() => void) | undefined, dialogRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const dialog = dialogRef.current;

    document.body.style.overflow = 'hidden';
    (getFocusableElements(dialog)[0] ?? dialog)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onClose) return onClose();
      if (event.key === 'Tab') trapTabKey(event, dialog);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [dialogRef, open, onClose]);
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
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useModalFocus(open, onClose, dialogRef);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        aria-hidden
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
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
