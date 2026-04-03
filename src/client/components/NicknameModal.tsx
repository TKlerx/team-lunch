import React, { useState, useRef, useEffect } from 'react';

interface NicknameModalProps {
  /** When true the modal is rendered as a full-screen overlay. */
  open: boolean;
  /** Pre-filled value for rename mode (empty string for first-visit). */
  initialValue?: string;
  /** Title text shown at the top of the modal. */
  title?: string;
  /** Called with the validated, trimmed nickname. */
  onSubmit: (nickname: string) => void;
  /** Called when the user cancels (only available in rename mode). */
  onCancel?: () => void;
}

export default function NicknameModal({
  open,
  initialValue = '',
  title = 'Choose a nickname',
  onSubmit,
  onCancel,
}: NicknameModalProps) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input when the modal opens
  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setError('');
      // Small delay so the DOM is ready
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, initialValue]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed.length < 1) {
      setError('Nickname cannot be empty');
      return;
    }
    if (trimmed.length > 30) {
      setError('Nickname must be 30 characters or fewer');
      return;
    }
    onSubmit(trimmed);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      data-testid="nickname-modal"
    >
      <form
        onSubmit={handleSubmit}
        className="mx-4 w-full max-w-sm rounded-lg bg-white p-6 shadow-xl"
      >
        <h2 className="mb-4 text-xl font-semibold text-gray-900">{title}</h2>

        <label htmlFor="nickname-input" className="mb-1 block text-sm text-gray-600">
          Your nickname (1–30 characters)
        </label>
        <input
          ref={inputRef}
          id="nickname-input"
          type="text"
          maxLength={30}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError('');
          }}
          className="mb-1 w-full rounded border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="e.g. Alex"
        />

        {error && (
          <p className="mb-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
