import { useMemo, useState } from 'react';
import { useAppState } from '../context/AppContext.js';
import { useCountdown, formatTime } from '../hooks/useCountdown.js';
import * as api from '../api.js';
import TimerActionHeader from './TimerActionHeader.js';
import { useConfirmDialog } from './ui/ConfirmDialog.js';
import type { MealRecommendationPreVoteResponse } from '../../lib/types.js';
import {
  getAuthenticatedActorKey,
  getAuthenticatedDisplayLabel,
  isAdminAuthenticatedUser,
  isCreatorAuthenticatedUser,
} from '../auth.js';

// ─── Vote histogram ─────────────────────────────────────────

function VoteHistogram({
  voteCounts,
  menus,
}: {
  voteCounts: Record<string, number>;
  menus: { id: string; name: string }[];
}) {
  const maxVotes = Math.max(1, ...Object.values(voteCounts));

  return (
    <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
      {menus.map((menu) => {
        const count = voteCounts[menu.id] ?? 0;
        const pct = (count / maxVotes) * 100;
        return (
          <div key={menu.id}>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-fg">{menu.name}</span>
              <span className="text-fg-muted">{count}</span>
            </div>
            <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Voting panel ───────────────────────────────────────────

function VotingPanel({
  pollId,
  menus,
  nickname,
  actorKey,
  votes,
  disabled = false,
}: {
  pollId: string;
  menus: { id: string; name: string }[];
  nickname: string;
  actorKey: string | null;
  votes: { menuId: string; nickname: string; actorKey?: string | null }[];
  disabled?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [withdrawingAll, setWithdrawingAll] = useState(false);
  const [error, setError] = useState('');

  const myVotedMenuIds = useMemo(
    () =>
      new Set(
        votes
          .filter((v) => (actorKey ? v.actorKey === actorKey || (!v.actorKey && v.nickname === nickname) : v.nickname === nickname))
          .map((v) => v.menuId),
      ),
    [votes, actorKey, nickname],
  );

  const handleToggle = async (menuId: string) => {
    setLoading(menuId);
    setError('');
    try {
      if (myVotedMenuIds.has(menuId)) {
        await api.withdrawVote(pollId, menuId, nickname);
      } else {
        await api.castVote(pollId, menuId, nickname);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(null);
    }
  };

  const handleWithdrawAll = async () => {
    setWithdrawingAll(true);
    setError('');
    try {
      await api.withdrawAllVotes(pollId, nickname);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWithdrawingAll(false);
    }
  };

  if (collapsed) {
    return (
      <div className="text-center">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="text-sm text-accent hover:text-accent-fg"
        >
          Show voting panel
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-fg">Your votes</h3>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="text-xs text-fg-muted hover:text-fg"
        >
          Hide voting panel
        </button>
      </div>

      {error && <p className="mb-2 text-sm text-danger-fg">{error}</p>}

      {disabled && (
        <p className="mb-3 rounded border border-warning bg-warning-soft px-3 py-2 text-sm text-warning-fg">
          Voting is closed. Review the result and complete the poll.
        </p>
      )}

      <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
        {menus.map((menu) => {
          const voted = myVotedMenuIds.has(menu.id);
          const isLoading = loading === menu.id;
          return (
            <button
              key={menu.id}
              type="button"
              onClick={() => void handleToggle(menu.id)}
              disabled={isLoading || disabled}
              className={`w-full rounded border px-4 py-2 text-left text-sm font-medium transition-colors disabled:opacity-50 ${
                voted
                  ? 'border-accent bg-accent-soft text-accent-fg'
                  : 'border-border bg-surface text-fg hover:bg-surface-muted'
              }`}
            >
              {voted ? '✓ ' : ''}{menu.name}
            </button>
          );
        })}
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={() => void handleWithdrawAll()}
          disabled={withdrawingAll || myVotedMenuIds.size === 0 || disabled}
          className="w-full rounded border border-danger px-4 py-2 text-sm font-medium text-danger-fg hover:bg-danger-soft disabled:opacity-50"
        >
          Withdraw my votes
        </button>
      </div>
    </div>
  );
}

function PublicVotesBoard({
  votes,
  menus,
}: {
  votes: { menuId: string; nickname: string }[];
  menus: { id: string; name: string }[];
}) {
  const grouped = useMemo(() => {
    const byUser = new Map<string, string[]>();
    const menuNames = new Map(menus.map((m) => [m.id, m.name]));

    for (const vote of votes) {
      const menuName = menuNames.get(vote.menuId) ?? vote.menuId;
      const existing = byUser.get(vote.nickname) ?? [];
      if (!existing.includes(menuName)) {
        byUser.set(vote.nickname, [...existing, menuName]);
      }
    }

    return Array.from(byUser.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [votes, menus]);

  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold text-fg">Public votes</h3>
      {grouped.length === 0 ? (
        <p className="text-sm italic text-fg-muted">No votes yet</p>
      ) : (
        <ul className="max-h-[45vh] space-y-1 overflow-y-auto pr-1">
          {grouped.map(([nickname, choices]) => (
            <li key={nickname} className="text-sm text-fg">
              <span className="font-medium">{nickname}</span>
              <span className="text-fg-muted"> &middot; </span>
              <span>{choices.join(', ')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PreVotePanel({ pollId }: { pollId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<MealRecommendationPreVoteResponse | null>(null);

  const handleLoadRecommendations = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.recommendPreVote(pollId, 5);
      setResult(response);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-fg">Pre-vote recommendations</h3>
          <p className="mt-1 text-sm text-fg-muted">
            See what dishes look strongest across the current candidate menus before you vote.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleLoadRecommendations()}
          disabled={loading}
          className="rounded border border-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-soft disabled:opacity-60"
        >
          {loading ? 'Loading...' : result ? 'Refresh suggestions' : 'Show suggestions'}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-danger-fg">{error}</p>}

      {result && (
        <div className="mt-4 space-y-3">
          {result.warnings.length > 0 && (
            <div className="rounded border border-warning bg-warning-soft px-3 py-2 text-sm text-warning-fg">
              {result.warnings.join(' ')}
            </div>
          )}
          {result.items.length === 0 ? (
            <p className="text-sm text-fg-muted">No pre-vote suggestions available yet.</p>
          ) : (
            <ol className="space-y-2">
              {result.items.map((item) => (
                <li key={`${item.menuId}:${item.itemId}`} className="rounded border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-fg">
                        {item.rank}. {item.itemName}
                      </p>
                      <p className="text-xs text-fg-muted">{item.menuName}</p>
                    </div>
                    <span className="text-xs font-medium text-fg-muted">{item.score}</span>
                  </div>
                  <p className="mt-2 text-sm text-fg-muted">{item.reason}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────

export default function PollActiveView() {
  const { activePoll, menus } = useAppState();
  const nickname = getAuthenticatedDisplayLabel();
  const actorKey = getAuthenticatedActorKey();
  const remaining = useCountdown(activePoll?.endsAt);
  const [submitting, setSubmitting] = useState(false);
  const [aborting, setAborting] = useState(false);
  const [updatingTimer, setUpdatingTimer] = useState(false);
  const [manualRemainingMinutes, setManualRemainingMinutes] = useState('');
  const [manualMinutesError, setManualMinutesError] = useState<string | null>(null);
  const { confirm, dialog } = useConfirmDialog();
  const canKillPoll = isAdminAuthenticatedUser();
  const pollExpired = remaining <= 0;

  if (!activePoll || !nickname) return null;
  const canAdjustPollTimer = canKillPoll || isCreatorAuthenticatedUser(activePoll.createdBy);

  const handleFinishNow = async (): Promise<boolean> => {
    const confirmed = await confirm({
      title: 'Confirm completion?',
      consequenceText: 'This ends voting and moves Team Lunch to meal selection.',
      confirmLabel: 'Confirm completion',
    });
    if (!confirmed) return false;

    setSubmitting(true);
    try {
      await api.endPoll(activePoll.id);
      return true;
    } catch {
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleAbort = async () => {
    const confirmed = await confirm({
      title: 'Cancel this poll?',
      consequenceText: 'Current votes will be discarded.',
      confirmLabel: 'Cancel poll',
      destructive: true,
    });
    if (!confirmed) return;

    setAborting(true);
    try {
      await api.abortPoll(activePoll.id);
    } catch {
      // Poll may already be ended; ignore
    } finally {
      setAborting(false);
    }
  };

  const handleUpdateTimer = async (remainingMinutes: number): Promise<boolean> => {
    setUpdatingTimer(true);
    try {
      await api.updatePollTimer(activePoll.id, remainingMinutes);
      setManualRemainingMinutes('');
      return true;
    } catch {
      // Keep menu open on error to allow correction/retry
      return false;
    } finally {
      setUpdatingTimer(false);
    }
  };

  // Total duration for the ring
  const totalSeconds = Math.max(
    1,
    Math.ceil(
      (new Date(activePoll.endsAt).getTime() - new Date(activePoll.startedAt).getTime()) / 1000,
    ),
  );

  // Only show menus that have items
  const excludedMenuIds = new Set(
    activePoll.excludedMenuJustifications.map((entry) => entry.menuId),
  );
  const votableMenus = menus
    .filter((m) => m.items.length > 0 && !excludedMenuIds.has(m.id))
    .map((m) => ({ id: m.id, name: m.name }));
  const timerOptions = [5, 15, 30, 60];

  return (
    <>
    <div className="mx-auto w-full max-w-2xl p-4">
      <TimerActionHeader
        title={
          <>
            {pollExpired ? 'Cuisine Poll Ready to Complete' : 'Cuisine Poll'}: {activePoll.description}
          </>
        }
        timerLabel={formatTime(remaining)}
        remainingSeconds={remaining}
        totalSeconds={totalSeconds}
        triggerAriaLabel="Poll timer actions"
      >
        {({ closeMenu }) => (
          <>
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  const done = await handleFinishNow();
                  if (done) closeMenu();
                })();
              }}
              disabled={submitting}
              className="block w-full border-b border-border bg-success-soft px-3 py-2 text-left text-sm font-medium text-success-fg hover:bg-success-soft disabled:opacity-60"
            >
              Confirm completion
            </button>

            {canKillPoll && (
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    await handleAbort();
                    closeMenu();
                  })();
                }}
                disabled={aborting || submitting}
                className="block w-full border-b border-border bg-danger-soft px-3 py-2 text-left text-sm font-medium text-danger-fg hover:bg-danger-soft disabled:opacity-60"
              >
                Cancel poll
              </button>
            )}

            {canAdjustPollTimer ? (
              <>
                <div className="max-h-40 overflow-y-auto border-b border-border py-1">
                  {timerOptions.map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      onClick={() => {
                        void (async () => {
                          const done = await handleUpdateTimer(minutes);
                          if (done) closeMenu();
                        })();
                      }}
                      disabled={updatingTimer}
                      className="block w-full px-3 py-1.5 text-left text-sm text-fg hover:bg-surface-muted disabled:opacity-60"
                    >
                      {minutes} min
                    </button>
                  ))}
                </div>

                <div className="p-2">
                  <input
                    type="number"
                    min={1}
                    max={720}
                    value={manualRemainingMinutes}
                    onChange={(event) => {
                      setManualRemainingMinutes(event.target.value);
                      setManualMinutesError(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return;
                      event.preventDefault();
                      const parsed = Number.parseInt(manualRemainingMinutes, 10);
                      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 720) {
                        setManualMinutesError('Enter a whole number of minutes between 1 and 720.');
                        return;
                      }
                      void (async () => {
                        const done = await handleUpdateTimer(parsed);
                        if (done) closeMenu();
                      })();
                    }}
                    placeholder="Manual minutes remaining"
                    className="w-full rounded border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
                    aria-label="Poll manual minutes remaining"
                    aria-invalid={manualMinutesError ? true : undefined}
                  />
                  {manualMinutesError && (
                    <p className="mt-1 text-xs text-danger-fg" role="alert">
                      {manualMinutesError}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="border-b border-border px-3 py-2 text-sm text-fg-muted">
                Only admins or the poll creator can adjust this timer.
              </p>
            )}
          </>
        )}
      </TimerActionHeader>

      {/* Histogram */}
      <div className="mb-6 flex justify-center">
        <div className="w-full max-w-xs">
          <VoteHistogram voteCounts={activePoll.voteCounts} menus={votableMenus} />
        </div>
      </div>

      {pollExpired && (
        <div className="mb-6 rounded-lg border border-warning bg-warning-soft p-4 shadow-sm">
          <h2 className="text-base font-semibold text-warning-fg">Voting time is up</h2>
          <p className="mt-1 text-sm text-warning-fg">
            The menu poll has ended. Finalize the result so everyone can move on to meal selection.
          </p>
          {canKillPoll ? (
            <button
              type="button"
              onClick={() => {
                void handleFinishNow();
              }}
              disabled={submitting}
              className="mt-4 rounded bg-success-solid px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              Confirm completion
            </button>
          ) : (
            <p className="mt-3 text-sm text-warning-fg">
              Waiting for an organizer to confirm the result.
            </p>
          )}
        </div>
      )}

      {/* Voting panel */}
      <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
        <VotingPanel
          pollId={activePoll.id}
          menus={votableMenus}
          nickname={nickname}
          actorKey={actorKey}
          votes={activePoll.votes}
          disabled={pollExpired}
        />
      </div>

      <div className="mt-4">
        <PreVotePanel pollId={activePoll.id} />
      </div>

      <div className="mt-4">
        <PublicVotesBoard votes={activePoll.votes} menus={votableMenus} />
      </div>
    </div>
    {dialog}
    </>
  );
}
