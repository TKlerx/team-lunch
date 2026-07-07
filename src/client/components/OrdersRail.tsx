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
  // ponytail: match the "3/3" fraction, not the full label, so phase-name wording (T2/T13) can change freely
  const isPhase3Due =
    hasOngoingLunchProcess && !!inProgressPhaseLabel?.includes('3/3') && remainingSeconds === 0;
  const topActionClass = hasOngoingLunchProcess
    ? 'mb-4 w-full rounded-lg border border-warning bg-warning-soft px-3 py-2 text-left text-sm font-semibold text-warning-fg hover:bg-warning-soft/70'
    : 'mb-4 w-full rounded-lg border border-accent/50 bg-accent-soft px-3 py-2 text-left text-sm font-semibold text-accent-fg hover:bg-accent-soft/70 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <aside className="flex min-h-0 w-full flex-col border-b border-border bg-surface p-4 md:w-80 md:border-b-0 md:border-r">
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
                isPhase3Due ? 'delivery-due-alert text-danger-fg' : 'text-warning-fg'
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

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-fg-muted">Past Lunches</h2>

      {selectedSelectionId && hasOngoingLunchProcess && onBackToOngoing && (
        <button
          type="button"
          onClick={onBackToOngoing}
          className="mb-4 w-full rounded-lg border border-success bg-success-soft px-3 py-2 text-left text-sm font-semibold text-success-fg hover:bg-success-soft/70"
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
                  ? 'border-success bg-success-soft'
                  : 'border-border bg-surface-muted hover:bg-surface'
              }`}
            >
              <p className="text-sm font-medium text-fg">{selection.menuName}</p>
              <p className="text-xs text-fg-muted">{formatCompletedAt(selection.completedAt)}</p>
            </button>
          );
        })}

        {history.length === 0 && (
          <p className="rounded border border-dashed border-border px-3 py-4 text-center text-xs text-fg-muted">
            No completed orders yet.
          </p>
        )}
      </div>
    </aside>
  );
}
