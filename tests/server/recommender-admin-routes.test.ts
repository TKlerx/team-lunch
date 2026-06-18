import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../src/server/index.js';
import prisma from '../../src/server/db.js';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';
import { clearMealRecommendationModelCache, saveMealRecommendationModel, trainMealRecommendationModel } from '../../src/server/services/mealRecommendationModel.js';
import { ensureDefaultOfficeLocation, createOfficeLocation } from '../../src/server/services/officeLocation.js';
import * as menuService from '../../src/server/services/menu.js';
import { createSessionCookieValue } from '../../src/server/services/authSession.js';

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

async function createAdminCookie(email: string, officeLocationId: string) {
  await prisma.authAccessUser.upsert({
    where: { email },
    update: {
      approved: true,
      blocked: false,
      isAdmin: true,
      officeLocationId,
    },
    create: {
      email,
      approved: true,
      blocked: false,
      isAdmin: true,
      officeLocationId,
      requestedAt: new Date(),
      approvedAt: new Date(),
    },
  });

  const session = createSessionCookieValue({
    username: email,
    method: 'entra',
    iat: Math.floor(Date.now() / 1000),
    sessionVersion: 0,
  });

  return `team_lunch_auth_session=${session}`;
}

async function seedOfficeRecommenderSetting(officeLocationId: string) {
  await prisma.officeRecommenderSetting.upsert({
    where: { officeLocationId },
    update: {
      safeMode: 'baseline',
      activeModelId: null,
      exploreEnabled: true,
    },
    create: {
      officeLocationId,
      safeMode: 'baseline',
      activeModelId: null,
      exploreEnabled: true,
    },
  });
}

let app: Awaited<ReturnType<typeof buildApp>>;

describe('recommender admin routes', () => {
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    clearMealRecommendationModelCache();
    await cleanDatabase();
  });

  afterAll(async () => {
    clearMealRecommendationModelCache();
    await cleanDatabase();
    await app.close();
    await disconnectDatabase();
  });

  it('trains, evaluates, reports status, toggles mode, and flips explore', async () => {
    const berlin = await ensureDefaultOfficeLocation();
    const munich = await createOfficeLocation('Munich');
    const adminCookie = await createAdminCookie('admin@example.com', berlin.id);

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
        { features: ['user:bob@example.com', `office:${munich.id}`, 'ingredient:fish', 'style:japanese'], label: 1, weight: 2 },
        { features: ['user:bob@example.com', `office:${munich.id}`, 'ingredient:beef', 'style:burger'], label: 0, weight: 2 },
        { features: ['user:bob@example.com', `office:${munich.id}`, 'style:salad'], label: 0, weight: 2 },
        { features: ['user:bob@example.com', `office:${munich.id}`, 'ingredient:chicken', 'style:curry'], label: 0, weight: 2 },
      ],
      { seed: 19, factorDim: 4, epochs: 40 },
    );
    const manualSaved = await saveMealRecommendationModel(model, 8);
    expect(manualSaved.version).toBeGreaterThan(0);

    for (const recommendedAt of [
      new Date('2026-06-01T11:00:00Z'),
      new Date('2026-06-02T11:00:00Z'),
      new Date('2026-06-03T11:00:00Z'),
    ]) {
      await seedRecommendationRun({
        officeLocationId: berlin.id,
        menuId: berlinMenu.id,
        menuName: berlinMenu.name,
        actorKey: 'alice@example.com',
        recommendedAt,
        actualItem: recommendedAt.getTime() === new Date('2026-06-03T11:00:00Z').getTime() ? berlinChicken : berlinFish,
        snapshotOrder: [berlinFish, berlinBurger, berlinSalad, berlinChicken],
      });
      await seedRecommendationRun({
        officeLocationId: munich.id,
        menuId: munichMenu.id,
        menuName: munichMenu.name,
        actorKey: 'bob@example.com',
        recommendedAt,
        actualItem: recommendedAt.getTime() === new Date('2026-06-03T11:00:00Z').getTime() ? munichFish : munichBurger,
        snapshotOrder: [munichFish, munichBurger, munichSalad, munichChicken],
      });
    }

    const trainResponse = await supertest(app.server)
      .post('/api/admin/recommender/train')
      .set('Cookie', adminCookie)
      .expect(202);

    expect(trainResponse.body.modelVersion).toBeGreaterThan(0);
    expect(trainResponse.body.trainingSampleCount).toBeGreaterThan(0);

    const evaluateResponse = await supertest(app.server)
      .post('/api/admin/recommender/evaluate')
      .set('Cookie', adminCookie)
      .send({ modelVersion: trainResponse.body.modelVersion })
      .expect(200);

    expect(evaluateResponse.body.results).toHaveLength(2);
    expect(evaluateResponse.body.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          officeLocationId: berlin.id,
          sampleCount: 1,
        }),
        expect.objectContaining({
          officeLocationId: munich.id,
          sampleCount: 1,
        }),
      ]),
    );

    await seedOfficeRecommenderSetting(berlin.id);
    await seedOfficeRecommenderSetting(munich.id);

    const statusResponse = await supertest(app.server)
      .get('/api/admin/recommender/status')
      .set('Cookie', adminCookie)
      .expect(200);

    expect(statusResponse.body.activeModelVersion).toBeNull();
    expect(statusResponse.body.offices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          officeLocationId: berlin.id,
          latestMargin: expect.any(Number),
          exploreEnabled: true,
        }),
      ]),
    );
  });

  it('enables learned mode, flips explore, and reverts to baseline when the margin clears the gate', async () => {
    const office = await ensureDefaultOfficeLocation();
    const adminCookie = await createAdminCookie('admin@example.com', office.id);

    const model = trainMealRecommendationModel(
      [{ features: ['user:alice@example.com', `office:${office.id}`, 'ingredient:chicken'], label: 1, weight: 1 }],
      { seed: 11, factorDim: 4, epochs: 10 },
    );
    const saved = await saveMealRecommendationModel(model, 1);

    await prisma.modelEvaluationResult.create({
      data: {
        recommenderModelId: saved.id,
        officeLocationId: office.id,
        baselineTop3HitRate: 0.5,
        modelTop3HitRate: 0.61,
        marginPoints: 11,
        sampleCount: 10,
      },
    });

    await seedOfficeRecommenderSetting(office.id);

    const statusResponse = await supertest(app.server)
      .get('/api/admin/recommender/status')
      .set('Cookie', adminCookie)
      .expect(200);

    expect(statusResponse.body.offices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          officeLocationId: office.id,
          latestMargin: 11,
          exploreEnabled: true,
        }),
      ]),
    );

    const modeResponse = await supertest(app.server)
      .put(`/api/admin/recommender/offices/${office.id}/mode`)
      .set('Cookie', adminCookie)
      .send({ safeMode: 'learned', modelVersion: saved.version })
      .expect(200);

    expect(modeResponse.body).toEqual({
      officeLocationId: office.id,
      safeMode: 'learned',
      activeModelVersion: saved.version,
    });

    const exploreResponse = await supertest(app.server)
      .put(`/api/admin/recommender/offices/${office.id}/explore`)
      .set('Cookie', adminCookie)
      .send({ enabled: false })
      .expect(200);

    expect(exploreResponse.body).toEqual({
      officeLocationId: office.id,
      exploreEnabled: false,
    });

    const revertResponse = await supertest(app.server)
      .put(`/api/admin/recommender/offices/${office.id}/mode`)
      .set('Cookie', adminCookie)
      .send({ safeMode: 'baseline' })
      .expect(200);

    expect(revertResponse.body).toEqual({
      officeLocationId: office.id,
      safeMode: 'baseline',
      activeModelVersion: null,
    });
  });

  it('blocks learned mode when the office margin is below threshold', async () => {
    const office = await ensureDefaultOfficeLocation();
    const adminCookie = await createAdminCookie('admin@example.com', office.id);

    const model = trainMealRecommendationModel(
      [{ features: ['user:alice@example.com', `office:${office.id}`, 'ingredient:chicken'], label: 1, weight: 1 }],
      { seed: 7, factorDim: 4, epochs: 10 },
    );
    const saved = await saveMealRecommendationModel(model, 1);

    await prisma.modelEvaluationResult.create({
      data: {
        recommenderModelId: saved.id,
        officeLocationId: office.id,
        baselineTop3HitRate: 0.5,
        modelTop3HitRate: 0.5499,
        marginPoints: 4.99,
        sampleCount: 10,
      },
    });

    const response = await supertest(app.server)
      .put(`/api/admin/recommender/offices/${office.id}/mode`)
      .set('Cookie', adminCookie)
      .send({ safeMode: 'learned', modelVersion: saved.version })
      .expect(409);

    expect(response.body.error).toBe('Model does not beat baseline for this office');
  });
});
