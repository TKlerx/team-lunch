import type { FoodSelection } from '../../lib/types.js';
import { formatTime, useCountdown } from '../hooks/useCountdown.js';

interface OrdersRailProps {
  history: FoodSelection[];
  selectedSelectionId: string | null;
  onSelectSelection: (selectionId: string) => void;
  onBackToOngoing?: () => void;
  hasOngoingLunchProcess?: boolean;
  onStartNewTeamLunch: () => void;
  disableStartNewTeamLunch?: boolean;
  inProgressActionLabel?: string;
  inProgressPhaseLabel?: string;
  inProgressCountdownTo?: string | null;
}

function formatCompletedAt(value: string | null): string {
  if (!value) return 'Unknown completion time';
  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export default function OrdersRail({
  history,
  selectedSelectionId,
  onSelectSelection,
  onBackToOngoing,
  hasOngoingLunchProcess = false,
  onStartNewTeamLunch,
  disableStartNewTeamLunch = false,
  inProgressActionLabel,
  inProgressPhaseLabel,
  inProgressCountdownTo,
}: OrdersRailProps) {
  const topActionLabel = hasOngoingLunchProcess
    ? (inProgressActionLabel ?? 'In Progress...')
    : 'Start new Team Lunch';
  const remainingSeconds = useCountdown(hasOngoingLunchProcess ? inProgressCountdownTo : null);
  const timerLabel = formatTime(remainingSeconds);
  const isPhase3Due = hasOngoingLunchProcess && inProgressPhaseLabel === '3/3' && remainingSeconds === 0;
  const topActionClass = hasOngoingLunchProcess
    ? 'mb-4 w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-left text-sm font-semibold text-amber-800 hover:bg-amber-100'
    : 'mb-4 w-full rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-left text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <aside className="flex min-h-0 w-80 flex-col border-r border-gray-200 bg-white p-4">
      <button
        type="button"
        onClick={onStartNewTeamLunch}
        disabled={!hasOngoingLunchProcess && disableStartNewTeamLunch}
        className={topActionClass}
      >
        {hasOngoingLunchProcess ? (
          <span className="flex items-center justify-between gap-2">
            <span>{topActionLabel}</span>
            <span
              data-testid="in-progress-status"
              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold ${
                isPhase3Due ? 'delivery-due-alert text-red-700' : 'text-amber-700'
              }`}
            >
              {inProgressPhaseLabel ?? '-'} ·
              {isPhase3Due && (
                <span className="ringing-clock" role="img" aria-label="Ringing clock">
                  ⏰
                </span>
              )}
              <span>{timerLabel}</span>
            </span>
          </span>
        ) : (
          topActionLabel
        )}
      </button>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700">Past Lunches</h2>

      {selectedSelectionId && hasOngoingLunchProcess && onBackToOngoing && (
        <button
          type="button"
          onClick={onBackToOngoing}
          className="mb-4 w-full rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-left text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
        >
          Back to ongoing Team Lunch
        </button>
      )}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {history.map((selection) => {
          const isSelected = selectedSelectionId === selection.id;
          return (
            <button
              key={selection.id}
              type="button"
              onClick={() => onSelectSelection(selection.id)}
              className={`w-full rounded-lg border px-3 py-2 text-left ${
                isSelected
                  ? 'border-green-300 bg-green-50'
                  : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
              }`}
            >
              <p className="text-sm font-medium text-gray-800">{selection.menuName}</p>
              <p className="text-xs text-gray-500">{formatCompletedAt(selection.completedAt)}</p>
            </button>
          );
        })}

        {history.length === 0 && (
          <p className="rounded border border-dashed border-gray-300 px-3 py-4 text-center text-xs text-gray-500">
            No completed orders yet.
          </p>
        )}
      </div>
    </aside>
  );
}
