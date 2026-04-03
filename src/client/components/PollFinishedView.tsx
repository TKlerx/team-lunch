import { useEffect, useState } from 'react';
import * as api from '../api.js';
import MinutesActionDropdown from './MinutesActionDropdown.js';
import { useAppState } from '../context/AppContext.js';

const FOOD_DURATIONS = [1, 5, 10, 15, 20, 25, 30] as const;

export default function PollFinishedView() {
  const { latestCompletedPoll, menus, defaultFoodSelectionDurationMinutes } = useAppState();
  const [duration, setDuration] = useState<number>(defaultFoodSelectionDurationMinutes);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setDuration(defaultFoodSelectionDurationMinutes);
  }, [defaultFoodSelectionDurationMinutes]);

  if (!latestCompletedPoll) return null;

  const poll = latestCompletedPoll;

  const voteCounts = poll.voteCounts;
  const menuEntries = Object.entries(voteCounts)
    .map(([menuId, count]) => {
      const menu = menus.find((entry) => entry.id === menuId);
      return { menuId, name: menu?.name ?? menuId, count };
    })
    .sort((a, b) => b.count - a.count);
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
      <div className="w-full max-w-md rounded-lg border border-green-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-center text-lg font-semibold text-green-700">
          Cuisine Poll finished!
        </h2>

        {poll.winnerMenuName && (
          <div className="mb-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{poll.winnerMenuName}</p>
            {poll.winnerSelectedRandomly && (
              <p className="text-sm text-amber-600">chosen randomly from a tie</p>
            )}
            {poll.endedPrematurely && (
              <p className="text-sm text-blue-600">finished early by user confirmation</p>
            )}
          </div>
        )}

        {!hasVotes && (
          <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            No votes were submitted before the timer expired. Phase 2 cannot start. Please start a
            new poll.
          </div>
        )}

        {menuEntries.length > 0 && (
          <div className="mb-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Final votes
            </h3>
            <div className="mt-1 max-h-[45vh] space-y-1 overflow-y-auto pr-1">
              {menuEntries.map((entry) => (
                <div
                  key={entry.menuId}
                  className={`flex items-center justify-between rounded px-3 py-1 text-sm ${
                    entry.menuId === poll.winnerMenuId
                      ? 'bg-green-50 font-medium text-green-800'
                      : 'text-gray-600'
                  }`}
                >
                  <span>{entry.name}</span>
                  <span>{entry.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p className="mb-4 text-center text-sm text-red-600">{error}</p>}

        {hasVotes && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Start food selection</label>
            <MinutesActionDropdown
              triggerLabel={submitting ? 'Starting...' : `Start (${duration} min)`}
              triggerAriaLabel="Start food selection time menu"
              options={FOOD_DURATIONS}
              onSubmitMinutes={handleStartFoodSelection}
              disabled={submitting}
              customPlaceholder="Custom duration in minutes"
              customAriaLabel="Custom food selection duration in minutes"
              submitButtonLabel="Start custom"
            />
          </div>
        )}
      </div>
    </div>
  );
}
