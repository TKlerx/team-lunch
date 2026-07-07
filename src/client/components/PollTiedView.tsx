import { useState } from 'react';
import { useAppState } from '../context/AppContext.js';
import * as api from '../api.js';
import { isAdminAuthenticatedUser, isCreatorAuthenticatedUser } from '../auth.js';

const EXTEND_OPTIONS = [5, 10, 15, 30] as const;

export default function PollTiedView() {
  const { activePoll, menus } = useAppState();
  const [extensionMinutes, setExtensionMinutes] = useState<number>(5);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);
  const canKillPoll = isAdminAuthenticatedUser();

  if (!activePoll) return null;
  const canManageTieExtension = canKillPoll || isCreatorAuthenticatedUser(activePoll.createdBy);

  // Identify tied menus — menus with the max vote count
  const voteCounts = activePoll.voteCounts;
  const maxVotes = Math.max(0, ...Object.values(voteCounts));
  const tiedMenuIds = Object.entries(voteCounts)
    .filter(([, count]) => count === maxVotes)
    .map(([id]) => id);

  const tiedMenuNames = tiedMenuIds.map((id) => {
    const menu = menus.find((m) => m.id === id);
    return menu?.name ?? id;
  });

  const handleExtend = async () => {
    setSubmitting(true);
    setError('');
    try {
      await api.extendPoll(activePoll.id, extensionMinutes);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRandomWinner = async () => {
    setSubmitting(true);
    setError('');
    try {
      await api.randomWinner(activePoll.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAbort = async () => {
    setSubmitting(true);
    setError('');
    try {
      await api.abortPoll(activePoll.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
      setShowAbortConfirm(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 items-start justify-center p-4">
      <div className="w-full max-w-md rounded-lg border border-warning bg-surface p-6 shadow-sm">
        <h2 className="mb-2 text-center text-lg font-semibold text-warning-fg">
          It&apos;s a tie!
        </h2>

        <p className="mb-4 text-center text-sm text-fg-muted">
          These menus are tied with {maxVotes} {maxVotes === 1 ? 'vote' : 'votes'} each:
        </p>

        <div className="mb-6 max-h-[40vh] overflow-y-auto">
          <div className="flex flex-wrap justify-center gap-2">
          {tiedMenuNames.map((name) => (
            <span
              key={name}
              className="rounded-full bg-warning-soft px-3 py-1 text-sm font-medium text-warning-fg"
            >
              {name}
            </span>
          ))}
          </div>
        </div>

        {error && <p className="mb-4 text-center text-sm text-danger-fg">{error}</p>}

        {/* Extend voting */}
        <div className="mb-4 space-y-2">
          <label className="block text-sm font-medium text-fg">
            Extend voting
          </label>
          <div className="flex gap-2">
            <select
              value={extensionMinutes}
              onChange={(e) => setExtensionMinutes(Number(e.target.value))}
              className="flex-1 rounded border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              {EXTEND_OPTIONS.map((d) => (
                <option key={d} value={d}>{d} min</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void handleExtend()}
              disabled={submitting || !canManageTieExtension}
              className="rounded bg-accent-solid px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Extend
            </button>
          </div>
          {!canManageTieExtension && (
            <p className="text-sm text-warning-fg">Only admins or the poll creator can extend this tie.</p>
          )}
        </div>

        <div className="relative my-4 flex items-center">
          <div className="flex-1 border-t border-border" />
          <span className="px-3 text-xs text-fg-muted">or</span>
          <div className="flex-1 border-t border-border" />
        </div>

        {/* Random winner */}
        <button
          type="button"
          onClick={() => void handleRandomWinner()}
          disabled={submitting}
          className="w-full rounded bg-warning-solid px-4 py-2 text-sm font-medium text-warning-on hover:opacity-90 disabled:opacity-50"
        >
          Pick randomly
        </button>

        {/* Kill poll */}
        {canKillPoll && (
          <div className="mt-4 text-center">
            {showAbortConfirm ? (
              <div className="inline-flex items-center gap-2 rounded border border-danger bg-danger-soft px-4 py-2">
                <span className="text-sm text-danger-fg">Kill this poll?</span>
                <button
                  type="button"
                  onClick={() => void handleAbort()}
                  disabled={submitting}
                  className="rounded bg-danger-solid px-3 py-1 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  Yes, kill
                </button>
                <button
                  type="button"
                  onClick={() => setShowAbortConfirm(false)}
                  className="rounded border border-border px-3 py-1 text-sm text-fg-muted hover:bg-surface-muted"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAbortConfirm(true)}
                className="text-sm text-danger-fg hover:opacity-80"
              >
                Cancel poll
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
