import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';
import * as menuService from '../../src/server/services/menu.js';
import * as pollService from '../../src/server/services/poll.js';
import * as foodSelectionService from '../../src/server/services/foodSelection.js';
import * as userPreferencesService from '../../src/server/services/userPreferences.js';
import * as userMenuDefaultsService from '../../src/server/services/userMenuDefaults.js';
import { ensureDefaultOfficeLocation } from '../../src/server/services/officeLocation.js';
import { generateRecommendations, type RecommendationActor } from '../../src/server/services/mealRecommendation.js';
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
      endedPrematurely: poll.endedPrematurely,
      winnerMenuId: poll.winnerMenuId,
      winnerMenuName: poll.winnerMenuName,
      winnerSelectedRandomly: poll.winnerSelectedRandomly,
      createdBy: poll.createdBy ?? null,
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
    orderPlacedBy: fs.orderPlacedBy ?? null,
    completedAt: fs.completedAt ? fs.completedAt.toISOString() : null,
    etaMinutes: fs.etaMinutes,
    etaSetAt: fs.etaSetAt ? fs.etaSetAt.toISOString() : null,
    deliveryDueAt: fs.deliveryDueAt ? fs.deliveryDueAt.toISOString() : null,
    createdBy: fs.createdBy ?? null,
    createdAt: fs.createdAt.toISOString(),
    orders: fs.orders.map((o: { id: string; selectionId: string; nickname: string; itemId: string | null; itemName: string; notes: string | null; orderedAt: Date }) => ({
      id: o.id,
      selectionId: o.selectionId,
      nickname: o.nickname,
      itemId: o.itemId,
      itemName: o.itemName,
      notes: o.notes,
      processed: false,
      processedAt: null,
      delivered: false,
      deliveredAt: null,
      orderedAt: o.orderedAt.toISOString(),
    })),
  })),
}));

const ACTOR: RecommendationActor = {
  actorKey: 'alice@example.com',
  actorEmail: 'alice@example.com',
  displayNameSnapshot: 'Alice',
};

describe('Meal recommendation service', () => {
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

  // ─── Helpers ─────────────────────────────────────────────

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
    opts: { actorKey?: string; rating?: number | null; orderedAt?: Date } = {},
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

    return prisma.foodOrder.create({
      data: {
        selectionId: pastSelection.id,
        nickname: 'Alice',
        actorKey: opts.actorKey ?? ACTOR.actorKey,
        itemName,
        orderedAt: opts.orderedAt ?? new Date(Date.now() - 86400000 * 7),
        rating: opts.rating ?? null,
        ratedAt: opts.rating != null ? new Date() : null,
      },
    });
  }

  // ─── Cold start ──────────────────────────────────────────

  it('falls back to office-popularity cold-start scoring when there is no order history', async () => {
    const { office, items, selection } = await setupActiveSelection(['Pad Thai', 'Green Curry']);

    const result = await generateRecommendations(selection.id, office.id, ACTOR);

    expect(result.source).toBe('deterministic');
    expect(result.warnings).toEqual([]);
    expect(result.items).toHaveLength(items.length);
    for (const item of result.items) {
      expect(item.score).toBe(50);
      expect(item.sourceSignals).toContain('office_popularity');
      expect(item.reason).toContain('no order history yet');
      expect(item.aiAssisted).toBe(false);
    }
    expect(result.items.map((i) => i.rank)).toEqual([1, 2]);
  });

  // ─── Personal rating ─────────────────────────────────────

  it('ranks an item the actor previously rated highly above unrated items', async () => {
    const { office, selection, menu, poll } = await setupActiveSelection(['Pad Thai', 'Green Curry']);
    await seedHistoricalOrder(office.id, poll.id, menu.id, menu.name, 'Pad Thai', { rating: 5 });

    const result = await generateRecommendations(selection.id, office.id, ACTOR);

    expect(result.items[0].itemName).toBe('Pad Thai');
    expect(result.items[0].rank).toBe(1);
    // 40 (personal_rating high) + 2 (office_popularity, this order counts toward it)
    expect(result.items[0].score).toBe(42);
    expect(result.items[0].sourceSignals).toContain('personal_rating');
    expect(result.items[0].reason).toContain('rated this highly');

    expect(result.items[1].itemName).toBe('Green Curry');
    expect(result.items[1].sourceSignals).not.toContain('office_popularity');
  });

  it('demotes an item the actor previously rated poorly', async () => {
    const { office, selection, menu, poll } = await setupActiveSelection(['Pad Thai', 'Green Curry']);
    await seedHistoricalOrder(office.id, poll.id, menu.id, menu.name, 'Pad Thai', { rating: 1 });

    const result = await generateRecommendations(selection.id, office.id, ACTOR);

    const padThai = result.items.find((i) => i.itemName === 'Pad Thai')!;
    expect(padThai.sourceSignals).toContain('personal_rating');
    expect(padThai.reason).toContain('rated this poorly');
    expect(padThai.score).toBe(0);
  });

  // ─── Default meal ────────────────────────────────────────

  it('boosts the actor saved default meal', async () => {
    const { office, selection, menu, items } = await setupActiveSelection(['Pad Thai', 'Green Curry']);
    const greenCurry = items.find((i) => i.name === 'Green Curry')!;
    await userMenuDefaultsService.upsertUserMenuDefaultPreference(
      ACTOR.actorKey,
      menu.id,
      greenCurry.id,
      null,
      false,
    );

    const result = await generateRecommendations(selection.id, office.id, ACTOR);

    expect(result.items[0].itemName).toBe('Green Curry');
    expect(result.items[0].score).toBe(30);
    expect(result.items[0].sourceSignals).toContain('default_meal');
    expect(result.items[0].reason).toContain('saved default meal');
  });

  // ─── Office popularity ───────────────────────────────────

  it('factors office-wide popularity from other actors orders', async () => {
    const { office, selection, menu, poll } = await setupActiveSelection(['Pad Thai', 'Green Curry']);
    await seedHistoricalOrder(office.id, poll.id, menu.id, menu.name, 'Pad Thai', { actorKey: 'bob@example.com' });
    await seedHistoricalOrder(office.id, poll.id, menu.id, menu.name, 'Pad Thai', { actorKey: 'carol@example.com' });

    const result = await generateRecommendations(selection.id, office.id, ACTOR);

    const padThai = result.items.find((i) => i.itemName === 'Pad Thai')!;
    expect(padThai.sourceSignals).toContain('office_popularity');
    expect(padThai.sourceSignals).not.toContain('personal_rating');
    expect(padThai.score).toBe(4);
    expect(padThai.reason).toContain('popular with your team');
    expect(padThai.rank).toBe(1);
  });

  // ─── Recency ──────────────────────────────────────────────

  it('boosts an item the actor has not ordered in a while', async () => {
    const { office, selection, menu, poll } = await setupActiveSelection(['Pad Thai', 'Green Curry']);
    await seedHistoricalOrder(office.id, poll.id, menu.id, menu.name, 'Pad Thai', {
      rating: null,
      orderedAt: new Date(Date.now() - 86400000 * 30),
    });

    const result = await generateRecommendations(selection.id, office.id, ACTOR);

    const padThai = result.items.find((i) => i.itemName === 'Pad Thai')!;
    expect(padThai.sourceSignals).toContain('recency');
    expect(padThai.sourceSignals).not.toContain('personal_rating');
    expect(padThai.reason).toContain('been a while');
    // 5 (recency) + 2 (office_popularity, this order counts toward it)
    expect(padThai.score).toBe(7);
  });

  // ─── Preference warnings ─────────────────────────────────

  it('demotes and warns about items matching an allergy', async () => {
    const { office, selection, menu, poll } = await setupActiveSelection(['Peanut Noodles', 'Green Curry']);
    await seedHistoricalOrder(office.id, poll.id, menu.id, menu.name, 'Peanut Noodles', { rating: 5 });
    await userPreferencesService.upsertUserPreferences(ACTOR.actorKey, ['peanut'], []);

    const result = await generateRecommendations(selection.id, office.id, ACTOR);

    const peanutNoodles = result.items.find((i) => i.itemName === 'Peanut Noodles')!;
    expect(peanutNoodles.sourceSignals).toContain('preference_warning');
    expect(peanutNoodles.reason).toContain('allergy');
    // 40 (personal_rating high) * 0.2 allergy demotion factor = 8
    expect(peanutNoodles.score).toBe(8);
  });

  // ─── Impression persistence ──────────────────────────────

  it('persists a recommendation impression scoped to the actor and office', async () => {
    const { office, selection } = await setupActiveSelection(['Pad Thai', 'Green Curry']);

    const result = await generateRecommendations(selection.id, office.id, ACTOR);

    const impression = await prisma.mealRecommendationImpression.findUnique({
      where: { id: result.impressionId },
    });
    expect(impression).not.toBeNull();
    expect(impression?.foodSelectionId).toBe(selection.id);
    expect(impression?.officeLocationId).toBe(office.id);
    expect(impression?.actorKey).toBe(ACTOR.actorKey);
    expect(impression?.source).toBe('deterministic');
    expect(Array.isArray(impression?.itemsJson)).toBe(true);
    expect((impression?.itemsJson as unknown[]).length).toBe(2);
  });

  // ─── Outcome learning ────────────────────────────────────

  it('demotes a previously recommended item the actor ordered and later rated poorly', async () => {
    const { office, selection, menu, poll } = await setupActiveSelection(['Pad Thai', 'Green Curry']);

    const firstResult = await generateRecommendations(selection.id, office.id, ACTOR);
    const recommendedItem = firstResult.items[0];

    const firstImpression = await prisma.mealRecommendationImpression.findUnique({
      where: { id: firstResult.impressionId },
    });
    expect((firstImpression?.itemsJson as { itemName: string }[])[0].itemName).toBe(recommendedItem.itemName);

    await seedHistoricalOrder(office.id, poll.id, menu.id, menu.name, recommendedItem.itemName, { rating: 1 });

    const secondResult = await generateRecommendations(selection.id, office.id, ACTOR);

    const orderedItem = secondResult.items.find((i) => i.itemName === recommendedItem.itemName)!;
    expect(orderedItem.sourceSignals).toContain('personal_rating');
    expect(orderedItem.reason).toContain('rated this poorly');
    expect(orderedItem.score).toBe(0);
  });

  it('boosts a previously recommended item the actor ordered and later rated highly', async () => {
    const { office, selection, menu, poll } = await setupActiveSelection(['Pad Thai', 'Green Curry']);

    const firstResult = await generateRecommendations(selection.id, office.id, ACTOR);
    const recommendedItem = firstResult.items[0];

    await seedHistoricalOrder(office.id, poll.id, menu.id, menu.name, recommendedItem.itemName, { rating: 5 });

    const secondResult = await generateRecommendations(selection.id, office.id, ACTOR);

    const orderedItem = secondResult.items.find((i) => i.itemName === recommendedItem.itemName)!;
    expect(orderedItem.rank).toBe(1);
    expect(orderedItem.sourceSignals).toContain('personal_rating');
    expect(orderedItem.reason).toContain('rated this highly');
  });

  // ─── Taste profile (content-based) ───────────────────────

  it('boosts a never-ordered item that matches flavors the actor rated highly', async () => {
    const { office, selection, menu, poll } = await setupActiveSelection(['Thai Chicken Satay', 'Plain Bread Roll']);
    // Actor has never ordered either current item, but consistently rates
    // Thai/chicken dishes highly in history.
    await seedHistoricalOrder(office.id, poll.id, menu.id, menu.name, 'Chicken Pad Thai', { rating: 5 });
    await seedHistoricalOrder(office.id, poll.id, menu.id, menu.name, 'Thai Green Curry', { rating: 5 });

    const result = await generateRecommendations(selection.id, office.id, ACTOR);

    const satay = result.items.find((i) => i.itemName === 'Thai Chicken Satay')!;
    expect(satay.rank).toBe(1);
    expect(satay.sourceSignals).toContain('taste_match');
    expect(satay.sourceSignals).not.toContain('personal_rating');
    expect(satay.score).toBeGreaterThan(0);
    expect(satay.reason).toContain('flavors you tend to like');

    const bread = result.items.find((i) => i.itemName === 'Plain Bread Roll')!;
    expect(bread.sourceSignals).not.toContain('taste_match');
  });

  it('demotes a never-ordered item whose flavors the actor rated poorly', async () => {
    const { office, selection, menu, poll } = await setupActiveSelection(['Grilled Fish', 'Chicken Rice']);
    await seedHistoricalOrder(office.id, poll.id, menu.id, menu.name, 'Fish and Chips', { rating: 1 });
    await seedHistoricalOrder(office.id, poll.id, menu.id, menu.name, 'Baked Salmon', { rating: 1 });

    const result = await generateRecommendations(selection.id, office.id, ACTOR);

    const fish = result.items.find((i) => i.itemName === 'Grilled Fish')!;
    expect(fish.sourceSignals).toContain('taste_match');
    expect(fish.score).toBe(0);
    expect(fish.rank).toBe(2);
  });

  it('boosts a never-ordered item from unrated implicit order history alone', async () => {
    const { office, selection, menu, poll } = await setupActiveSelection(['Thai Chicken Satay', 'Plain Bread Roll']);
    // Four unrated Thai orders - no stars given, but ordering is implicit signal.
    for (const name of ['Chicken Pad Thai', 'Thai Green Curry', 'Tom Yum Soup', 'Thai Fried Rice']) {
      await seedHistoricalOrder(office.id, poll.id, menu.id, menu.name, name, { rating: null });
    }

    const result = await generateRecommendations(selection.id, office.id, ACTOR);

    const satay = result.items.find((i) => i.itemName === 'Thai Chicken Satay')!;
    expect(satay.rank).toBe(1);
    expect(satay.sourceSignals).toContain('taste_match');
    expect(satay.score).toBeGreaterThan(0);
  });

  it('does not activate the taste profile from a single order with no ratings', async () => {
    const { office, selection, menu, poll } = await setupActiveSelection(['Thai Chicken Satay', 'Plain Bread Roll']);
    await seedHistoricalOrder(office.id, poll.id, menu.id, menu.name, 'Chicken Pad Thai', { rating: null });

    const result = await generateRecommendations(selection.id, office.id, ACTOR);

    const satay = result.items.find((i) => i.itemName === 'Thai Chicken Satay')!;
    expect(satay.sourceSignals).not.toContain('taste_match');
  });

  // ─── Validation ──────────────────────────────────────────

  it('rejects recommendations for an unknown food selection', async () => {
    const office = await ensureDefaultOfficeLocation();
    await expect(
      generateRecommendations('00000000-0000-0000-0000-000000000000', office.id, ACTOR),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects recommendations for a non-active food selection', async () => {
    const { office, selection } = await setupActiveSelection(['Pad Thai', 'Green Curry']);
    await prisma.foodSelection.update({
      where: { id: selection.id },
      data: { status: 'completed' },
    });

    await expect(generateRecommendations(selection.id, office.id, ACTOR)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  // ─── Performance ──────────────────────────────────────────

  it('returns deterministic recommendations quickly even with substantial seeded office history', async () => {
    const { office, selection, menu, poll, items } = await setupActiveSelection(['Pad Thai', 'Green Curry']);

    const actors = ['alice@example.com', 'bob@example.com', 'carol@example.com', 'dave@example.com'];
    for (let i = 0; i < 60; i++) {
      const item = items[i % items.length];
      const actorKey = actors[i % actors.length];
      await seedHistoricalOrder(office.id, poll.id, menu.id, menu.name, item.name, {
        actorKey,
        rating: (i % 5) + 1,
        orderedAt: new Date(Date.now() - 86400000 * (i % 30)),
      });
    }

    const start = Date.now();
    const result = await generateRecommendations(selection.id, office.id, ACTOR);
    const durationMs = Date.now() - start;

    expect(result.items).toHaveLength(2);
    expect(durationMs).toBeLessThan(1000);
  });
});
