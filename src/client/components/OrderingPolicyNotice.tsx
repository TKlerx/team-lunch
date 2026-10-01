import { useId, useState, type FormEvent } from 'react';
import type { OrderingPolicyWarningResponse } from '../../lib/types.js';
import { Button } from './ui/Button.js';
import { Modal } from './ui/Modal.js';

interface OrderingPolicyNoticeProps {
  warning: OrderingPolicyWarningResponse;
  pending: boolean;
  onCancel: () => void;
  onProceed: (justification: string) => void;
}

export default function OrderingPolicyNotice({
  warning,
  pending,
  onCancel,
  onProceed,
}: OrderingPolicyNoticeProps) {
  const id = useId();
  const [justification, setJustification] = useState('');
  const reason = justification.trim();
  const valid = reason.length >= 1 && reason.length <= 500;
  const { nextEligibleAt, timeZone } = warning.orderingPolicy;
  const nextEligibleLabel = nextEligibleAt === null ? null : new Intl.DateTimeFormat(undefined, {
    timeZone,
    dateStyle: 'full',
    timeStyle: 'long',
  }).format(new Date(nextEligibleAt));

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || !valid) return;
    onProceed(reason);
  };

  return (
    <Modal open onClose={pending ? undefined : onCancel} labelledBy={`${id}-title`}>
      <form onSubmit={handleSubmit} aria-busy={pending} className="space-y-4">
        <h2 id={`${id}-title`} className="text-lg font-semibold">Ordering policy warning</h2>
        <p className="text-sm text-warning-fg">{warning.error}</p>
        {nextEligibleLabel !== null ? (
          <p className="text-sm text-fg-muted">
            Next eligible start: <time dateTime={nextEligibleAt ?? undefined}>{nextEligibleLabel}</time>
            {' '}({timeZone})
          </p>
        ) : null}
        <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        <div className="space-y-2">
          <label htmlFor={`${id}-justification`} className="block text-sm font-medium">
            Justification
          </label>
          <textarea
            id={`${id}-justification`}
            value={justification}
            onChange={(event) => setJustification(event.target.value)}
            disabled={pending}
            aria-describedby={`${id}-help`}
            rows={4}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
          />
          <p id={`${id}-help`} className="text-sm text-fg-muted">
            Enter 1–500 characters after trimming whitespace to proceed with an exception.
          </p>
        </div>
        <Button type="submit" variant="warning" disabled={pending || !valid}>
          Proceed with exception
        </Button>
      </form>
    </Modal>
  );
}
