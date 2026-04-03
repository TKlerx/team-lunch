import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';
import * as foodSelectionService from '../../src/server/services/foodSelection.js';
import * as pollService from '../../src/server/services/poll.js';
import * as menuService from '../../src/server/services/menu.js';
import prisma from '../../src/server/db.js';
import { broadcast } from '../../src/server/sse.js';
import * as userMenuDefaultsService from '../../src/server/services/userMenuDefaults.js';

vi.mock('../../src/server/services/notificationEmail.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
  isLikelyEmail: vi.fn((value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)),
}));

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
      endedPrematurely: poll.endedPrematurely,
      winnerMenuId: poll.winnerMenuId,
      winnerMenuName: poll.winnerMenuName,
      winnerSelectedRandomly: poll.winnerSelectedRandomly,
      createdAt: poll.createdAt.toISOString(),
      excludedMenuJustifications: [],
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
  formatFoodSelection: vi.fn((selection) => ({
    id: selection.id,
    pollId: selection.pollId,
    menuId: selection.menuId,
    menuName: selection.menuName,
    status: selection.status,
    startedAt: selection.startedAt.toISOString(),
    endsAt: selection.endsAt.toISOString(),
    orderPlacedAt: selection.orderPlacedAt ? selection.orderPlacedAt.toISOString() : null,
    completedAt: selection.completedAt ? selection.completedAt.toISOString() : null,
    etaMinutes: selection.etaMinutes,
    etaSetAt: selection.etaSetAt ? selection.etaSetAt.toISOString() : null,
    deliveryDueAt: selection.deliveryDueAt ? selection.deliveryDueAt.toISOString() : null,
    createdAt: selection.createdAt.toISOString(),
    orders: selection.orders.map((order: { id: string; selectionId: string; nickname: string; itemId: string | null; itemName: string; notes: string | null; orderedAt: Date }) => ({
      id: order.id,
      selectionId: order.selectionId,
      nickname: order.nickname,
      itemId: order.itemId,
      itemName: order.itemName,
      notes: order.notes,
      orderedAt: order.orderedAt.toISOString(),
    })),
  })),
}));

import { sendEmail } from '../../src/server/services/notificationEmail.js';

describe('food selection reminder emails', () => {
  beforeEach(async () => {
    vi.useRealTimers();
    vi.clearAllMocks();
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

  it('reminds voters without meal selection shortly before closing', async () => {
    const menu = await menuService.createMenu('Thai Food');
    await menuService.createItem(menu.id, 'Pad Thai', 'Noodles');
    const item = await prisma.menuItem.findFirstOrThrow({ where: { menuId: menu.id } });

    const poll = await pollService.startPoll('Lunch poll', 60);
    await pollService.castVote(poll.id, menu.id, 'alice@example.com');
    await pollService.castVote(poll.id, menu.id, 'bob@example.com');
    const finishedPoll = await pollService.endPoll(poll.id);

    const selection = await foodSelectionService.startFoodSelection(finishedPoll.id, 10);
    await foodSelectionService.placeOrder(selection.id, 'alice@example.com', item.id, 'No peanuts');

    const remindedCount = await foodSelectionService.sendMissingOrderReminderNow(selection.id);

    expect(remindedCount).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'bob@example.com',
      }),
    );
  });

  it('pings one fallback-eligible missing voter with email and SSE notification', async () => {
    const menu = await menuService.createMenu('Pizza Place');
    const item = await menuService.createItem(menu.id, 'Pepperoni', 'Spicy');

    const poll = await pollService.startPoll('Lunch poll', 60);
    await pollService.castVote(poll.id, menu.id, 'dana@example.com');
    const finishedPoll = await pollService.endPoll(poll.id);

    const selection = await foodSelectionService.startFoodSelection(finishedPoll.id, 10);
    await foodSelectionService.expireFoodSelection(selection.id);
    await foodSelectionService.completeFoodSelection(selection.id);
    await userMenuDefaultsService.upsertUserMenuDefaultPreference(
      'dana@example.com',
      menu.id,
      item.id,
      null,
      true,
    );

    const result = await foodSelectionService.sendFallbackCandidateReminder(
      selection.id,
      'dana@example.com',
      'alice@example.com',
    );

    expect(result).toEqual({ targetNickname: 'dana@example.com' });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'dana@example.com',
        subject: '[Team Lunch] Team lunch is waiting for your order',
      }),
    );
    expect(broadcast).toHaveBeenCalledWith(
      'food_selection_fallback_pinged',
      expect.objectContaining({
        foodSelectionId: selection.id,
        targetNickname: 'dana@example.com',
        actorNickname: 'alice@example.com',
        itemName: 'Pepperoni',
      }),
      expect.any(String),
    );
  });
});
