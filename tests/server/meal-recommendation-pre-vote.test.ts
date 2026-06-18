import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import prisma from '../../src/server/db.js';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';
import * as menuService from '../../src/server/services/menu.js';
import * as pollService from '../../src/server/services/poll.js';
import { ensureDefaultOfficeLocation, createOfficeLocation } from '../../src/server/services/officeLocation.js';
import { clearMealRecommendationModelCache } from '../../src/server/services/mealRecommendationModel.js';
import { generatePreVoteRecommendations } from '../../src/server/services/mealRecommendationPreVote.js';
import type { RecommendationActor } from '../../src/server/services/mealRecommendation.js';

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
    createdBy: poll.createdBy ?? null,
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
}));

const ACTOR: RecommendationActor = {
  actorKey: 'alice@example.com',
  actorEmail: 'alice@example.com',
  displayNameSnapshot: 'Alice',
};

describe('pre-vote recommendation service', () => {
  beforeEach(async () => {
    pollService.clearAllTimers();
    clearMealRecommendationModelCache();
    await cleanDatabase();
  });

  afterAll(async () => {
    pollService.clearAllTimers();
    clearMealRecommendationModelCache();
    await cleanDatabase();
    await disconnectDatabase();
  });

  async function createMenuWithItems(officeLocationId: string, name: string, itemNames: string[]) {
    const menu = await menuService.createMenu(name, officeLocationId);
    for (const itemName of itemNames) {
      await menuService.createItem(menu.id, itemName, `${itemName} description`, undefined, undefined, officeLocationId);
    }
    return menu;
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

  it('ranks eligible poll-menu items, excludes poll-blocked menus, and persists a pre-vote impression', async () => {
    const office = await ensureDefaultOfficeLocation();
    const pizzaMenu = await createMenuWithItems(office.id, 'Pizza Place', ['Margherita', 'Pepperoni']);
    const sushiMenu = await createMenuWithItems(office.id, 'Sushi Bar', ['California Roll']);
    const curryMenu = await createMenuWithItems(office.id, 'Curry House', ['Chicken Curry']);
    const poll = await pollService.startPoll(
      'Lunch poll',
      60,
      [{ menuId: sushiMenu.id, reason: 'Out of stock' }],
      office.id,
      ACTOR.actorKey,
    );

    await seedHistoricalOrder(office.id, poll.id, pizzaMenu.id, pizzaMenu.name, 'Margherita', { rating: 5 });
    await seedHistoricalOrder(office.id, poll.id, curryMenu.id, curryMenu.name, 'Chicken Curry', { rating: 4 });

    const result = await generatePreVoteRecommendations(office.id, ACTOR, { pollId: poll.id, limit: 5 });

    expect(result.source).toBe('pre_vote');
    expect(result.pollId).toBe(poll.id);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((item) => item.menuId !== sushiMenu.id)).toBe(true);
    expect(result.items.some((item) => item.menuName === pizzaMenu.name)).toBe(true);
    expect(result.warnings).toEqual([]);

    const impression = await prisma.mealRecommendationImpression.findFirst({
      where: { source: 'pre_vote', officeLocationId: office.id, pollId: poll.id, actorKey: ACTOR.actorKey },
    });

    expect(impression).not.toBeNull();
    expect(impression?.foodSelectionId).toBeNull();
    expect(impression?.pollId).toBe(poll.id);
    expect(impression?.source).toBe('pre_vote');
    expect(Array.isArray(impression?.itemsJson)).toBe(true);
  });

  it('keeps side dishes out of pre-vote recommendations', async () => {
    const office = await ensureDefaultOfficeLocation();
    const curryMenu = await createMenuWithItems(office.id, 'Curry House', [
      'Garlic Naan',
      'Mango Lassi',
      'Chicken Curry',
      'Paneer Tikka',
    ]);
    const poll = await pollService.startPoll('Lunch poll', 60, [], office.id, ACTOR.actorKey);

    await seedHistoricalOrder(office.id, poll.id, curryMenu.id, curryMenu.name, 'Garlic Naan', { rating: 5 });
    await seedHistoricalOrder(office.id, poll.id, curryMenu.id, curryMenu.name, 'Mango Lassi', { rating: 5 });
    await seedHistoricalOrder(office.id, poll.id, curryMenu.id, curryMenu.name, 'Chicken Curry', { rating: 4 });

    const result = await generatePreVoteRecommendations(office.id, ACTOR, { pollId: poll.id, limit: 5 });

    expect(result.items.map((item) => item.itemName)).not.toContain('Garlic Naan');
    expect(result.items.map((item) => item.itemName)).not.toContain('Mango Lassi');
    expect(result.items.map((item) => item.itemName)).toEqual(['Chicken Curry', 'Paneer Tikka']);
  });

  it('falls back to the current office menus when no poll is active and keeps office scope', async () => {
    const office = await ensureDefaultOfficeLocation();
    const otherOffice = await createOfficeLocation('Other Office');
    const pizzaMenu = await createMenuWithItems(office.id, 'Pizza Place', ['Margherita', 'Pepperoni']);
    await createMenuWithItems(otherOffice.id, 'Stealth Office', ['Secret Burger']);

    const result = await generatePreVoteRecommendations(office.id, ACTOR, { limit: 2 });

    expect(result.pollId).toBeUndefined();
    expect(result.items).toHaveLength(2);
    expect(result.items.every((item) => item.menuId === pizzaMenu.id)).toBe(true);
    expect(result.items.map((item) => item.menuName)).toEqual(['Pizza Place', 'Pizza Place']);
    expect(result.items.map((item) => item.itemName)).toEqual(['Margherita', 'Pepperoni']);
  });
});
