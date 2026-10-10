import { useState } from 'react';
import type { FoodSelection } from '../../lib/types.js';
import { formatTime, useCountdown } from '../hooks/useCountdown.js';
import { Button } from './ui/Button.js';
import { sectionTitleClass } from './ui/Section.js';

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
  const [historyOpen, setHistoryOpen] = useState(false);
  const topActionLabel = hasOngoingLunchProcess
    ? (inProgressActionLabel ?? 'In Progress...')
    : 'Start new Team Lunch';
  const remainingSeconds = useCountdown(hasOngoingLunchProcess ? inProgressCountdownTo : null);
  const timerLabel = formatTime(remainingSeconds);
  // ponytail: match the "3/3" fraction, not the full label, so phase-name wording (T2/T13) can change freely
  const isPhase3Due =
    hasOngoingLunchProcess && !!inProgressPhaseLabel?.includes('3/3') && remainingSeconds === 0;
  const topActionVariant = hasOngoingLunchProcess ? 'warning' : 'primary';
  const topActionClass = hasOngoingLunchProcess
    ? 'mb-4 w-full px-3 text-left font-semibold'
    : 'mb-4 w-full border border-accent/50 bg-accent-soft px-3 text-left font-semibold text-accent-fg hover:bg-accent-soft/70';

  return (
    <aside className="flex min-h-0 w-full shrink-0 flex-col border-b border-border bg-surface p-3 md:w-80 md:border-b-0 md:border-r md:p-4">
      <Button
        variant={topActionVariant}
        onClick={onStartNewTeamLunch}
        disabled={!hasOngoingLunchProcess && disableStartNewTeamLunch}
        className={topActionClass}
      >
        {hasOngoingLunchProcess ? (
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span>{topActionLabel}</span>
            <span
              data-testid="in-progress-status"
              className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded px-2 py-0.5 text-xs font-bold ${
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
      </Button>

      <h2 className={`mb-3 hidden md:block ${sectionTitleClass}`}>Past Lunches</h2>
      <Button
        variant="secondary"
        className="mb-2 w-full text-left md:hidden"
        aria-expanded={historyOpen}
        aria-controls="past-lunches"
        onClick={() => setHistoryOpen((open) => !open)}
      >
        Past Lunches ({history.length}) {historyOpen ? '▴' : '▾'}
      </Button>

      {selectedSelectionId && hasOngoingLunchProcess && onBackToOngoing && (
        <Button
          variant="success"
          onClick={onBackToOngoing}
          className="mb-4 w-full px-3 text-left font-semibold"
        >
          Back to ongoing Team Lunch
        </Button>
      )}

      <div id="past-lunches" className={`${historyOpen ? 'block' : 'hidden'} max-h-[20dvh] min-h-0 space-y-2 overflow-y-auto pr-1 md:block md:max-h-none md:flex-1`}>
        {history.map((selection) => {
          const isSelected = selectedSelectionId === selection.id;
          return (
            <Button
              key={selection.id}
              variant="secondary"
              onClick={(event) => {
                onSelectSelection(selection.id);
                setHistoryOpen(false);
                event.currentTarget.closest('aside')?.querySelector<HTMLButtonElement>('[aria-controls="past-lunches"]')?.focus();
              }}
              className={`w-full px-3 text-left ${
                isSelected ? 'border-success bg-success-soft' : 'bg-surface-muted hover:bg-surface'
              }`}
            >
              <p className="text-sm font-medium text-fg">{selection.menuName}</p>
              <p className="text-xs text-fg-muted">{formatCompletedAt(selection.completedAt)}</p>
            </Button>
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
