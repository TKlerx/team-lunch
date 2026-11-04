import type { AppPhase, LunchPhaseAction } from '../../lib/types.js';
import { useAppState } from '../context/AppContext.js';

const STEPS = ['Vote for a restaurant', 'Choose meals', 'Place the order', 'Delivery'];

const phaseStep: Partial<Record<AppPhase, number>> = {
  POLL_ACTIVE: 0,
  POLL_TIED: 0,
  POLL_FINISHED: 1,
  FOOD_SELECTION_ACTIVE: 1,
  FOOD_SELECTION_OVERTIME: 1,
  FOOD_ORDERING: 2,
  FOOD_DELIVERY_ACTIVE: 3,
  FOOD_DELIVERY_DUE: 3,
  FOOD_SELECTION_COMPLETED: 3,
};

const actionLabels: Record<LunchPhaseAction['kind'], string> = {
  closed: 'closed meal selection',
  reopened: 'reopened meal selection',
  claimed: 'volunteered to place the order',
  placed: 'confirmed the restaurant order',
};

export default function LunchProgress({ phase }: { phase: AppPhase }) {
  const { activeFoodSelection, latestCompletedFoodSelection } = useAppState();
  const current = phaseStep[phase];
  if (current === undefined) return null;

  const selection = phase === 'FOOD_SELECTION_COMPLETED' ? latestCompletedFoodSelection : activeFoodSelection;

  return (
    <section aria-label="Lunch progress" className="mx-auto mb-4 w-full max-w-5xl px-4 pt-4">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEPS.map((step, index) => (
          <li
            key={step}
            aria-current={current === index ? 'step' : undefined}
            className="rounded-md border border-border px-2 py-2 text-sm text-fg-muted aria-[current=step]:border-accent aria-[current=step]:font-semibold aria-[current=step]:text-accent-fg"
          >
            {index + 1}. {step}
          </li>
        ))}
      </ol>
      {phase === 'FOOD_SELECTION_OVERTIME' && (
        <p className="mt-2 text-sm text-fg-muted">Time’s up. Extend the timer or finish meal selection.</p>
      )}
      <LunchActivity actions={selection?.phaseActions} />
    </section>
  );
}

export function LunchActivity({ actions }: { actions?: LunchPhaseAction[] }) {
  if (!actions?.length) return null;

  return (
    <details className="mt-2 text-sm text-fg-muted">
      <summary className="cursor-pointer">Lunch activity</summary>
      <ol className="mt-1 space-y-1">
        {actions.map(({ kind, displayName, at }) => (
          <li key={`${kind}-${at}`}>
            {displayName} {actionLabels[kind]} at{' '}
            <time dateTime={at}>{new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>
          </li>
        ))}
      </ol>
    </details>
  );
}
