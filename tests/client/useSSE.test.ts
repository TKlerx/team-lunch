import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { useSSE } from '../../src/client/hooks/useSSE.js';
import { AppProvider, useAppState } from '../../src/client/context/AppContext.js';
import type { InitialStatePayload, Poll, FoodSelection, Menu, ShoppingListItem } from '../../src/lib/types.js';

// ─── Mock EventSource ──────────────────────────────────────

type ESListener = (e: MessageEvent) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;

  private listeners: Record<string, ESListener[]> = {};

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
    // Simulate async open
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.();
    });
  }

  addEventListener(event: string, handler: ESListener) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(handler);
  }

  removeEventListener(event: string, handler: ESListener) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter((h) => h !== handler);
    }
  }

  close() {
    this.readyState = 2;
  }

  /** Test helper: dispatch an SSE event */
  emit(eventName: string, data: unknown) {
    const event = new MessageEvent(eventName, { data: JSON.stringify(data) });
    this.listeners[eventName]?.forEach((h) => h(event));
  }
}

// ─── Test data ─────────────────────────────────────────────

function makePoll(overrides: Partial<Poll> = {}): Poll {
  return {
    id: 'poll-1',
    description: 'Lunch poll',
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

function makeShoppingItem(overrides: Partial<ShoppingListItem> = {}): ShoppingListItem {
  return {
    id: 'shopping-1',
    name: 'Coffee beans',
    requestedBy: 'alice@example.com',
    bought: false,
    boughtBy: null,
    boughtAt: null,
    createdAt: '2026-01-01T09:00:00Z',
    updatedAt: '2026-01-01T09:00:00Z',
    ...overrides,
  };
}

const initialStatePayload: InitialStatePayload = {
  activePoll: makePoll(),
  activeFoodSelection: null,
  latestCompletedPoll: null,
  latestCompletedFoodSelection: null,
  completedFoodSelectionsHistory: [],
  defaultFoodSelectionDurationMinutes: 30,
};

// ─── Setup ─────────────────────────────────────────────────

let originalEventSource: typeof EventSource;
let originalFetch: typeof fetch;

beforeEach(() => {
  MockEventSource.instances = [];
  originalEventSource = globalThis.EventSource;
  originalFetch = globalThis.fetch;

  // @ts-expect-error — assigning mock
  globalThis.EventSource = MockEventSource;

  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);

    if (url === '/api/health') {
      return Promise.resolve({
        json: () => Promise.resolve({ status: 'ok', db: { connected: true, attemptCount: 0 } }),
      } as Response);
    }

    return Promise.resolve({
      json: () => Promise.resolve([]),
    } as Response);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.EventSource = originalEventSource;
  globalThis.fetch = originalFetch;
  localStorage.clear();
  vi.unstubAllGlobals();
});

// ─── Render helper ─────────────────────────────────────────

/** Renders useSSE + useAppState together inside AppProvider */
function renderSSE(selectedOfficeLocationId?: string | null) {
  function TestHook() {
    useSSE(selectedOfficeLocationId);
    return useAppState();
  }

  return renderHook(() => TestHook(), {
    wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(AppProvider, null, children),
  });
}

function getES(): MockEventSource {
  return MockEventSource.instances[MockEventSource.instances.length - 1];
}

// ─── Tests ─────────────────────────────────────────────────

describe('useSSE', () => {
  it('connects to /api/events', async () => {
    renderSSE();
    await act(() => Promise.resolve()); // flush microtasks
    expect(getES().url).toBe('/api/events');
  });

  it('adds admin office context to fetches and SSE when provided', async () => {
    renderSSE('office-2');
    await act(() => Promise.resolve());

    expect(getES().url).toBe('/api/events?officeLocationId=office-2');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/menus?officeLocationId=office-2');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/food-selections/history?officeLocationId=office-2',
    );
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/shopping-list?officeLocationId=office-2');
  });

  it('fetches menus on mount', async () => {
    renderSSE();
    await act(() => Promise.resolve());
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/menus');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/food-selections/history');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/shopping-list');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/health', { cache: 'no-store' });
  });

  it('updates db connectivity state from health response', async () => {
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/health') {
        return Promise.resolve({
          json: () =>
            Promise.resolve({ status: 'degraded', db: { connected: false, attemptCount: 4 } }),
        } as Response);
      }

      return Promise.resolve({
        json: () => Promise.resolve([]),
      } as Response);
    }) as unknown as typeof fetch;

    const { result } = renderSSE();
    await act(() => Promise.resolve());

    expect(result.current.dbConnected).toBe(false);
    expect(result.current.dbReconnectAttempts).toBe(4);
  });

  it('hydrates state from initial_state event', async () => {
    const { result } = renderSSE();
    await act(() => Promise.resolve());

    act(() => {
      getES().emit('initial_state', initialStatePayload);
    });

    expect(result.current.initialized).toBe(true);
    expect(result.current.activePoll?.id).toBe('poll-1');
  });

  it('sets menus from fetch response', async () => {
    const menus = [makeMenu()];
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve(menus),
    }) as unknown as typeof fetch;

    const { result } = renderSSE();
    await act(() => Promise.resolve());

    expect(result.current.menus).toHaveLength(1);
    expect(result.current.menus[0].name).toBe('Pizza Place');
  });

  it('handles menu_created event', async () => {
    const { result } = renderSSE();
    await act(() => Promise.resolve());

    const newMenu = makeMenu({ id: 'menu-2', name: 'Sushi Bar' });
    act(() => {
      getES().emit('menu_created', { menu: newMenu });
    });

    expect(result.current.menus).toHaveLength(1);
    expect(result.current.menus[0].name).toBe('Sushi Bar');
  });

  it('handles shopping_list_item_added event', async () => {
    const { result } = renderSSE();
    await act(() => Promise.resolve());

    act(() => {
      getES().emit('shopping_list_item_added', { item: makeShoppingItem() });
    });

    expect(result.current.shoppingListItems).toEqual([makeShoppingItem()]);
  });

  it('handles shopping_list_item_updated event', async () => {
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/health') {
        return Promise.resolve({
          json: () => Promise.resolve({ status: 'ok', db: { connected: true, attemptCount: 0 } }),
        } as Response);
      }
      if (url === '/api/shopping-list') {
        return Promise.resolve({
          json: () => Promise.resolve([makeShoppingItem()]),
        } as Response);
      }

      return Promise.resolve({
        json: () => Promise.resolve([]),
      } as Response);
    }) as unknown as typeof fetch;

    const { result } = renderSSE();
    await act(() => Promise.resolve());

    act(() => {
      getES().emit('shopping_list_item_updated', {
        item: makeShoppingItem({
          bought: true,
          boughtBy: 'bob@example.com',
          boughtAt: '2026-01-01T10:00:00Z',
          updatedAt: '2026-01-01T10:00:00Z',
        }),
      });
    });

    expect(result.current.shoppingListItems[0]?.bought).toBe(true);
    expect(result.current.shoppingListItems[0]?.boughtBy).toBe('bob@example.com');
  });

  it('handles menu_deleted event', async () => {
    const menus = [makeMenu()];
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve(menus),
    }) as unknown as typeof fetch;

    const { result } = renderSSE();
    await act(() => Promise.resolve());

    act(() => {
      getES().emit('menu_deleted', { menuId: 'menu-1' });
    });

    expect(result.current.menus).toHaveLength(0);
  });

  it('handles poll_started event', async () => {
    const { result } = renderSSE();
    await act(() => Promise.resolve());

    const poll = makePoll({ id: 'poll-99' });
    act(() => {
      getES().emit('poll_started', { poll });
    });

    expect(result.current.activePoll?.id).toBe('poll-99');
  });

  it('handles vote_cast event — updates poll votes and counts', async () => {
    const { result } = renderSSE();
    await act(() => Promise.resolve());

    act(() => {
      getES().emit('initial_state', initialStatePayload);
    });

    act(() => {
      getES().emit('vote_cast', {
        poll: makePoll({
          id: 'poll-1',
          voteCounts: { 'menu-1': 3 },
          votes: [
            {
              id: 'v-1',
              pollId: 'poll-1',
              menuId: 'menu-1',
              menuName: 'Pizza Place',
              nickname: 'Alice',
              castAt: '2026-01-01T12:10:00Z',
            },
          ],
        }),
      });
    });

    expect(result.current.activePoll?.voteCounts).toEqual({ 'menu-1': 3 });
    expect(result.current.activePoll?.votes).toHaveLength(1);
  });

  it('handles poll_ended with finished status', async () => {
    const { result } = renderSSE();
    await act(() => Promise.resolve());

    act(() => {
      getES().emit('initial_state', initialStatePayload);
    });

    act(() => {
      getES().emit('poll_ended', {
        pollId: 'poll-1',
        status: 'finished',
        winner: { menuId: 'menu-1', menuName: 'Pizza Place', selectedRandomly: false },
      });
    });

    expect(result.current.activePoll).toBeNull();
    expect(result.current.latestCompletedPoll?.id).toBe('poll-1');
    expect(result.current.latestCompletedPoll?.status).toBe('finished');
    expect(result.current.latestCompletedPoll?.winnerMenuName).toBe('Pizza Place');
  });

  it('handles poll_ended with tied status', async () => {
    const { result } = renderSSE();
    await act(() => Promise.resolve());

    act(() => {
      getES().emit('initial_state', initialStatePayload);
    });

    act(() => {
      getES().emit('poll_ended', { pollId: 'poll-1', status: 'tied' });
    });

    expect(result.current.activePoll?.status).toBe('tied');
    expect(result.current.activePoll?.id).toBe('poll-1');
  });

  it('handles poll_extended event', async () => {
    const { result } = renderSSE();
    await act(() => Promise.resolve());

    act(() => {
      getES().emit('initial_state', {
        ...initialStatePayload,
        activePoll: makePoll({ status: 'tied' }),
      });
    });

    act(() => {
      getES().emit('poll_extended', {
        pollId: 'poll-1',
        newEndsAt: '2026-01-01T14:00:00Z',
      });
    });

    expect(result.current.activePoll?.status).toBe('active');
    expect(result.current.activePoll?.endsAt).toBe('2026-01-01T14:00:00Z');
  });

  it('handles food_selection_started event', async () => {
    const { result } = renderSSE();
    await act(() => Promise.resolve());

    const fs = makeFS();
    act(() => {
      getES().emit('food_selection_started', { foodSelection: fs });
    });

    expect(result.current.activeFoodSelection?.id).toBe('fs-1');
  });

  it('handles food_selection_ordering_started event', async () => {
    const { result } = renderSSE();
    await act(() => Promise.resolve());

    const fs = makeFS({ status: 'ordering' });
    act(() => {
      getES().emit('food_selection_ordering_started', { foodSelection: fs });
    });

    expect(result.current.activeFoodSelection?.status).toBe('ordering');
  });

  it('handles food_selection_ordering_claimed event', async () => {
    const { result } = renderSSE();
    await act(() => Promise.resolve());

    act(() => {
      getES().emit('food_selection_ordering_started', {
        foodSelection: makeFS({ status: 'ordering', orderPlacedBy: null }),
      });
    });

    act(() => {
      getES().emit('food_selection_ordering_claimed', {
        foodSelection: makeFS({ status: 'ordering', orderPlacedBy: 'Alice' }),
      });
    });

    expect(result.current.activeFoodSelection?.status).toBe('ordering');
    expect(result.current.activeFoodSelection?.orderPlacedBy).toBe('Alice');
  });

  it('shows a browser notification when the current user is pinged as a fallback candidate', async () => {
    const notificationCtor = vi.fn();
    class MockNotification {
      static permission: NotificationPermission = 'granted';
      static requestPermission = vi.fn();

      constructor(title: string, options?: NotificationOptions) {
        notificationCtor(title, options);
      }
    }

    localStorage.setItem('team_lunch_nickname', 'dana@example.com');
    localStorage.setItem('team_lunch_phase_notifications_enabled', 'true');
    vi.stubGlobal('Notification', MockNotification);

    renderSSE();
    await act(() => Promise.resolve());

    act(() => {
      getES().emit('food_selection_fallback_pinged', {
        foodSelectionId: 'fs-1',
        menuName: 'Pizza Place',
        targetNickname: 'dana@example.com',
        actorNickname: 'alice@example.com',
        itemName: 'Pepperoni',
        itemNumber: '21',
      });
    });

    expect(notificationCtor).toHaveBeenCalledWith('Team Lunch is waiting for your order', {
      body:
        'alice@example.com is waiting for your Pizza Place choice. Your saved default meal is 21 Pepperoni.',
    });
  });

  it('handles order_placed event', async () => {
    const { result } = renderSSE();
    await act(() => Promise.resolve());

    act(() => {
      getES().emit('food_selection_started', { foodSelection: makeFS() });
    });

    const order = {
      id: 'order-1',
      selectionId: 'fs-1',
      nickname: 'Alice',
      itemId: 'item-1',
      itemName: 'Margherita',
      notes: null,
      orderedAt: '2026-01-01T13:05:00Z',
    };

    act(() => {
      getES().emit('order_placed', { order });
    });

    expect(result.current.activeFoodSelection?.orders).toHaveLength(1);
    expect(result.current.activeFoodSelection?.orders[0].nickname).toBe('Alice');
  });

  it('handles food_selection_overtime event', async () => {
    const { result } = renderSSE();
    await act(() => Promise.resolve());

    act(() => {
      getES().emit('food_selection_started', { foodSelection: makeFS() });
    });

    act(() => {
      getES().emit('food_selection_overtime', { foodSelectionId: 'fs-1' });
    });

    expect(result.current.activeFoodSelection?.status).toBe('overtime');
  });

  it('handles food_selection_completed event', async () => {
    const { result } = renderSSE();
    await act(() => Promise.resolve());

    act(() => {
      getES().emit('food_selection_started', { foodSelection: makeFS() });
    });

    const completedFS = makeFS({ status: 'completed' });
    act(() => {
      getES().emit('food_selection_completed', { foodSelection: completedFS });
    });

    expect(result.current.activeFoodSelection).toBeNull();
    expect(result.current.latestCompletedFoodSelection?.id).toBe('fs-1');
    expect(result.current.latestCompletedFoodSelection?.status).toBe('completed');
  });

  it('handles food_selection_aborted event', async () => {
    const { result } = renderSSE();
    await act(() => Promise.resolve());

    act(() => {
      getES().emit('food_selection_started', { foodSelection: makeFS() });
    });

    act(() => {
      getES().emit('food_selection_aborted', { foodSelectionId: 'fs-1' });
    });

    expect(result.current.activeFoodSelection).toBeNull();
  });

  it('handles food_selection_eta_updated event', async () => {
    const { result } = renderSSE();
    await act(() => Promise.resolve());

    const completedFS = makeFS({
      id: 'fs-1',
      status: 'completed',
      completedAt: '2026-01-01T13:20:00Z',
      etaMinutes: null,
      etaSetAt: null,
      deliveryDueAt: null,
    });

    act(() => {
      getES().emit('initial_state', {
        ...initialStatePayload,
        latestCompletedFoodSelection: completedFS,
        completedFoodSelectionsHistory: [completedFS],
      });
    });

    act(() => {
      getES().emit('food_selection_eta_updated', {
        foodSelectionId: 'fs-1',
        etaMinutes: 25,
        etaSetAt: '2026-01-01T13:21:00Z',
        deliveryDueAt: '2026-01-01T13:46:00Z',
      });
    });

    expect(result.current.latestCompletedFoodSelection?.etaMinutes).toBe(25);
    expect(result.current.completedFoodSelectionsHistory[0].etaMinutes).toBe(25);
  });

  it('closes EventSource on unmount', async () => {
    const { unmount } = renderSSE();
    await act(() => Promise.resolve());

    const es = getES();
    unmount();

    expect(es.readyState).toBe(2);
  });
});
