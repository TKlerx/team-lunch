import { useMemo, useState } from 'react';
import { useAppState } from '../context/AppContext.js';
import { useNickname } from '../hooks/useNickname.js';
import { useCountdown, formatTime } from '../hooks/useCountdown.js';
import * as api from '../api.js';
import TimerActionHeader from './TimerActionHeader.js';
import { isAdminAuthenticatedUser, isCreatorAuthenticatedUser } from '../auth.js';

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
              <span className="font-medium text-gray-700">{menu.name}</span>
              <span className="text-gray-500">{count}</span>
            </div>
            <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-300"
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
  votes,
  disabled = false,
}: {
  pollId: string;
  menus: { id: string; name: string }[];
  nickname: string;
  votes: { menuId: string; nickname: string }[];
  disabled?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [withdrawingAll, setWithdrawingAll] = useState(false);
  const [error, setError] = useState('');

  const myVotedMenuIds = useMemo(
    () => new Set(votes.filter((v) => v.nickname === nickname).map((v) => v.menuId)),
    [votes, nickname],
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
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          Show voting panel
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Your votes</h3>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          I&apos;ll sit this one out
        </button>
      </div>

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      {disabled && (
        <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
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
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
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
          className="w-full rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
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
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold text-gray-700">Public votes</h3>
      {grouped.length === 0 ? (
        <p className="text-sm italic text-gray-400">No votes yet</p>
      ) : (
        <ul className="max-h-[45vh] space-y-1 overflow-y-auto pr-1">
          {grouped.map(([nickname, choices]) => (
            <li key={nickname} className="text-sm text-gray-700">
              <span className="font-medium">{nickname}</span>
              <span className="text-gray-400"> &middot; </span>
              <span>{choices.join(', ')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────

export default function PollActiveView() {
  const { activePoll, menus } = useAppState();
  const { nickname } = useNickname();
  const remaining = useCountdown(activePoll?.endsAt);
  const [submitting, setSubmitting] = useState(false);
  const [aborting, setAborting] = useState(false);
  const [updatingTimer, setUpdatingTimer] = useState(false);
  const [manualRemainingMinutes, setManualRemainingMinutes] = useState('');
  const canKillPoll = isAdminAuthenticatedUser();
  const pollExpired = remaining <= 0;

  if (!activePoll || !nickname) return null;
  const canAdjustPollTimer = canKillPoll || isCreatorAuthenticatedUser(activePoll.createdBy);

  const handleFinishNow = async (): Promise<boolean> => {
    const confirmed = window.confirm('Confirm completion?');
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
    const confirmed = window.confirm('Abort this poll?');
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
  const timerOptions = Array.from({ length: 24 }, (_, index) => (index + 1) * 5);

  return (
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
              className="block w-full border-b border-gray-200 bg-green-100 px-3 py-2 text-left text-sm font-medium text-green-800 hover:bg-green-200 disabled:opacity-60"
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
                className="block w-full border-b border-gray-200 bg-red-100 px-3 py-2 text-left text-sm font-medium text-red-800 hover:bg-red-200 disabled:opacity-60"
              >
                Kill poll (admin)
              </button>
            )}

            {canAdjustPollTimer ? (
              <>
                <div className="max-h-40 overflow-y-auto border-b border-gray-200 py-1">
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
                      className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                    >
                      {minutes} min
                    </button>
                  ))}
                </div>

                <div className="p-2">
                  <input
                    type="text"
                    value={manualRemainingMinutes}
                    onChange={(event) => setManualRemainingMinutes(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void (async () => {
                          const done = await handleUpdateTimer(
                            Number.parseInt(manualRemainingMinutes, 10),
                          );
                          if (done) closeMenu();
                        })();
                      }
                    }}
                    placeholder="Manual minutes remaining"
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                    aria-label="Poll manual minutes remaining"
                  />
                </div>
              </>
            ) : (
              <p className="border-b border-gray-200 px-3 py-2 text-sm text-gray-600">
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
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <h2 className="text-base font-semibold text-amber-900">Voting time is up</h2>
          <p className="mt-1 text-sm text-amber-800">
            The menu poll has ended. Finalize the result so everyone can move on to meal selection.
          </p>
          {canKillPoll ? (
            <button
              type="button"
              onClick={() => {
                void handleFinishNow();
              }}
              disabled={submitting}
              className="mt-4 rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
            >
              Confirm completion
            </button>
          ) : (
            <p className="mt-3 text-sm text-amber-900">
              Waiting for an organizer to confirm the result.
            </p>
          )}
        </div>
      )}

      {/* Voting panel */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <VotingPanel
          pollId={activePoll.id}
          menus={votableMenus}
          nickname={nickname}
          votes={activePoll.votes}
          disabled={pollExpired}
        />
      </div>

      <div className="mt-4">
        <PublicVotesBoard votes={activePoll.votes} menus={votableMenus} />
      </div>
    </div>
  );
}
