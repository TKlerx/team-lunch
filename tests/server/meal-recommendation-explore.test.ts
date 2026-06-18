import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import prisma from '../../src/server/db.js';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';
import * as menuService from '../../src/server/services/menu.js';
import * as pollService from '../../src/server/services/poll.js';
import * as foodSelectionService from '../../src/server/services/foodSelection.js';
import { ensureDefaultOfficeLocation } from '../../src/server/services/officeLocation.js';
import { generateRecommendations, type RecommendationActor } from '../../src/server/services/mealRecommendation.js';
import { generateExploreRecommendations } from '../../src/server/services/mealRecommendationExplore.js';

vi.mock('../../src/server/sse.js', () => ({
  broadcast: vi.fn(),
  formatPoll: vi.fn((poll) => ({
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
    excludedMenuJustifications: (poll.excludedMenus ?? []).map((entry: { menuId: string; menuName: string; reason: string }) => ({
      menuId: entry.menuId,
      menuName: entry.menuName,
      reason: entry.reason,
    })),
    votes: poll.votes.map((vote: { id: string; pollId: string; menuId: string; menuName: string; nickname: string; castAt: Date }) => ({
      id: vote.id,
      pollId: vote.pollId,
      menuId: vote.menuId,
      menuName: vote.menuName,
      nickname: vote.nickname,
      castAt: vote.castAt.toISOString(),
    })),
    voteCounts: {},
  })),
  formatFoodSelection: vi.fn((fs) => ({
    id: fs.id,
    pollId: fs.pollId,
    menuId: fs.menuId,
    menuName: fs.menuName,
    status: fs.status,
    startedAt: fs.startedAt.toISOString(),
    endsAt: fs.endsAt.toISOString(),
    orderPlacedAt: fs.orderPlacedAt ? fs.orderPlacedAt.toISOString() : null,
    orderPlacedBy: fs.orderPlacedBy ?? null,
    completedAt: fs.completedAt ? fs.completedAt.toISOString() : null,
    etaMinutes: fs.etaMinutes,
    etaSetAt: fs.etaSetAt ? fs.etaSetAt.toISOString() : null,
    deliveryDueAt: fs.deliveryDueAt ? fs.deliveryDueAt.toISOString() : null,
    createdBy: fs.createdBy ?? null,
    createdAt: fs.createdAt.toISOString(),
    orders: fs.orders.map((order: { id: string; selectionId: string; nickname: string; itemId: string | null; itemName: string; notes: string | null; orderedAt: Date }) => ({
      id: order.id,
      selectionId: order.selectionId,
      nickname: order.nickname,
      itemId: order.itemId,
      itemName: order.itemName,
      notes: order.notes,
      processed: false,
      processedAt: null,
      delivered: false,
      deliveredAt: null,
      orderedAt: order.orderedAt.toISOString(),
    })),
  })),
}));

const ACTOR: RecommendationActor = {
  actorKey: 'alice@example.com',
  actorEmail: 'alice@example.com',
  displayNameSnapshot: 'Alice',
};

describe('Meal recommendation explore service', () => {
  beforeEach(async () => {
    foodSelectionService.clearAllTimers();
    pollService.clearAllTimers();
    await cleanDatabase();
  });

  afterAll(async () => {
    foodSelectionService.clearAllTimers();
    pollService.clearAllTimers();
    await cleanDatabase();
    await disconnectDatabase();
  });

  async function setupActiveSelection(itemNames: string[]) {
    const office = await ensureDefaultOfficeLocation();
    const menu = await menuService.createMenu('Lunch Menu');
    const items = [];
    for (const name of itemNames) {
      items.push(await menuService.createItem(menu.id, name, `${name} description`));
    }

    const poll = await pollService.startPoll('Lunch poll', 60);
    await pollService.castVote(poll.id, menu.id, ACTOR.actorEmail!);
    const finished = await pollService.endPoll(poll.id);
    const selection = await foodSelectionService.startFoodSelection(finished.id, 10);

    return { office, menu, items, selection, poll: finished };
  }

  async function seedHistoricalOrder(
    officeLocationId: string,
    pollId: string,
    menuId: string,
    menuName: string,
    itemName: string,
    opts: { actorKey?: string; rating?: number | null } = {},
  ) {
    const pastSelection = await prisma.foodSelection.create({
      data: {
        officeLocationId,
        pollId,
        menuId,
        menuName,
        status: 'completed',
        startedAt: new Date(Date.now() - 86400000 * 7),
        endsAt: new Date(Date.now() - 86400000 * 7 + 600000),
        completedAt: new Date(Date.now() - 86400000 * 7 + 600000),
      },
    });

    await prisma.foodOrder.create({
      data: {
        selectionId: pastSelection.id,
        nickname: 'Alice',
        actorKey: opts.actorKey ?? ACTOR.actorKey,
        itemName,
        orderedAt: new Date(Date.now() - 86400000 * 7),
        rating: opts.rating ?? null,
        ratedAt: opts.rating != null ? new Date() : null,
      },
    });
  }

  it('is deterministic for a given seed when no history exists', async () => {
    const { office, selection } = await setupActiveSelection(['Thai Chicken Curry', 'Fish and Chips', 'Beef Burger']);

    const first = await generateExploreRecommendations(selection.id, office.id, ACTOR, 'seed-1');
    const second = await generateExploreRecommendations(selection.id, office.id, ACTOR, 'seed-1');

    expect(first.source).toBe('explore');
    expect(first.warnings).toContain('There is no history yet, so this is a diverse fallback order.');
    expect(first.items.map((item) => item.itemName)).toEqual(second.items.map((item) => item.itemName));
    expect(first.items.map((item) => item.rank)).toEqual([1, 2, 3]);
  });

  it('surfaces a different top item than the safe ranking for an established profile', async () => {
    const { office, selection, menu, poll } = await setupActiveSelection([
      'Thai Chicken Curry',
      'Fish and Chips',
      'Beef Burger',
      'Garden Salad',
    ]);
    await seedHistoricalOrder(office.id, poll.id, menu.id, menu.name, 'Chicken Pad Thai', { rating: 5 });
    await seedHistoricalOrder(office.id, poll.id, menu.id, menu.name, 'Thai Green Curry', { rating: 5 });

    const safeResult = await generateRecommendations(selection.id, office.id, ACTOR);
    const exploreResult = await generateExploreRecommendations(selection.id, office.id, ACTOR, 'seed-2');

    expect(safeResult.items[0].itemName).toBe('Thai Chicken Curry');
    expect(exploreResult.source).toBe('explore');
    expect(exploreResult.items[0].itemName).not.toBe(safeResult.items[0].itemName);
    expect(exploreResult.items[0].reason).toMatch(/exploratory/i);
  });

  it('persists an explore impression scoped to the actor and office', async () => {
    const { office, selection, menu, poll } = await setupActiveSelection([
      'Thai Chicken Curry',
      'Fish and Chips',
      'Beef Burger',
    ]);
    await seedHistoricalOrder(office.id, poll.id, menu.id, menu.name, 'Chicken Pad Thai', { rating: 5 });
    await seedHistoricalOrder(office.id, poll.id, menu.id, menu.name, 'Thai Green Curry', { rating: 5 });

    const result = await generateExploreRecommendations(selection.id, office.id, ACTOR, 'seed-3');

    const impression = await prisma.mealRecommendationImpression.findUnique({
      where: { id: result.impressionId },
    });

    expect(impression).not.toBeNull();
    expect(impression?.foodSelectionId).toBe(selection.id);
    expect(impression?.officeLocationId).toBe(office.id);
    expect(impression?.actorKey).toBe(ACTOR.actorKey);
    expect(impression?.source).toBe('explore');
    expect(Array.isArray(impression?.itemsJson)).toBe(true);
  });

  it('uses the actor exploration rate in the persisted explore decision summary', async () => {
    const { office, selection, menu, poll } = await setupActiveSelection([
      'Thai Chicken Curry',
      'Fish and Chips',
      'Beef Burger',
    ]);
    await seedHistoricalOrder(office.id, poll.id, menu.id, menu.name, 'Chicken Pad Thai', { rating: 5 });
    await prisma.userPreference.create({
      data: {
        userKey: ACTOR.actorKey,
        allergiesJson: [],
        dislikesJson: [],
        explorationRate: 0.9,
      },
    });

    const result = await generateExploreRecommendations(selection.id, office.id, ACTOR, 'seed-rate');

    const impression = await prisma.mealRecommendationImpression.findUnique({
      where: { id: result.impressionId },
    });
    expect(impression?.inputSummaryJson).toMatchObject({
      explorationRate: 0.9,
    });
  });
});
