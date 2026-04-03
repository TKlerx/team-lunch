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
      <div className="inline-flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-2">
        <span className="text-sm text-red-700">Abort food selection?</span>
        <button
          type="button"
          onClick={() => void onAbort().finally(() => setShowAbortConfirm(false))}
          disabled={disabled}
          className="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          Yes, abort
        </button>
        <button
          type="button"
          onClick={() => setShowAbortConfirm(false)}
          className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-100"
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
      className="text-sm text-red-500 hover:text-red-700"
    >
      Abort
    </button>
  );
}
