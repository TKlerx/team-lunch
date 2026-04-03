import { describe, it, expect } from 'vitest';
import { appReducer, initialAppState } from '../../src/client/context/AppContext.js';

describe('appReducer state safety', () => {
  it('resets to initial state when requested explicitly', () => {
    const modifiedState = {
      ...initialAppState,
      initialized: true,
      connected: true,
      dbConnected: false,
      dbReconnectAttempts: 7,
    };

    const next = appReducer(modifiedState, { type: 'RESET_TO_INITIAL_STATE' });
    expect(next).toEqual(initialAppState);
  });

  it('falls back to initial state on unexpected actions', () => {
    const modifiedState = {
      ...initialAppState,
      initialized: true,
      connected: true,
    };

    const next = appReducer(
      modifiedState,
      // @ts-expect-error testing runtime fallback for unexpected action shape
      { type: 'SOMETHING_UNEXPECTED' },
    );

    expect(next).toEqual(initialAppState);
  });

  it('resets lunch-process state when food selection is aborted', () => {
    const modifiedState = {
      ...initialAppState,
      initialized: true,
      connected: true,
      menus: [
        {
          id: 'menu-1',
          name: 'Pizza',
          location: null,
          phone: null,
          url: null,
          sourceDateCreated: null,
          createdAt: '2026-03-02T10:00:00.000Z',
          items: [
            {
              id: 'item-1',
              menuId: 'menu-1',
              name: 'Margherita',
              description: null,
              price: 9.5,
              createdAt: '2026-03-02T10:00:00.000Z',
            },
          ],
          itemCount: 1,
        },
      ],
      activeFoodSelection: {
        id: 'fs-1',
        pollId: 'poll-1',
        menuId: 'menu-1',
        menuName: 'Pizza',
        status: 'delivering' as const,
        startedAt: '2026-03-02T10:00:00.000Z',
        endsAt: '2026-03-02T10:10:00.000Z',
        orderPlacedAt: '2026-03-02T10:10:00.000Z',
        orderPlacedBy: 'admin@example.com',
        completedAt: null,
        etaMinutes: 20,
        etaSetAt: '2026-03-02T10:10:00.000Z',
        deliveryDueAt: '2026-03-02T10:30:00.000Z',
        createdAt: '2026-03-02T10:00:00.000Z',
        orders: [],
      },
      latestCompletedPoll: {
        id: 'poll-1',
        description: 'Lunch',
        status: 'finished' as const,
        startedAt: '2026-03-02T09:50:00.000Z',
        endsAt: '2026-03-02T10:00:00.000Z',
        endedPrematurely: false,
        winnerMenuId: 'menu-1',
        winnerMenuName: 'Pizza',
        winnerSelectedRandomly: false,
        createdAt: '2026-03-02T09:50:00.000Z',
        excludedMenuJustifications: [],
        votes: [],
        voteCounts: {},
      },
      latestCompletedFoodSelection: {
        id: 'fs-prev',
        pollId: 'poll-prev',
        menuId: 'menu-prev',
        menuName: 'Sushi',
        status: 'completed' as const,
        startedAt: '2026-03-01T10:00:00.000Z',
        endsAt: '2026-03-01T10:10:00.000Z',
        orderPlacedAt: '2026-03-01T10:00:00.000Z',
        orderPlacedBy: 'admin@example.com',
        completedAt: '2026-03-01T10:20:00.000Z',
        etaMinutes: 20,
        etaSetAt: '2026-03-01T10:00:00.000Z',
        deliveryDueAt: '2026-03-01T10:20:00.000Z',
        createdAt: '2026-03-01T10:00:00.000Z',
        orders: [],
      },
    };

    const next = appReducer(modifiedState, {
      type: 'FOOD_SELECTION_ABORTED',
      payload: { foodSelectionId: 'fs-1' },
    });

    expect(next.activePoll).toBeNull();
    expect(next.activeFoodSelection).toBeNull();
    expect(next.latestCompletedPoll).toBeNull();
    expect(next.latestCompletedFoodSelection).toBeNull();
    expect(next.menus).toEqual(modifiedState.menus);
    expect(next.connected).toBe(true);
    expect(next.initialized).toBe(true);
  });

  it('keeps full completed food-selection history when a new completion arrives', () => {
    const modifiedState = {
      ...initialAppState,
      initialized: true,
      completedFoodSelectionsHistory: Array.from({ length: 6 }, (_, index) => ({
        id: `fs-${index}`,
        pollId: `poll-${index}`,
        menuId: `menu-${index}`,
        menuName: `Menu ${index}`,
        status: 'completed' as const,
        startedAt: '2026-03-02T10:00:00.000Z',
        endsAt: '2026-03-02T10:10:00.000Z',
        orderPlacedAt: '2026-03-02T10:00:00.000Z',
        orderPlacedBy: 'admin@example.com',
        completedAt: '2026-03-02T10:20:00.000Z',
        etaMinutes: 20,
        etaSetAt: '2026-03-02T10:00:00.000Z',
        deliveryDueAt: '2026-03-02T10:20:00.000Z',
        createdAt: '2026-03-02T10:00:00.000Z',
        orders: [],
      })),
    };

    const next = appReducer(modifiedState, {
      type: 'FOOD_SELECTION_COMPLETED',
      payload: {
        foodSelection: {
          id: 'fs-new',
          pollId: 'poll-new',
          menuId: 'menu-new',
          menuName: 'Newest Menu',
          status: 'completed',
          startedAt: '2026-03-02T10:00:00.000Z',
          endsAt: '2026-03-02T10:10:00.000Z',
          orderPlacedAt: '2026-03-02T10:00:00.000Z',
          orderPlacedBy: 'admin@example.com',
          completedAt: '2026-03-02T10:20:00.000Z',
          etaMinutes: 20,
          etaSetAt: '2026-03-02T10:00:00.000Z',
          deliveryDueAt: '2026-03-02T10:20:00.000Z',
          createdAt: '2026-03-02T10:00:00.000Z',
          orders: [],
        },
      },
    });

    expect(next.completedFoodSelectionsHistory).toHaveLength(7);
    expect(next.completedFoodSelectionsHistory[0]?.id).toBe('fs-new');
  });
});
