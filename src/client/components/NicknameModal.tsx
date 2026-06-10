import React, { useState, useRef, useEffect } from 'react';
import { Modal } from './ui/Modal.js';
import { Input } from './ui/Input.js';
import { Button } from './ui/Button.js';

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
    <Modal open={open} className="max-w-sm" data-testid="nickname-modal">
      <form onSubmit={handleSubmit}>
        <h2 className="mb-4 text-xl font-semibold text-fg">{title}</h2>

        <label htmlFor="nickname-input" className="mb-1 block text-sm text-fg-muted">
          Your nickname (1–30 characters)
        </label>
        <Input
          ref={inputRef}
          id="nickname-input"
          maxLength={30}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError('');
          }}
          className="mb-1"
          placeholder="e.g. Alex"
        />

        {error && (
          <p className="mb-2 text-sm text-danger-fg" role="alert">
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          {onCancel && (
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}
