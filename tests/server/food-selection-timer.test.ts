import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';
import * as foodSelectionService from '../../src/server/services/foodSelection.js';
import * as pollService from '../../src/server/services/poll.js';
import * as menuService from '../../src/server/services/menu.js';
import prisma from '../../src/server/db.js';

// Suppress SSE broadcasts during tests
vi.mock('../../src/server/sse.js', () => ({
  broadcast: vi.fn(),
  formatPoll: vi.fn((poll) => {
    const voteCounts: Record<string, number> = {};
    for (const vote of poll.votes) {
      voteCounts[vote.menuId] = (voteCounts[vote.menuId] || 0) + 1;
    }
    return {
      id: poll.id,
      description: poll.description,
      status: poll.status,
      startedAt: poll.startedAt.toISOString(),
      endsAt: poll.endsAt.toISOString(),
      winnerMenuId: poll.winnerMenuId,
      winnerMenuName: poll.winnerMenuName,
      winnerSelectedRandomly: poll.winnerSelectedRandomly,
      createdAt: poll.createdAt.toISOString(),
      excludedMenuJustifications: (poll.excludedMenus ?? []).map((entry: { menuId: string; menuName: string; reason: string }) => ({ menuId: entry.menuId, menuName: entry.menuName, reason: entry.reason })),
      votes: poll.votes.map((v: { id: string; pollId: string; menuId: string; menuName: string; nickname: string; castAt: Date }) => ({
        id: v.id,
        pollId: v.pollId,
        menuId: v.menuId,
        menuName: v.menuName,
        nickname: v.nickname,
        castAt: v.castAt.toISOString(),
      })),
      voteCounts,
    };
  }),
  formatFoodSelection: vi.fn((fs) => ({
    id: fs.id,
    pollId: fs.pollId,
    menuId: fs.menuId,
    menuName: fs.menuName,
    status: fs.status,
    startedAt: fs.startedAt.toISOString(),
    endsAt: fs.endsAt.toISOString(),
    orderPlacedAt: fs.orderPlacedAt ? fs.orderPlacedAt.toISOString() : null,
    completedAt: fs.completedAt ? fs.completedAt.toISOString() : null,
    etaMinutes: fs.etaMinutes,
    etaSetAt: fs.etaSetAt ? fs.etaSetAt.toISOString() : null,
    deliveryDueAt: fs.deliveryDueAt ? fs.deliveryDueAt.toISOString() : null,
    createdAt: fs.createdAt.toISOString(),
    orders: fs.orders.map((o: { id: string; selectionId: string; nickname: string; itemId: string | null; itemName: string; notes: string | null; orderedAt: Date }) => ({
      id: o.id,
      selectionId: o.selectionId,
      nickname: o.nickname,
      itemId: o.itemId,
      itemName: o.itemName,
      notes: o.notes,
      orderedAt: o.orderedAt.toISOString(),
    })),
  })),
}));

describe('Food selection timer', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    foodSelectionService.clearAllTimers();
    pollService.clearAllTimers();
    await cleanDatabase();
  });

  afterAll(async () => {
    vi.useRealTimers();
    foodSelectionService.clearAllTimers();
    pollService.clearAllTimers();
    await cleanDatabase();
    await disconnectDatabase();
  });

  async function createFinishedPollWithWinner() {
    const menu = await menuService.createMenu('Thai Food');
    await menuService.createItem(menu.id, 'Pad Thai', 'Noodles');
    const poll = await pollService.startPoll('Lunch poll', 60);
    await pollService.castVote(poll.id, menu.id, 'Alice');
    const finished = await pollService.endPoll(poll.id);
    return { menu, poll: finished };
  }

  it('schedules a timer on food selection start', async () => {
    vi.useRealTimers();
    const { poll } = await createFinishedPollWithWinner();
    const selection = await foodSelectionService.startFoodSelection(poll.id, 10);

    const timers = foodSelectionService.getActiveTimers();
    expect(timers.has(selection.id)).toBe(true);
    foodSelectionService.clearTimer(selection.id);
  });

  it('timer triggers expiry after configured duration', async () => {
    vi.useFakeTimers();
    const { poll } = await createFinishedPollWithWinner();
    const selection = await foodSelectionService.startFoodSelection(poll.id, 10);

    // Advance time past the 10-minute mark
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 100);
    vi.useRealTimers();

    await expect
      .poll(
        async () => {
          const updated = await prisma.foodSelection.findUnique({
            where: { id: selection.id },
          });
          return updated?.status ?? null;
        },
        { timeout: 3000, interval: 100 },
      )
      .toBe('overtime');
  });

  it('reschedules timer on extension', async () => {
    vi.useRealTimers();
    const { poll } = await createFinishedPollWithWinner();
    const selection = await foodSelectionService.startFoodSelection(poll.id, 10);

    // Expire the selection manually
    await foodSelectionService.expireFoodSelection(selection.id);

    // After expiry, timer should be cleared
    const timers = foodSelectionService.getActiveTimers();
    expect(timers.has(selection.id)).toBe(false);

    // Extend — timer should be rescheduled
    await foodSelectionService.extendFoodSelection(selection.id, 5);
    expect(timers.has(selection.id)).toBe(true);

    // Clean up
    foodSelectionService.clearTimer(selection.id);
  });

  it('clears timer on completion', async () => {
    vi.useRealTimers();
    const { poll } = await createFinishedPollWithWinner();
    const selection = await foodSelectionService.startFoodSelection(poll.id, 10);

    await foodSelectionService.expireFoodSelection(selection.id);
    await foodSelectionService.completeFoodSelection(selection.id);

    const timers = foodSelectionService.getActiveTimers();
    expect(timers.has(selection.id)).toBe(false);
  });

  it('clearAllTimers utility clears all timers', async () => {
    vi.useRealTimers();
    const { poll } = await createFinishedPollWithWinner();
    await foodSelectionService.startFoodSelection(poll.id, 10);

    expect(foodSelectionService.getActiveTimers().size).toBeGreaterThan(0);
    foodSelectionService.clearAllTimers();
    expect(foodSelectionService.getActiveTimers().size).toBe(0);
  });
});



