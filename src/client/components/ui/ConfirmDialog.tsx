import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal } from './Modal.js';
import { Button } from './Button.js';

export type ConfirmDialogOptions = {
  title: string;
  consequenceText?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type PendingConfirm = ConfirmDialogOptions & {
  resolve: (confirmed: boolean) => void;
};

export function ConfirmDialog({
  open,
  title,
  consequenceText,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogOptions & {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} labelledBy="confirm-dialog-title">
      <h2 id="confirm-dialog-title" className="text-lg font-semibold text-fg">
        {title}
      </h2>
      {/* pre-line: callers pass multi-line warnings (allergies/dislikes) that HTML would otherwise collapse. */}
      {consequenceText ? (
        <p className="mt-2 whitespace-pre-line text-sm text-fg-muted">{consequenceText}</p>
      ) : null}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

export function useConfirmDialog() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);

  const close = useCallback((confirmed: boolean) => {
    pendingRef.current?.resolve(confirmed);
    pendingRef.current = null;
    setPending(null);
  }, []);

  // An SSE phase change can unmount the host mid-confirm; settle the promise so the
  // awaiting caller still reaches its `finally` and clears its submitting flag.
  useEffect(
    () => () => {
      pendingRef.current?.resolve(false);
      pendingRef.current = null;
    },
    [],
  );

  const confirm = useCallback((options: ConfirmDialogOptions) => {
    pendingRef.current?.resolve(false);
    return new Promise<boolean>((resolve) => {
      const next = { ...options, resolve };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  const dialog = pending ? (
    <ConfirmDialog
      {...pending}
      open
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  ) : null;

  return { confirm, dialog };
}
