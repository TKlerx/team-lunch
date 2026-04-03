import type { AppState } from '../context/AppContext.js';
import { useAppState } from '../context/AppContext.js';
import type { AppPhase } from '../../lib/types.js';

/**
 * Pure derivation function — exported for direct testing.
 * Determines the current application phase from SSE state + nickname.
 */
export function deriveAppPhase(state: AppState, nickname: string | null): AppPhase {
  // 1. No nickname → must prompt
  if (!nickname) return 'NICKNAME_PROMPT';

  // 2. Not yet initialized (SSE hasn't connected) — treat as idle; will update fast
  if (!state.initialized) return 'POLL_IDLE';

  // 3. Active food selection takes highest priority
  if (state.activeFoodSelection) {
    if (state.activeFoodSelection.status === 'overtime') return 'FOOD_SELECTION_OVERTIME';
    if (state.activeFoodSelection.status === 'ordering') return 'FOOD_ORDERING';
    if (state.activeFoodSelection.status === 'delivering') return 'FOOD_DELIVERY_ACTIVE';
    if (state.activeFoodSelection.status === 'delivery_due') return 'FOOD_DELIVERY_DUE';
    return 'FOOD_SELECTION_ACTIVE';
  }

  // 4. Active or tied poll
  if (state.activePoll) {
    if (state.activePoll.status === 'tied') return 'POLL_TIED';
    return 'POLL_ACTIVE';
  }

  // 5. No menus with items → empty-state
  const hasMenusWithItems = state.menus.some((m) => m.items.length > 0);
  if (!hasMenusWithItems) return 'NO_MENUS';

  // 6. A finished poll exists that hasn't been followed by a food selection yet
  if (state.latestCompletedPoll) {
    const latestPoll = state.latestCompletedPoll;
    const matchingFS = state.latestCompletedFoodSelection?.pollId === latestPoll.id;
    if (matchingFS) return 'POLL_IDLE';

    const totalVotes = Object.values(latestPoll.voteCounts ?? {}).reduce(
      (sum, count) => sum + count,
      0,
    );
    // If a poll finished without any votes/winner (timeout or early close),
    // immediately return to idle so admins can start a new poll.
    if (!latestPoll.winnerMenuId && totalVotes === 0) {
      return 'POLL_IDLE';
    }
    if (!matchingFS) return 'POLL_FINISHED';
  }

  // 7. A completed food selection exists â€” show dashboard/home, not the completed summary by default
  if (state.latestCompletedFoodSelection) return 'POLL_IDLE';

  // 8. Default: ready to start a new poll
  return 'POLL_IDLE';
}

/**
 * Hook version — reads from AppContext automatically.
 */
export function useAppPhase(nickname: string | null): AppPhase {
  const state = useAppState();
  return deriveAppPhase(state, nickname);
}
