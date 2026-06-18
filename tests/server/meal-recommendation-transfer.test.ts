import { describe, expect, it, beforeEach, afterAll, vi } from 'vitest';
import prisma from '../../src/server/db.js';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';
import { ensureDefaultOfficeLocation } from '../../src/server/services/officeLocation.js';
import * as menuService from '../../src/server/services/menu.js';
import * as pollService from '../../src/server/services/poll.js';
import * as foodSelectionService from '../../src/server/services/foodSelection.js';
import {
  generateRecommendations,
  type RecommendationActor,
} from '../../src/server/services/mealRecommendation.js';
import { normalizeMenuItemIdentityKey } from '../../src/server/services/mealItemIdentity.js';
import {
  saveMealRecommendationModel,
  trainMealRecommendationModel,
} from '../../src/server/services/mealRecommendationModel.js';

vi.mock('../../src/server/sse.js', () => ({
  broadcast: vi.fn(),
  formatPoll: vi.fn((poll) => poll),
  formatFoodSelection: vi.fn((selection) => selection),
}));

const ACTOR: RecommendationActor = {
  actorKey: 'alice@example.com',
  actorEmail: 'alice@example.com',
  displayNameSnapshot: 'Alice',
};

const ITEM_FEATURES: Record<string, string[]> = {
  'Chicken Korma': ['ingredient:chicken', 'style:thai', 'style:curry'],
  'Beef Burger': ['ingredient:beef', 'style:burger'],
  'Fish and Chips': ['ingredient:fish', 'style:fried'],
};

type OfficeTrainingProfile = {
  officeLocationId: string;
  preferredItemName: keyof typeof ITEM_FEATURES;
};

async function persistLearnedOfficeModel(trainingProfiles: OfficeTrainingProfile[]) {
  const trainingExamples = trainingProfiles.flatMap(({ officeLocationId, preferredItemName }) => {
    const preferredFeatures = ITEM_FEATURES[preferredItemName];
    return [
      {
        features: [`user:${ACTOR.actorKey}`, `office:${officeLocationId}`, ...preferredFeatures],
        label: 1 as const,
        weight: 2,
      },
      ...Object.entries(ITEM_FEATURES)
        .filter(([itemName]) => itemName !== preferredItemName)
        .map(([, features]) => ({
          features: [`user:${ACTOR.actorKey}`, `office:${officeLocationId}`, ...features],
          label: 0 as const,
          weight: 2,
        })),
    ];
  });

  const trained = trainMealRecommendationModel(trainingExamples, { seed: 99, factorDim: 4, epochs: 30 });

  const saved = await saveMealRecommendationModel(trained, 3);
  for (const { officeLocationId } of trainingProfiles) {
    await prisma.officeRecommenderSetting.upsert({
      where: { officeLocationId },
      update: {
        safeMode: 'learned',
        activeModelId: saved.id,
        exploreEnabled: true,
      },
      create: {
        officeLocationId,
        safeMode: 'learned',
        activeModelId: saved.id,
        exploreEnabled: true,
      },
    });
  }

  return saved;
}

async function createActiveSelection(
  officeLocationId: string,
  itemNames: string[],
  menuName = 'Lunch Menu',
) {
  const menu = await menuService.createMenu(menuName, officeLocationId);
  const items: Array<{ id: string; name: string }> = [];
  for (const name of itemNames) {
    const item = await menuService.createItem(menu.id, name, `${name} description`, undefined, undefined, officeLocationId);
    items.push(item);
  }

  const poll = await pollService.createAutoFinishedPoll(menu.id, menu.name, officeLocationId);
  const selection = await foodSelectionService.startFoodSelection(poll.id, 10, officeLocationId);
  return { menu, items, poll, selection };
}

async function seedRatedOrder(
  selectionId: string,
  item: { id: string; name: string },
  rating: number,
  when: Date,
) {
  await prisma.foodOrder.create({
    data: {
      selectionId,
      nickname: 'Alice',
      actorKey: ACTOR.actorKey,
      actorEmail: ACTOR.actorEmail,
      displayNameSnapshot: ACTOR.displayNameSnapshot,
      itemId: item.id,
      itemName: item.name,
      orderedAt: when,
      rating,
      ratedAt: when,
    },
  });
}

async function seedRepeatedRatings(
  selectionId: string,
  item: { id: string; name: string },
  timestamps: [Date, Date],
) {
  await seedRatedOrder(selectionId, item, 5, timestamps[0]);
  await seedRatedOrder(selectionId, item, 5, timestamps[1]);
}

async function runReimportSurvivalScenario() {
  const office = await ensureDefaultOfficeLocation();
  const { menu, items, selection } = await createActiveSelection(office.id, [
    'Chicken Korma!',
    'Fish and Chips',
    'Beef Burger',
  ]);
  await persistLearnedOfficeModel([{ officeLocationId: office.id, preferredItemName: 'Chicken Korma' }]);

  await seedRatedOrder(selection.id, items[0], 5, new Date('2026-06-01T12:00:00.000Z'));
  await seedRatedOrder(selection.id, items[0], 5, new Date('2026-06-01T12:15:00.000Z'));

  const first = await generateRecommendations(selection.id, office.id, ACTOR);

  await menuService.deleteItem(items[0].id, office.id);
  const reimported = await menuService.createItem(
    menu.id,
    'Chicken Korma',
    'Creamy curry',
    undefined,
    undefined,
    office.id,
  );

  const second = await generateRecommendations(selection.id, office.id, ACTOR);
  return {
    reimported,
    first,
    second,
  };
}

async function runOfficeIsolationScenario() {
  const officeA = await ensureDefaultOfficeLocation();
  const officeB = await prisma.officeLocation.create({
    data: {
      key: 'munich',
      name: 'Munich',
      isActive: true,
    },
  });
  const model = await persistLearnedOfficeModel([
    { officeLocationId: officeA.id, preferredItemName: 'Chicken Korma' },
    { officeLocationId: officeB.id, preferredItemName: 'Beef Burger' },
  ]);
  await prisma.officeRecommenderSetting.upsert({
    where: { officeLocationId: officeB.id },
    update: {
      safeMode: 'learned',
      activeModelId: model.id,
      exploreEnabled: true,
    },
    create: {
      officeLocationId: officeB.id,
      safeMode: 'learned',
      activeModelId: model.id,
      exploreEnabled: true,
    },
  });

  const officeASelection = await createActiveSelection(officeA.id, [
    'Chicken Korma',
    'Fish and Chips',
    'Beef Burger',
  ]);
  const officeBSelection = await createActiveSelection(officeB.id, [
    'Chicken Korma',
    'Fish and Chips',
    'Beef Burger',
  ]);

  await seedRepeatedRatings(officeASelection.selection.id, officeASelection.items[0], [
    new Date('2026-06-02T12:00:00.000Z'),
    new Date('2026-06-02T12:15:00.000Z'),
  ]);
  await seedRepeatedRatings(officeBSelection.selection.id, officeBSelection.items[2], [
    new Date('2026-06-02T12:00:00.000Z'),
    new Date('2026-06-02T12:15:00.000Z'),
  ]);

  const officeAResult = await generateRecommendations(officeASelection.selection.id, officeA.id, ACTOR);
  const officeBResult = await generateRecommendations(officeBSelection.selection.id, officeB.id, ACTOR);
  return { officeAResult, officeBResult };
}

describe('mealRecommendation transfer', () => {
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

  it('keeps learned repeat history across a reimport that only changes the menu item name punctuation', async () => {
    const { first, reimported, second } = await runReimportSurvivalScenario();
    expect(first.source).toBe('safe_learned');
    expect(first.items[0].itemName).toBe('Chicken Korma!');

    expect(normalizeMenuItemIdentityKey(reimported.name)).toBe(normalizeMenuItemIdentityKey('Chicken Korma!'));
    expect(second.source).toBe('safe_learned');
    expect(second.items[0].itemName).not.toBe('Chicken Korma');
    expect(second.items[0].sourceSignals).toContain('taste_match');
  });

  it('keeps office histories isolated even while the learned model is shared', async () => {
    const { officeAResult, officeBResult } = await runOfficeIsolationScenario();
    expect(officeAResult.source).toBe('safe_learned');
    expect(officeBResult.source).toBe('safe_learned');
    expect(officeAResult.items[0].itemName).toBe('Chicken Korma');
    expect(officeBResult.items[0].itemName).toBe('Beef Burger');
  });
});
