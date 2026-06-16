import { useEffect, useState } from 'react';
import * as api from '../api.js';
import MinutesActionDropdown from './MinutesActionDropdown.js';
import { useAppState } from '../context/AppContext.js';
import type { Poll } from '../../lib/types.js';

const FOOD_DURATIONS = [1, 5, 10, 15, 20, 25, 30] as const;
type MenuVoteEntry = { menuId: string; name: string; count: number };

function buildMenuEntries(
  poll: Poll,
  menus: ReturnType<typeof useAppState>['menus'],
): MenuVoteEntry[] {
  return Object.entries(poll.voteCounts)
    .map(([menuId, count]) => {
      const menu = menus.find((entry) => entry.id === menuId);
      return { menuId, name: menu?.name ?? menuId, count };
    })
    .sort((a, b) => b.count - a.count);
}

function PollWinnerSummary({ poll }: { poll: Poll }) {
  if (!poll.winnerMenuName) return null;

  return (
    <div className="mb-4 text-center">
      <p className="text-2xl font-bold text-fg">{poll.winnerMenuName}</p>
      {poll.winnerSelectedRandomly && (
        <p className="text-sm text-warning-fg">chosen randomly from a tie</p>
      )}
      {poll.endedPrematurely && (
        <p className="text-sm text-accent">finished early by user confirmation</p>
      )}
    </div>
  );
}

function NoVotesWarning() {
  return (
    <div className="mb-4 rounded border border-warning bg-warning-soft p-3 text-sm text-warning-fg">
      No votes were submitted before the timer expired. Phase 2 cannot start. Please start a new
      poll.
    </div>
  );
}

function FinalVotesList({ entries, winnerMenuId }: { entries: MenuVoteEntry[]; winnerMenuId: string | null }) {
  if (entries.length === 0) return null;

  return (
    <div className="mb-6">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Final votes</h3>
      <div className="mt-1 max-h-[45vh] space-y-1 overflow-y-auto pr-1">
        {entries.map((entry) => (
          <div
            key={entry.menuId}
            className={`flex items-center justify-between rounded px-3 py-1 text-sm ${
              entry.menuId === winnerMenuId
                ? 'bg-success-soft font-medium text-success-fg'
                : 'text-fg-muted'
            }`}
          >
            <span>{entry.name}</span>
            <span>{entry.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StartFoodSelectionControl({
  duration,
  submitting,
  onSubmitMinutes,
}: {
  duration: number;
  submitting: boolean;
  onSubmitMinutes: (value: number) => Promise<boolean>;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-fg">Start food selection</label>
      <MinutesActionDropdown
        triggerLabel={submitting ? 'Starting...' : `Start (${duration} min)`}
        triggerAriaLabel="Start food selection time menu"
        options={FOOD_DURATIONS}
        onSubmitMinutes={onSubmitMinutes}
        disabled={submitting}
        customPlaceholder="Custom duration in minutes"
        customAriaLabel="Custom food selection duration in minutes"
        submitButtonLabel="Start custom"
      />
    </div>
  );
}

export default function PollFinishedView({
  poll: explicitPoll,
  readOnly = false,
}: {
  poll?: Poll | null;
  readOnly?: boolean;
}) {
  const { latestCompletedPoll, menus, defaultFoodSelectionDurationMinutes } = useAppState();
  const [duration, setDuration] = useState<number>(defaultFoodSelectionDurationMinutes);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setDuration(defaultFoodSelectionDurationMinutes);
  }, [defaultFoodSelectionDurationMinutes]);

  const poll = explicitPoll ?? latestCompletedPoll;

  if (!poll) return null;

  const menuEntries = buildMenuEntries(poll, menus);
  const totalVotes = menuEntries.reduce((sum, entry) => sum + entry.count, 0);
  const hasVotes = totalVotes > 0;

  const handleStartFoodSelection = async (value: number): Promise<boolean> => {
    const isValidDuration = value === 1 || (value >= 5 && value <= 30 && value % 5 === 0);
    if (!isValidDuration) {
      setError('Duration must be 1 minute or a multiple of 5 between 5 and 30 minutes');
      return false;
    }

    setSubmitting(true);
    setError('');
    try {
      await api.startFoodSelection(poll.id, value);
      setDuration(value);
      return true;
    } catch (requestError) {
      setError((requestError as Error).message);
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 items-start justify-center p-4">
      <div className="w-full max-w-md rounded-lg border border-success bg-surface p-6 shadow-sm">
        <h2 className="mb-1 text-center text-lg font-semibold text-success-fg">
          Cuisine Poll finished!
        </h2>

        <PollWinnerSummary poll={poll} />
        {!hasVotes && <NoVotesWarning />}
        <FinalVotesList entries={menuEntries} winnerMenuId={poll.winnerMenuId} />

        {error && <p className="mb-4 text-center text-sm text-danger-fg">{error}</p>}

        {hasVotes && !readOnly && (
          <StartFoodSelectionControl
            duration={duration}
            submitting={submitting}
            onSubmitMinutes={handleStartFoodSelection}
          />
        )}
      </div>
    </div>
  );
}
