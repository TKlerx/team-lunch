import { useEffect, useState } from 'react';
import type { OrderingPolicyException } from '../../lib/types.js';
import * as api from '../api.js';
import {
  AUTH_PROFILE_UPDATED_EVENT,
  AUTH_ROLE_STORAGE_KEY,
  getAuthenticatedActorKey,
  getAuthenticatedAuthMethod,
} from '../auth.js';
import { useAdminOfficeContext } from '../context/AdminOfficeContext.js';

interface Props {
  kind: 'poll' | 'food-selection';
  recordId: string;
}

export default function OrderingPolicyExceptionDetails(props: Props) {
  const { isAdmin, selectedOfficeLocationId } = useAdminOfficeContext();
  const [, refreshAuth] = useState(0);
  useEffect(() => {
    const refresh = () => refreshAuth((version) => version + 1);
    window.addEventListener(AUTH_PROFILE_UPDATED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(AUTH_PROFILE_UPDATED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const actorKey = getAuthenticatedActorKey();
  const authMethod = getAuthenticatedAuthMethod();
  if (!isAdmin || !selectedOfficeLocationId || !actorKey || !authMethod ||
      localStorage.getItem(AUTH_ROLE_STORAGE_KEY) !== 'admin') return null;

  // Remount before rendering on scope changes, so private state cannot flash in another scope.
  const scope = JSON.stringify([props.kind, props.recordId, selectedOfficeLocationId, actorKey, authMethod]);
  return <AuthorizedExceptionDetails key={scope} {...props} officeLocationId={selectedOfficeLocationId} />;
}

function AuthorizedExceptionDetails({ kind, recordId, officeLocationId }: Props & { officeLocationId: string }) {
  const [snapshot, setSnapshot] = useState<OrderingPolicyException | null>(null);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    const detail = kind === 'poll'
      ? api.fetchPoll(recordId, officeLocationId)
      : api.fetchFoodSelection(recordId, officeLocationId);
    void detail.then((record) => {
      if (cancelled) return;
      if (record.id !== recordId || record.orderingPolicyException === undefined) {
        setStatus('error');
        return;
      }
      setSnapshot(record.orderingPolicyException);
      setStatus('loaded');
    }).catch(() => {
      if (!cancelled) setStatus('error');
    });
    return () => { cancelled = true; };
  }, [kind, recordId, officeLocationId]);

  if (status === 'loading') return <p role="status" className="m-4 text-sm text-fg-muted">Loading ordering-policy details...</p>;
  if (status === 'error') return <p role="status" className="m-4 text-sm text-danger-fg">Ordering-policy details unavailable.</p>;
  if (!snapshot) return null;

  const dateTime = (value: string) => (
    <time dateTime={value}>{new Date(value).toLocaleString(undefined, { timeZone: snapshot.timeZone })}</time>
  );
  return (
    <section aria-label="Ordering-policy exception" className="mx-auto my-4 w-full max-w-md rounded-lg border border-warning bg-warning-soft p-4 text-sm text-fg">
      <h3 className="mb-2 font-semibold">Ordering-policy exception</h3>
      <dl className="space-y-2 break-words">
        <div><dt className="font-medium">Reason</dt><dd className="whitespace-pre-wrap">{snapshot.reason}</dd></div>
        <div><dt className="font-medium">Started by</dt><dd>{snapshot.displayNameSnapshot}</dd></div>
        <div><dt className="font-medium">Decision time ({snapshot.timeZone})</dt><dd>{dateTime(snapshot.decidedAt)}</dd></div>
        <div><dt className="font-medium">Policy at decision</dt><dd>Every {snapshot.intervalWeeks} {snapshot.intervalWeeks === 1 ? 'week' : 'weeks'}; {snapshot.timeZone}; starting Monday {snapshot.anchorDate}</dd></div>
        <div><dt className="font-medium">Policy warning</dt><dd>{snapshot.violation === 'period_used' ? 'A lunch had already been completed in this period.' : 'The policy starting Monday had not been reached.'}</dd></div>
        {snapshot.blockStart && snapshot.blockEnd ? <div><dt className="font-medium">Evaluated period (end exclusive)</dt><dd>{dateTime(snapshot.blockStart)} – {dateTime(snapshot.blockEnd)}</dd></div> : null}
        <div><dt className="font-medium">Next eligible time</dt><dd>{dateTime(snapshot.nextEligibleAt)}</dd></div>
        {snapshot.previousCompletedAt ? <div><dt className="font-medium">Previous lunch completed</dt><dd>{dateTime(snapshot.previousCompletedAt)}</dd></div> : null}
        {snapshot.previousCompletedSelectionId ? <div><dt className="font-medium">Previous food selection</dt><dd>{snapshot.previousCompletedSelectionId}</dd></div> : null}
      </dl>
    </section>
  );
}
