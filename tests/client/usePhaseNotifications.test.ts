import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FoodSelection } from '../../src/lib/types.js';
import { sendPhaseNotification } from '../../src/client/hooks/usePhaseNotifications.js';

function makeSelection(overrides: Partial<FoodSelection> = {}): FoodSelection {
  return {
    id: 'fs-1',
    pollId: 'poll-1',
    menuId: 'menu-1',
    menuName: 'Pizza Place',
    status: 'delivering',
    startedAt: '2026-03-11T10:00:00.000Z',
    endsAt: '2026-03-11T10:15:00.000Z',
    orderPlacedAt: '2026-03-11T10:16:00.000Z',
    orderPlacedBy: 'Alice',
    completedAt: null,
    etaMinutes: 25,
    etaSetAt: '2026-03-11T10:16:00.000Z',
    deliveryDueAt: '2026-03-11T10:41:00.000Z',
    createdAt: '2026-03-11T10:00:00.000Z',
    orders: [],
    ...overrides,
  };
}

describe('sendPhaseNotification', () => {
  const requestPermission = vi.fn();
  const notificationCtor = vi.fn();

  beforeEach(() => {
    requestPermission.mockReset();
    notificationCtor.mockReset();
    class MockNotification {
      static permission: NotificationPermission = 'granted';
      static requestPermission = requestPermission;

      constructor(title: string, options?: NotificationOptions) {
        notificationCtor(title, options);
      }
    }

    vi.stubGlobal('Notification', MockNotification);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('notifies other users when someone claims the ordering responsibility', async () => {
    await sendPhaseNotification({
      phase: 'FOOD_ORDERING',
      activePoll: null,
      activeFoodSelection: makeSelection({
        status: 'ordering',
        orderPlacedAt: null,
        etaMinutes: null,
        etaSetAt: null,
        deliveryDueAt: null,
      }),
      nickname: 'Bob',
    });

    expect(notificationCtor).toHaveBeenCalledWith('Team Lunch ordering started', {
      body: 'Alice started placing the Pizza Place order.',
    });
  });

  it('notifies other users when the order is placed with ETA', async () => {
    await sendPhaseNotification({
      phase: 'FOOD_DELIVERY_ACTIVE',
      activePoll: null,
      activeFoodSelection: makeSelection(),
      nickname: 'Bob',
    });

    expect(notificationCtor).toHaveBeenCalledWith('Team Lunch order placed', {
      body: 'Alice placed the Pizza Place order. ETA: 25 minute(s).',
    });
  });

  it('does not notify the same user who just claimed the order placement', async () => {
    await sendPhaseNotification({
      phase: 'FOOD_ORDERING',
      activePoll: null,
      activeFoodSelection: makeSelection({
        status: 'ordering',
        orderPlacedAt: null,
        etaMinutes: null,
        etaSetAt: null,
        deliveryDueAt: null,
      }),
      nickname: 'Alice',
    });
 
    expect(notificationCtor).not.toHaveBeenCalled();
  });

  it('does not notify the same user when they later place the order', async () => {
    await sendPhaseNotification({
      phase: 'FOOD_DELIVERY_ACTIVE',
      activePoll: null,
      activeFoodSelection: makeSelection(),
      nickname: 'Alice',
    });

    expect(notificationCtor).not.toHaveBeenCalled();
  });
});
