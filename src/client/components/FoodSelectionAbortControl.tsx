import { useState } from 'react';
import { Button } from './ui/Button.js';

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
        <Button
          variant="danger-solid"
          onClick={() => void onAbort().finally(() => setShowAbortConfirm(false))}
          disabled={disabled}
          className="px-3 py-1"
        >
          Yes, abort
        </Button>
        <Button
          variant="secondary"
          onClick={() => setShowAbortConfirm(false)}
          className="px-3 py-1 text-fg-muted"
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      onClick={() => setShowAbortConfirm(true)}
      className="text-danger-fg hover:opacity-80"
    >
      Abort
    </Button>
  );
}
