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
      <div className="w-full max-w-md rounded-lg border border-amber-200 bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-center text-lg font-semibold text-amber-700">
          It&apos;s a tie!
        </h2>

        <p className="mb-4 text-center text-sm text-gray-600">
          These menus are tied with {maxVotes} {maxVotes === 1 ? 'vote' : 'votes'} each:
        </p>

        <div className="mb-6 max-h-[40vh] overflow-y-auto">
          <div className="flex flex-wrap justify-center gap-2">
          {tiedMenuNames.map((name) => (
            <span
              key={name}
              className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800"
            >
              {name}
            </span>
          ))}
          </div>
        </div>

        {error && <p className="mb-4 text-center text-sm text-red-600">{error}</p>}

        {/* Extend voting */}
        <div className="mb-4 space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Extend voting
          </label>
          <div className="flex gap-2">
            <select
              value={extensionMinutes}
              onChange={(e) => setExtensionMinutes(Number(e.target.value))}
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              {EXTEND_OPTIONS.map((d) => (
                <option key={d} value={d}>{d} min</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void handleExtend()}
              disabled={submitting || !canManageTieExtension}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Extend
            </button>
          </div>
          {!canManageTieExtension && (
            <p className="text-sm text-amber-700">Only admins or the poll creator can extend this tie.</p>
          )}
        </div>

        <div className="relative my-4 flex items-center">
          <div className="flex-1 border-t border-gray-200" />
          <span className="px-3 text-xs text-gray-400">or</span>
          <div className="flex-1 border-t border-gray-200" />
        </div>

        {/* Random winner */}
        <button
          type="button"
          onClick={() => void handleRandomWinner()}
          disabled={submitting}
          className="w-full rounded bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
        >
          Pick randomly
        </button>

        {/* Kill poll */}
        {canKillPoll && (
          <div className="mt-4 text-center">
            {showAbortConfirm ? (
              <div className="inline-flex items-center gap-2 rounded border border-red-200 bg-red-50 px-4 py-2">
                <span className="text-sm text-red-700">Kill this poll?</span>
                <button
                  type="button"
                  onClick={() => void handleAbort()}
                  disabled={submitting}
                  className="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Yes, kill
                </button>
                <button
                  type="button"
                  onClick={() => setShowAbortConfirm(false)}
                  className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAbortConfirm(true)}
                className="text-sm text-red-500 hover:text-red-700"
              >
                Kill poll (admin)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
