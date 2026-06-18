import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import prisma from '../../src/server/db.js';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';
import { ensureDefaultOfficeLocation, createOfficeLocation } from '../../src/server/services/officeLocation.js';
import * as menuService from '../../src/server/services/menu.js';
import { clearMealRecommendationModelCache, saveMealRecommendationModel, trainMealRecommendationModel } from '../../src/server/services/mealRecommendationModel.js';
import { evaluateMealRecommendationModel } from '../../src/server/services/mealRecommendationEval.js';

function buildImpressionItems(items: Array<{ itemId: string; itemName: string }>) {
  return items.map((item, index) => ({
    itemId: item.itemId,
    itemName: item.itemName,
    rank: index + 1,
      score: 100 - index,
    reason: 'snapshot',
    sourceSignals: ['taste_match'],
    aiAssisted: false,
  }));
}

async function seedRecommendationRun(input: {
  officeLocationId: string;
  menuId: string;
  menuName: string;
  actorKey: string;
  recommendedAt: Date;
  actualItem: { id: string; name: string };
  snapshotOrder: Array<{ id: string; name: string }>;
}) {
  const poll = await prisma.poll.create({
    data: {
      officeLocationId: input.officeLocationId,
      description: `Eval poll ${input.menuName}`,
      status: 'finished',
      startedAt: new Date(input.recommendedAt.getTime() - 3_600_000),
      endsAt: new Date(input.recommendedAt.getTime() - 1_800_000),
      endedPrematurely: false,
      winnerMenuId: input.menuId,
      winnerMenuName: input.menuName,
      winnerSelectedRandomly: false,
    },
  });

  const selection = await prisma.foodSelection.create({
    data: {
      officeLocationId: input.officeLocationId,
      pollId: poll.id,
      menuId: input.menuId,
      menuName: input.menuName,
      status: 'completed',
      startedAt: new Date(input.recommendedAt.getTime() - 1_800_000),
      endsAt: new Date(input.recommendedAt.getTime() + 1_800_000),
      completedAt: new Date(input.recommendedAt.getTime() + 2_400_000),
    },
  });

  await prisma.foodOrder.create({
    data: {
      selectionId: selection.id,
      nickname: input.actorKey,
      actorKey: input.actorKey,
      itemId: input.actualItem.id,
      itemName: input.actualItem.name,
      orderedAt: new Date(input.recommendedAt.getTime() + 600_000),
    },
  });

  await prisma.mealRecommendationImpression.create({
    data: {
      foodSelectionId: selection.id,
      pollId: poll.id,
      officeLocationId: input.officeLocationId,
      actorKey: input.actorKey,
      source: 'deterministic',
      provider: null,
      recommenderModelId: null,
      recommendedAt: input.recommendedAt,
      inputSummaryJson: { mode: 'baseline' },
      itemsJson: buildImpressionItems(input.snapshotOrder.map((item) => ({ itemId: item.id, itemName: item.name }))),
    },
  });
}

describe('mealRecommendationEval', () => {
  beforeEach(async () => {
    clearMealRecommendationModelCache();
    await cleanDatabase();
  });

  afterAll(async () => {
    clearMealRecommendationModelCache();
    await cleanDatabase();
    await disconnectDatabase();
  });

  it('computes held-out top-3 hit rates per office and persists the margin', async () => {
    const berlin = await ensureDefaultOfficeLocation();
    const munich = await createOfficeLocation('Munich');

    const berlinMenu = await menuService.createMenu('Berlin Lunch', berlin.id);
    const munichMenu = await menuService.createMenu('Munich Lunch', munich.id);

    const berlinChicken = await menuService.createItem(berlinMenu.id, 'Thai Chicken Curry', 'Coconut curry bowl', undefined, undefined, berlin.id);
    const berlinFish = await menuService.createItem(berlinMenu.id, 'Fish Sushi', 'Japanese rice roll', undefined, undefined, berlin.id);
    const berlinBurger = await menuService.createItem(berlinMenu.id, 'Beef Burger', 'Grilled burger', undefined, undefined, berlin.id);
    const berlinSalad = await menuService.createItem(berlinMenu.id, 'Greek Salad', 'Fresh bowl', undefined, undefined, berlin.id);
    const munichFish = await menuService.createItem(munichMenu.id, 'Fish Sushi', 'Japanese rice roll', undefined, undefined, munich.id);
    const munichBurger = await menuService.createItem(munichMenu.id, 'Beef Burger', 'Grilled burger', undefined, undefined, munich.id);
    const munichSalad = await menuService.createItem(munichMenu.id, 'Greek Salad', 'Fresh bowl', undefined, undefined, munich.id);
    const munichChicken = await menuService.createItem(munichMenu.id, 'Thai Chicken Curry', 'Coconut curry bowl', undefined, undefined, munich.id);

    const model = trainMealRecommendationModel(
      [
        { features: ['user:alice@example.com', `office:${berlin.id}`, 'ingredient:chicken', 'style:curry'], label: 1, weight: 2 },
        { features: ['user:alice@example.com', `office:${berlin.id}`, 'ingredient:fish', 'style:japanese'], label: 0, weight: 2 },
        { features: ['user:alice@example.com', `office:${berlin.id}`, 'ingredient:beef', 'style:burger'], label: 0, weight: 2 },
        { features: ['user:alice@example.com', `office:${berlin.id}`, 'style:salad'], label: 0, weight: 2 },
        { features: ['user:alice@example.com', `office:${berlin.id}`, 'ingredient:chicken', 'style:curry'], label: 1, weight: 2 },
        { features: ['user:alice@example.com', `office:${berlin.id}`, 'ingredient:fish', 'style:japanese'], label: 0, weight: 2 },
        { features: ['user:alice@example.com', `office:${berlin.id}`, 'ingredient:beef', 'style:burger'], label: 0, weight: 2 },
        { features: ['user:alice@example.com', `office:${berlin.id}`, 'style:salad'], label: 0, weight: 2 },
        { features: ['user:bob@example.com', `office:${munich.id}`, 'ingredient:fish', 'style:japanese'], label: 1, weight: 2 },
        { features: ['user:bob@example.com', `office:${munich.id}`, 'ingredient:beef', 'style:burger'], label: 0, weight: 2 },
        { features: ['user:bob@example.com', `office:${munich.id}`, 'ingredient:fish', 'style:japanese'], label: 1, weight: 2 },
        { features: ['user:bob@example.com', `office:${munich.id}`, 'ingredient:beef', 'style:burger'], label: 0, weight: 2 },
        { features: ['user:bob@example.com', `office:${munich.id}`, 'style:salad'], label: 0, weight: 2 },
      ],
      { seed: 19, factorDim: 4, epochs: 40 },
    );
    const saved = await saveMealRecommendationModel(model, 8);

    const berlinImpressions = [
      {
        recommendedAt: new Date('2026-06-01T11:00:00Z'),
        actualItem: berlinFish,
        snapshotOrder: [berlinFish, berlinBurger, berlinSalad, berlinChicken],
      },
      {
        recommendedAt: new Date('2026-06-02T11:00:00Z'),
        actualItem: berlinFish,
        snapshotOrder: [berlinFish, berlinBurger, berlinSalad, berlinChicken],
      },
      {
        recommendedAt: new Date('2026-06-03T11:00:00Z'),
        actualItem: berlinChicken,
        snapshotOrder: [berlinFish, berlinBurger, berlinSalad, berlinChicken],
      },
    ];

    const munichImpressions = [
      {
        recommendedAt: new Date('2026-06-01T11:00:00Z'),
        actualItem: munichBurger,
        snapshotOrder: [munichFish, munichBurger, munichSalad, munichChicken],
      },
      {
        recommendedAt: new Date('2026-06-02T11:00:00Z'),
        actualItem: munichBurger,
        snapshotOrder: [munichFish, munichBurger, munichSalad, munichChicken],
      },
      {
        recommendedAt: new Date('2026-06-03T11:00:00Z'),
        actualItem: munichFish,
        snapshotOrder: [munichFish, munichBurger, munichSalad, munichChicken],
      },
    ];

    for (const impression of berlinImpressions) {
      await seedRecommendationRun({
        officeLocationId: berlin.id,
        menuId: berlinMenu.id,
        menuName: berlinMenu.name,
        actorKey: 'alice@example.com',
        ...impression,
      });
    }

    for (const impression of munichImpressions) {
      await seedRecommendationRun({
        officeLocationId: munich.id,
        menuId: munichMenu.id,
        menuName: munichMenu.name,
        actorKey: 'bob@example.com',
        ...impression,
      });
    }

    const result = await evaluateMealRecommendationModel({ modelVersion: saved.version });

    expect(result.results).toHaveLength(2);
    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          officeLocationId: berlin.id,
          sampleCount: 1,
          baselineTop3HitRate: 0,
          modelTop3HitRate: 1,
          marginPoints: 99.9999,
        }),
        expect.objectContaining({
          officeLocationId: munich.id,
          sampleCount: 1,
          baselineTop3HitRate: 1,
          modelTop3HitRate: 1,
          marginPoints: 0,
        }),
      ]),
    );

    const persisted = await prisma.modelEvaluationResult.findMany({
      where: { recommenderModelId: saved.id },
      orderBy: { officeLocationId: 'asc' },
    });

    expect(persisted).toHaveLength(2);
    const berlinRow = persisted.find((row) => row.officeLocationId === berlin.id);
    const munichRow = persisted.find((row) => row.officeLocationId === munich.id);
    expect(berlinRow).toBeDefined();
    expect(munichRow).toBeDefined();
    expect(Number(berlinRow!.marginPoints)).toBeCloseTo(99.9999, 4);
    expect(Number(munichRow!.marginPoints)).toBe(0);
  });
});
