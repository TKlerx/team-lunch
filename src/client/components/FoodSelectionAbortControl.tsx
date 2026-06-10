import { useState } from 'react';

interface FoodSelectionAbortControlProps {
  disabled: boolean;
  onAbort: () => Promise<void>;
}

export default function FoodSelectionAbortControl({
  disabled,
  onAbort,
}: FoodSelectionAbortControlProps) {
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);

  if (showAbortConfirm) {
    return (
      <div className="inline-flex items-center gap-2 rounded border border-danger bg-danger-soft px-3 py-2">
        <span className="text-sm text-danger-fg">Abort food selection?</span>
        <button
          type="button"
          onClick={() => void onAbort().finally(() => setShowAbortConfirm(false))}
          disabled={disabled}
          className="rounded bg-danger-solid px-3 py-1 text-sm font-medium text-danger-on transition-colors hover:opacity-90 disabled:opacity-50"
        >
          Yes, abort
        </button>
        <button
          type="button"
          onClick={() => setShowAbortConfirm(false)}
          className="rounded border border-border px-3 py-1 text-sm text-fg-muted hover:bg-surface-muted"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setShowAbortConfirm(true)}
      className="text-sm text-danger-fg transition-opacity hover:opacity-80"
    >
      Abort
    </button>
  );
}
