import { useEffect, useRef, useState } from 'react';

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
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        disabled={disabled || submitting}
        aria-label={triggerAriaLabel}
        className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
      >
        {triggerLabel}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 w-56 rounded border border-gray-200 bg-white shadow-lg">
          <div className="max-h-48 overflow-y-auto border-b border-gray-200 py-1">
            {options.map((minutes) => (
              <button
                key={minutes}
                type="button"
                onClick={() => {
                  void runSubmit(minutes);
                }}
                disabled={disabled || submitting}
                className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                {minutes} min
              </button>
            ))}
          </div>
          <div className="space-y-2 p-2">
            <input
              type="text"
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
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                const parsed = Number.parseInt(manualMinutes, 10);
                if (!Number.isInteger(parsed)) return;
                void runSubmit(parsed);
              }}
              disabled={disabled || submitting}
              className="w-full rounded border border-green-600 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50 disabled:opacity-60"
            >
              {submitButtonLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
