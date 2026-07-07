import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/Button.js';
import { Input } from './ui/Input.js';

interface MinutesActionDropdownProps {
  triggerLabel: string;
  triggerAriaLabel: string;
  options: readonly number[];
  onSubmitMinutes: (minutes: number) => Promise<boolean>;
  disabled?: boolean;
  customPlaceholder?: string;
  customAriaLabel?: string;
  submitButtonLabel?: string;
}

export default function MinutesActionDropdown({
  triggerLabel,
  triggerAriaLabel,
  options,
  onSubmitMinutes,
  disabled = false,
  customPlaceholder = 'Manual minutes',
  customAriaLabel = 'Manual minutes',
  submitButtonLabel = 'Apply',
}: MinutesActionDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [manualMinutes, setManualMinutes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!containerRef.current.contains(target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [isOpen]);

  const runSubmit = async (minutes: number): Promise<void> => {
    setSubmitting(true);
    try {
      const success = await onSubmitMinutes(minutes);
      if (success) {
        setManualMinutes('');
        setIsOpen(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative inline-block" ref={containerRef}>
      <Button
        variant="success"
        onClick={() => setIsOpen((open) => !open)}
        disabled={disabled || submitting}
        aria-label={triggerAriaLabel}
        className="border-0 bg-success-solid text-success-on hover:opacity-90"
      >
        {triggerLabel}
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 w-56 rounded border border-border bg-surface-raised shadow-lg">
          <div className="max-h-48 overflow-y-auto border-b border-border py-1">
            {options.map((minutes) => (
              <Button
                key={minutes}
                variant="ghost"
                onClick={() => {
                  void runSubmit(minutes);
                }}
                disabled={disabled || submitting}
                className="w-full rounded-none px-3 py-1.5 text-left text-fg"
              >
                {minutes} min
              </Button>
            ))}
          </div>
          <div className="space-y-2 p-2">
            <Input
              value={manualMinutes}
              onChange={(event) => setManualMinutes(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  const parsed = Number.parseInt(manualMinutes, 10);
                  if (!Number.isInteger(parsed)) return;
                  void runSubmit(parsed);
                }
              }}
              placeholder={customPlaceholder}
              aria-label={customAriaLabel}
              className="px-2 py-1.5"
            />
            <Button
              variant="success"
              onClick={() => {
                const parsed = Number.parseInt(manualMinutes, 10);
                if (!Number.isInteger(parsed)) return;
                void runSubmit(parsed);
              }}
              disabled={disabled || submitting}
              className="w-full px-3 py-1.5"
            >
              {submitButtonLabel}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
