import { useState } from 'react';
import { useAppState } from '../context/AppContext.js';
import { useToast } from '../context/ToastContext.js';
import * as api from '../api.js';
import { isAdminAuthenticatedUser, isCreatorAuthenticatedUser } from '../auth.js';
import { Button } from './ui/Button.js';
import { Select } from './ui/Select.js';
import { getErrorMessage } from '../lib/errorMessage.js';

const EXTEND_OPTIONS = [5, 10, 15, 30] as const;

export default function PollTiedView() {
  const { activePoll, menus } = useAppState();
  const [extensionMinutes, setExtensionMinutes] = useState<number>(5);
  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useToast();
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
    try {
      await api.extendPoll(activePoll.id, extensionMinutes);
    } catch (err) {
      showToast({ tone: 'error', message: getErrorMessage(err, 'Could not extend the poll') });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRandomWinner = async () => {
    setSubmitting(true);
    try {
      await api.randomWinner(activePoll.id);
    } catch (err) {
      showToast({ tone: 'error', message: getErrorMessage(err, 'Could not choose a random winner') });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAbort = async () => {
    setSubmitting(true);
    try {
      await api.abortPoll(activePoll.id);
    } catch (err) {
      showToast({ tone: 'error', message: getErrorMessage(err, 'Could not cancel the poll') });
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

        {/* Extend voting */}
        <div className="mb-4 space-y-2">
          <label className="block text-sm font-medium text-fg">
            Extend voting
          </label>
          <div className="flex gap-2">
            <Select
              value={extensionMinutes}
              onChange={(e) => setExtensionMinutes(Number(e.target.value))}
              className="flex-1"
            >
              {EXTEND_OPTIONS.map((d) => (
                <option key={d} value={d}>{d} min</option>
              ))}
            </Select>
            <Button
              onClick={() => void handleExtend()}
              disabled={submitting || !canManageTieExtension}
            >
              Extend
            </Button>
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
        <Button
          variant="warning"
          onClick={() => void handleRandomWinner()}
          disabled={submitting}
          className="w-full border-0 bg-warning-solid text-warning-on hover:opacity-90"
        >
          Pick randomly
        </Button>

        {/* Kill poll */}
        {canKillPoll && (
          <div className="mt-4 text-center">
            {showAbortConfirm ? (
              <div className="inline-flex items-center gap-2 rounded border border-danger bg-danger-soft px-4 py-2">
                <span className="text-sm text-danger-fg">Kill this poll?</span>
                <Button
                  variant="danger"
                  onClick={() => void handleAbort()}
                  disabled={submitting}
                  className="border-0 bg-danger-solid px-3 py-1 text-white hover:opacity-90"
                >
                  Yes, kill
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setShowAbortConfirm(false)}
                  className="px-3 py-1 text-fg-muted"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                onClick={() => setShowAbortConfirm(true)}
                className="text-danger-fg hover:opacity-80"
              >
                Cancel poll
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
