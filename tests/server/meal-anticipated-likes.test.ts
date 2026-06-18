import { describe, expect, it, beforeEach, afterAll, vi } from 'vitest';
import prisma from '../../src/server/db.js';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';
import { ensureDefaultOfficeLocation } from '../../src/server/services/officeLocation.js';
import * as menuService from '../../src/server/services/menu.js';
import { createAutoFinishedPoll } from '../../src/server/services/poll.js';
import { startFoodSelection } from '../../src/server/services/foodSelection.js';
import {
  generateRecommendations,
} from '../../src/server/services/mealRecommendation.js';
import {
  listMealRecommendationOnboardingCandidates,
  upsertMealAnticipatedLike,
} from '../../src/server/services/mealAnticipatedLikes.js';
import { normalizeMenuItemIdentityKey } from '../../src/server/services/mealItemIdentity.js';
import {
  buildMealRecommendationTrainingExamples,
  type MealRecommendationTrainingExample,
} from '../../src/server/services/mealRecommendationModel.js';

vi.mock('../../src/server/sse.js', () => ({
  broadcast: vi.fn(),
  formatPoll: vi.fn((poll) => poll),
  formatFoodSelection: vi.fn((selection) => selection),
}));

function actor(email = 'alice@example.com') {
  return {
    actorKey: email,
    actorEmail: email,
    displayNameSnapshot: 'Alice',
  };
}

async function createMenuWithItems(
  officeLocationId: string,
  name: string,
  items: Array<{ name: string; description?: string }>,
) {
  const menu = await menuService.createMenu(name, officeLocationId);
  const createdItems = [];
  for (const item of items) {
    createdItems.push(
      await menuService.createItem(
        menu.id,
        item.name,
        item.description ?? undefined,
        undefined,
        undefined,
        officeLocationId,
      ),
    );
  }
  return { menu, items: createdItems };
}

async function createActiveSelection(officeLocationId: string) {
  const { menu, items } = await createMenuWithItems(officeLocationId, 'Lunch Menu', [
    { name: 'Chicken Pad Thai', description: 'Noodles and peanuts' },
    { name: 'Beef Burger', description: 'Grilled burger' },
    { name: 'Greek Salad', description: 'Fresh salad bowl' },
  ]);
  const poll = await createAutoFinishedPoll(menu.id, menu.name, officeLocationId);
  const selection = await startFoodSelection(poll.id, 10, officeLocationId, undefined);
  return { menu, items, poll, selection };
}

describe('mealAnticipatedLikes', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectDatabase();
  });

  it('seeds flavor preferences from anticipated-like marks before any real orders exist', async () => {
    const office = await ensureDefaultOfficeLocation();
    const { selection, items } = await createActiveSelection(office.id);
    const user = actor();

    await upsertMealAnticipatedLike(selection.id, items[0].id, 'like', office.id, user);

    const recommendations = await generateRecommendations(selection.id, office.id, user);

    expect(recommendations.source).toBe('deterministic');
    expect(recommendations.items[0].itemName).toBe('Chicken Pad Thai');
    expect(recommendations.items[0].sourceSignals).toContain('taste_match');
  });

  it('skips anticipated-like marks when a real rating exists for the same dish identity', async () => {
    const office = await ensureDefaultOfficeLocation();
    const { menu, items } = await createMenuWithItems(office.id, 'Lunch Menu', [
      { name: 'Chicken Pad Thai', description: 'Noodles and peanuts' },
    ]);
    const user = actor();

    const markSelection = await createAutoFinishedPoll(menu.id, menu.name, office.id);
    const activeSelection = await startFoodSelection(markSelection.id, 10, office.id, user.actorKey);
    await upsertMealAnticipatedLike(activeSelection.id, items[0].id, 'like', office.id, user);

    const ratedSelection = await prisma.foodSelection.create({
      data: {
        officeLocationId: office.id,
        pollId: markSelection.id,
        menuId: menu.id,
        menuName: menu.name,
        status: 'completed',
        startedAt: new Date('2026-01-01T12:00:00.000Z'),
        endsAt: new Date('2026-01-01T12:10:00.000Z'),
        completedAt: new Date('2026-01-01T12:10:00.000Z'),
      },
    });

    await prisma.foodOrder.create({
      data: {
        selectionId: ratedSelection.id,
        nickname: 'Alice',
        actorKey: user.actorKey,
        actorEmail: user.actorEmail,
        displayNameSnapshot: user.displayNameSnapshot,
        itemId: items[0].id,
        itemName: items[0].name,
        orderedAt: new Date('2026-01-01T12:05:00.000Z'),
        rating: 5,
        ratedAt: new Date('2026-01-01T12:06:00.000Z'),
      },
    });

    const examples = await buildMealRecommendationTrainingExamples({ officeLocationId: office.id });
    const markIdentityKey = normalizeMenuItemIdentityKey(items[0].name);

    const markExamples = examples.filter(
      (example: MealRecommendationTrainingExample) =>
        example.source === 'mark' && example.itemIdentityKey === markIdentityKey,
    );
    const orderExamples = examples.filter(
      (example: MealRecommendationTrainingExample) => example.source === 'order',
    );

    expect(markExamples).toHaveLength(0);
    expect(orderExamples).toHaveLength(1);
    expect(orderExamples[0]?.label).toBe(1);
  });

  it('returns flavor-diverse onboarding candidates', async () => {
    const office = await ensureDefaultOfficeLocation();
    const menu = await menuService.createMenu('Lunch Menu', office.id);
    await menuService.createItem(menu.id, 'Chicken Pad Thai', 'Noodles and peanuts', undefined, undefined, office.id);
    await menuService.createItem(menu.id, 'Green Curry', 'Thai curry bowl', undefined, undefined, office.id);
    await menuService.createItem(menu.id, 'Massaman Curry', 'Thai curry bowl', undefined, undefined, office.id);
    await menuService.createItem(menu.id, 'Thai Basil Chicken', 'Thai stir fry', undefined, undefined, office.id);
    await menuService.createItem(menu.id, 'Beef Burger', 'Grilled burger', undefined, undefined, office.id);
    await menuService.createItem(menu.id, 'Greek Salad', 'Fresh salad bowl', undefined, undefined, office.id);
    await menuService.createItem(menu.id, 'Fish Sushi', 'Japanese rice roll', undefined, undefined, office.id);

    const candidates = await listMealRecommendationOnboardingCandidates(office.id, actor());

    expect(candidates.candidates).toHaveLength(6);
    const topThree = candidates.candidates.slice(0, 3);
    expect(topThree.some((candidate) => candidate.tags.includes('style:burger'))).toBe(true);
    expect(topThree.some((candidate) => candidate.tags.includes('style:japanese'))).toBe(true);
    expect(topThree.some((candidate) => candidate.tags.includes('style:thai'))).toBe(true);
    expect(new Set(topThree.flatMap((candidate) => candidate.tags)).size).toBeGreaterThan(3);
  });
});
