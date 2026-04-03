import { describe, it, expect } from 'vitest';
import { deriveAppPhase } from '../../src/client/hooks/useAppPhase.js';
import { initialAppState, type AppState } from '../../src/client/context/AppContext.js';
import type { Poll, FoodSelection, Menu } from '../../src/lib/types.js';

// ─── Helpers ───────────────────────────────────────────────

function makePoll(overrides: Partial<Poll> = {}): Poll {
  return {
    id: 'poll-1',
    description: 'Where to eat?',
    status: 'active',
    startedAt: '2026-01-01T12:00:00Z',
    endsAt: '2026-01-01T13:00:00Z',
    endedPrematurely: false,
    winnerMenuId: null,
    winnerMenuName: null,
    winnerSelectedRandomly: false,
    createdAt: '2026-01-01T12:00:00Z',
    excludedMenuJustifications: [],
    votes: [],
    voteCounts: {},
    ...overrides,
  };
}

function makeFS(overrides: Partial<FoodSelection> = {}): FoodSelection {
  const merged = { ...overrides };
  return {
    id: 'fs-1',
    pollId: 'poll-1',
    menuId: 'menu-1',
    menuName: 'Pizza Place',
    status: 'active',
    startedAt: '2026-01-01T13:00:00Z',
    endsAt: '2026-01-01T13:15:00Z',
    orderPlacedAt: null,
    completedAt: null,
    etaMinutes: null,
    etaSetAt: null,
    deliveryDueAt: null,
    createdAt: '2026-01-01T13:00:00Z',
    orders: [],
    ...merged,
    orderPlacedBy: merged.orderPlacedBy ?? null,
  };
}

function makeMenu(overrides: Partial<Menu> = {}): Menu {
  return {
    id: 'menu-1',
    name: 'Pizza Place',
    location: null,
    phone: null,
    url: null,
    sourceDateCreated: null,
    createdAt: '2026-01-01T00:00:00Z',
    items: [
      {
        id: 'item-1',
        menuId: 'menu-1',
        name: 'Margherita',
        description: null,
        price: null,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
    itemCount: 1,
    ...overrides,
  };
}

function state(overrides: Partial<AppState> = {}): AppState {
  return { ...initialAppState, initialized: true, ...overrides };
}

// ─── Tests ─────────────────────────────────────────────────

describe('deriveAppPhase', () => {
  it('returns NICKNAME_PROMPT when nickname is null', () => {
    expect(deriveAppPhase(state(), null)).toBe('NICKNAME_PROMPT');
  });

  it('returns NICKNAME_PROMPT when nickname is empty string', () => {
    // empty string is falsy → treated as no nickname
    expect(deriveAppPhase(state(), '')).toBe('NICKNAME_PROMPT');
  });

  it('returns NO_MENUS when menus list is empty', () => {
    expect(deriveAppPhase(state({ menus: [] }), 'Alice')).toBe('NO_MENUS');
  });

  it('returns NO_MENUS when all menus have zero items', () => {
    const emptyMenu = makeMenu({ items: [], itemCount: 0 });
    expect(deriveAppPhase(state({ menus: [emptyMenu] }), 'Alice')).toBe('NO_MENUS');
  });

  it('returns POLL_IDLE when menus with items exist but nothing active', () => {
    expect(deriveAppPhase(state({ menus: [makeMenu()] }), 'Alice')).toBe('POLL_IDLE');
  });

  it('returns POLL_ACTIVE when an active poll exists', () => {
    const s = state({ menus: [makeMenu()], activePoll: makePoll() });
    expect(deriveAppPhase(s, 'Alice')).toBe('POLL_ACTIVE');
  });

  it('returns POLL_TIED when the active poll is tied', () => {
    const s = state({
      menus: [makeMenu()],
      activePoll: makePoll({ status: 'tied' }),
    });
    expect(deriveAppPhase(s, 'Alice')).toBe('POLL_TIED');
  });

  it('returns POLL_FINISHED when a completed poll exists without matching food selection', () => {
    const s = state({
      menus: [makeMenu()],
      latestCompletedPoll: makePoll({
        status: 'finished',
        id: 'poll-1',
        winnerMenuId: 'menu-1',
        winnerMenuName: 'Pizza Place',
        voteCounts: { 'menu-1': 3 },
      }),
    });
    expect(deriveAppPhase(s, 'Alice')).toBe('POLL_FINISHED');
  });

  it('returns POLL_FINISHED when latest food selection is from a different poll', () => {
    const s = state({
      menus: [makeMenu()],
      latestCompletedPoll: makePoll({
        status: 'finished',
        id: 'poll-2',
        winnerMenuId: 'menu-2',
        winnerMenuName: 'Burgers',
        voteCounts: { 'menu-2': 4 },
      }),
      latestCompletedFoodSelection: makeFS({ pollId: 'poll-1', status: 'completed' }),
    });
    expect(deriveAppPhase(s, 'Alice')).toBe('POLL_FINISHED');
  });

  it('returns POLL_IDLE when latest completed poll was closed early with no winner and no votes', () => {
    const s = state({
      menus: [makeMenu()],
      latestCompletedPoll: makePoll({
        status: 'finished',
        endedPrematurely: true,
        winnerMenuId: null,
        winnerMenuName: null,
        voteCounts: {},
      }),
      latestCompletedFoodSelection: null,
    });
    expect(deriveAppPhase(s, 'Alice')).toBe('POLL_IDLE');
  });

  it('returns POLL_IDLE when latest completed poll timed out with no winner and no votes', () => {
    const s = state({
      menus: [makeMenu()],
      latestCompletedPoll: makePoll({
        status: 'finished',
        endedPrematurely: false,
        winnerMenuId: null,
        winnerMenuName: null,
        voteCounts: {},
      }),
      latestCompletedFoodSelection: null,
    });
    expect(deriveAppPhase(s, 'Alice')).toBe('POLL_IDLE');
  });

  it('returns POLL_IDLE when food selection matches the latest completed poll', () => {
    const s = state({
      menus: [makeMenu()],
      latestCompletedPoll: makePoll({ status: 'finished', id: 'poll-1' }),
      latestCompletedFoodSelection: makeFS({ pollId: 'poll-1', status: 'completed' }),
    });
    expect(deriveAppPhase(s, 'Alice')).toBe('POLL_IDLE');
  });

  it('returns FOOD_SELECTION_ACTIVE when an active food selection exists', () => {
    const s = state({
      menus: [makeMenu()],
      activeFoodSelection: makeFS(),
    });
    expect(deriveAppPhase(s, 'Alice')).toBe('FOOD_SELECTION_ACTIVE');
  });

  it('returns FOOD_SELECTION_OVERTIME when food selection is overtime', () => {
    const s = state({
      menus: [makeMenu()],
      activeFoodSelection: makeFS({ status: 'overtime' }),
    });
    expect(deriveAppPhase(s, 'Alice')).toBe('FOOD_SELECTION_OVERTIME');
  });

  it('returns FOOD_ORDERING when order placement phase is active', () => {
    const s = state({
      menus: [makeMenu()],
      activeFoodSelection: makeFS({ status: 'ordering' }),
    });
    expect(deriveAppPhase(s, 'Alice')).toBe('FOOD_ORDERING');
  });

  it('returns FOOD_DELIVERY_ACTIVE when delivery phase is active', () => {
    const s = state({
      menus: [makeMenu()],
      activeFoodSelection: makeFS({ status: 'delivering' }),
    });
    expect(deriveAppPhase(s, 'Alice')).toBe('FOOD_DELIVERY_ACTIVE');
  });

  it('returns FOOD_DELIVERY_DUE when delivery timer expired', () => {
    const s = state({
      menus: [makeMenu()],
      activeFoodSelection: makeFS({ status: 'delivery_due' }),
    });
    expect(deriveAppPhase(s, 'Alice')).toBe('FOOD_DELIVERY_DUE');
  });

  it('food selection takes priority over active poll', () => {
    const s = state({
      menus: [makeMenu()],
      activePoll: makePoll(),
      activeFoodSelection: makeFS(),
    });
    expect(deriveAppPhase(s, 'Alice')).toBe('FOOD_SELECTION_ACTIVE');
  });

  it('returns POLL_IDLE when not yet initialized but nickname present', () => {
    // Before SSE connects, initialized=false — show idle as loading placeholder
    expect(deriveAppPhase(initialAppState, 'Alice')).toBe('POLL_IDLE');
  });
  it('returns POLL_IDLE when only latest completed food selection exists', () => {
    const s = state({
      menus: [makeMenu()],
      latestCompletedFoodSelection: makeFS({ status: 'completed' }),
    });
    expect(deriveAppPhase(s, 'Alice')).toBe('POLL_IDLE');
  });
});
