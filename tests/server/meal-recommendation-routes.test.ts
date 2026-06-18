import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../src/server/index.js';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';
import { clearAllTimers as clearPollTimers } from '../../src/server/services/poll.js';
import { clearAllTimers as clearFoodSelectionTimers } from '../../src/server/services/foodSelection.js';
import { createOfficeLocation, ensureDefaultOfficeLocation } from '../../src/server/services/officeLocation.js';
import { createSessionCookieValue } from '../../src/server/services/authSession.js';
import { resetAiRecommendationConfigForTests } from '../../src/server/services/mealRecommendationAi.js';
import { clearMealRecommendationModelCache, saveMealRecommendationModel, trainMealRecommendationModel } from '../../src/server/services/mealRecommendationModel.js';
import prisma from '../../src/server/db.js';
import type { FastifyInstance } from 'fastify';

// Suppress SSE broadcasts during tests
vi.mock('../../src/server/sse.js', () => ({
  broadcast: vi.fn(),
  register: vi.fn(),
  sendInitialState: vi.fn(),
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
    orderPlacedBy: fs.orderPlacedBy ?? null,
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
      processed: false,
      processedAt: null,
      delivered: false,
      deliveredAt: null,
      orderedAt: o.orderedAt.toISOString(),
    })),
  })),
}));

let app: FastifyInstance;

describe('Meal recommendation routes (integration)', () => {
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    clearPollTimers();
    clearFoodSelectionTimers();
    clearMealRecommendationModelCache();
    await cleanDatabase();
    process.env = { ...originalEnv };
    resetAiRecommendationConfigForTests();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetAiRecommendationConfigForTests();
  });

  afterAll(async () => {
    clearPollTimers();
    clearFoodSelectionTimers();
    clearMealRecommendationModelCache();
    await cleanDatabase();
    await app.close();
    await disconnectDatabase();
  });

  // ─── Helpers ─────────────────────────────────────────────

  async function approvedAuthHeaders(
    email = 'approved-user@company.com',
    displayName?: string,
    isAdmin = false,
    officeLocationId?: string,
  ) {
    const office = officeLocationId ?? (await ensureDefaultOfficeLocation()).id;
    await prisma.authAccessUser.upsert({
      where: { email },
      update: {
        approved: true,
        blocked: false,
        isAdmin,
        displayName: displayName ?? null,
        displayNameSource: displayName ? 'local' : null,
        officeLocationId: office,
      },
      create: {
        email,
        approved: true,
        blocked: false,
        isAdmin,
        displayName: displayName ?? null,
        displayNameSource: displayName ? 'local' : null,
        officeLocationId: office,
      },
    });

    const session = createSessionCookieValue({
      username: email,
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    return {
      cookie: `team_lunch_auth_session=${session}`,
    };
  }

  async function adminAuthHeaders(email = 'admin@example.com') {
    return approvedAuthHeaders(email, undefined, true);
  }

  async function createMenu(name: string) {
    const res = await supertest(app.server).post('/api/menus').send({ name }).expect(201);
    return res.body;
  }

  async function createMenuItem(menuId: string, name: string, description?: string) {
    const res = await supertest(app.server)
      .post(`/api/menus/${menuId}/items`)
      .send({ name, description })
      .expect(201);
    return res.body;
  }

  async function createActiveFoodSelection() {
    const headers = await approvedAuthHeaders('alice@example.com');
    const menu = await createMenu('Lunch Menu');
    const item1 = await createMenuItem(menu.id, 'Pad Thai', 'Noodles');
    const item2 = await createMenuItem(menu.id, 'Green Curry', 'Coconut curry');

    const pollRes = await supertest(app.server)
      .post('/api/polls')
      .set(headers)
      .send({ description: 'Lunch poll', durationMinutes: 60 })
      .expect(201);
    const poll = pollRes.body;

    await supertest(app.server)
      .post(`/api/polls/${poll.id}/votes`)
      .set(headers)
      .send({ menuId: menu.id, nickname: 'Alice' })
      .expect(201);

    await prisma.poll.update({
      where: { id: poll.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });

    await supertest(app.server).post(`/api/polls/${poll.id}/end`).set(headers).expect(200);

    const selectionRes = await supertest(app.server)
      .post('/api/food-selections')
      .set(await approvedAuthHeaders('creator@example.com'))
      .send({ pollId: poll.id, durationMinutes: 10 })
      .expect(201);

    return { menu, item1, item2, selection: selectionRes.body, poll };
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
        actorKey: opts.actorKey ?? 'alice@example.com',
        itemName,
        orderedAt: new Date(Date.now() - 86400000 * 7),
        rating: opts.rating ?? null,
        ratedAt: opts.rating != null ? new Date() : null,
      },
    });
  }

  async function persistLearnedOfficeModel(officeLocationId: string) {
    const model = trainMealRecommendationModel(
      [
        {
          features: [
            'user:alice@example.com',
            `office:${officeLocationId}`,
            'ingredient:chicken',
            'style:thai',
          ],
          label: 1,
          weight: 2,
        },
        {
          features: [
            'user:alice@example.com',
            `office:${officeLocationId}`,
            'ingredient:fish',
            'style:fried',
          ],
          label: 0,
          weight: 2,
        },
      ],
      { seed: 19, factorDim: 4, epochs: 30 },
    );

    const saved = await saveMealRecommendationModel(model, 2);
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

    return saved;
  }

  // ─── Authentication ──────────────────────────────────────

  it('rejects unauthenticated recommendation requests', async () => {
    const { selection } = await createActiveFoodSelection();

    await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/recommendations`)
      .send({})
      .expect(401);
  });

  // ─── Happy path ──────────────────────────────────────────

  it('returns ranked recommendations for an active food selection', async () => {
    const { selection } = await createActiveFoodSelection();
    const headers = await approvedAuthHeaders('alice@example.com');

    const res = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/recommendations`)
      .set(headers)
      .send({})
      .expect(200);

    expect(res.body.foodSelectionId).toBe(selection.id);
    expect(res.body.source).toBe('deterministic');
    expect(res.body.warnings).toEqual([]);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0]).toMatchObject({
      rank: 1,
      itemName: expect.any(String),
      reason: expect.any(String),
      sourceSignals: expect.any(Array),
      aiAssisted: false,
    });
    expect(res.body.impressionId).toBeDefined();

    const impression = await prisma.mealRecommendationImpression.findUnique({
      where: { id: res.body.impressionId },
    });
    expect(impression).not.toBeNull();
    expect(impression?.actorKey).toBe('alice@example.com');
    expect(impression?.foodSelectionId).toBe(selection.id);
  });

  it('returns exploratory recommendations and persists explore impressions even when the office safe mode is baseline', async () => {
    const office = await ensureDefaultOfficeLocation();
    await prisma.officeRecommenderSetting.upsert({
      where: { officeLocationId: office.id },
      update: {
        safeMode: 'baseline',
        activeModelId: null,
        exploreEnabled: false,
      },
      create: {
        officeLocationId: office.id,
        safeMode: 'baseline',
        activeModelId: null,
        exploreEnabled: false,
      },
    });

    const { selection } = await createActiveFoodSelection();
    const headers = await approvedAuthHeaders('alice@example.com', undefined, false, office.id);

    const res = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/recommendations/explore`)
      .set(headers)
      .send({})
      .expect(200);

    expect(res.body.foodSelectionId).toBe(selection.id);
    expect(res.body.source).toBe('explore');
    expect(res.body.warnings[0]).toMatch(/exploratory suggestions/i);

    const impression = await prisma.mealRecommendationImpression.findUnique({
      where: { id: res.body.impressionId },
    });
    expect(impression?.source).toBe('explore');
    expect(impression?.foodSelectionId).toBe(selection.id);
  });

  // ─── Office scoping ──────────────────────────────────────

  it('rejects a request for an office not assigned to the user', async () => {
    const { selection } = await createActiveFoodSelection();
    const defaultOffice = await ensureDefaultOfficeLocation();
    const munich = await createOfficeLocation('Munich');
    const headers = await approvedAuthHeaders('munich-user@company.com', undefined, false, munich.id);

    const res = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/recommendations?officeLocationId=${defaultOffice.id}`)
      .set(headers)
      .send({})
      .expect(403);

    expect(res.body.error).toBe('Requested office is not assigned to the user');
  });

  it('returns 404 for an admin requesting a food selection from a different office', async () => {
    const { selection } = await createActiveFoodSelection();
    const munich = await createOfficeLocation('Munich');
    const headers = await approvedAuthHeaders('munich-admin@company.com', undefined, true, munich.id);

    const res = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/recommendations?officeLocationId=${munich.id}`)
      .set(headers)
      .send({})
      .expect(404);

    expect(res.body.error).toBe('Food selection not found');
  });

  // ─── Error handling ──────────────────────────────────────

  it('returns 404 for an unknown food selection', async () => {
    const headers = await approvedAuthHeaders('alice@example.com');

    const res = await supertest(app.server)
      .post('/api/food-selections/00000000-0000-0000-0000-000000000000/recommendations')
      .set(headers)
      .send({})
      .expect(404);

    expect(res.body.error).toBe('Food selection not found');
  });

  it('returns 400 once the food selection is no longer orderable', async () => {
    const { selection } = await createActiveFoodSelection();
    await prisma.foodSelection.update({
      where: { id: selection.id },
      data: { status: 'completed' },
    });
    const headers = await approvedAuthHeaders('alice@example.com');

    const res = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/recommendations`)
      .set(headers)
      .send({})
      .expect(400);

    expect(res.body.error).toBe('Food selection is not orderable');
  });

  // ─── AI fallback ─────────────────────────────────────────

  it('falls back to deterministic recommendations with a warning when AI is requested but not configured', async () => {
    delete process.env.AI_RECOMMENDATION_ENDPOINT;
    delete process.env.AI_RECOMMENDATION_API_KEY;
    delete process.env.AI_RECOMMENDATION_MODEL;
    delete process.env.AI_RECOMMENDATION_PROVIDER;
    resetAiRecommendationConfigForTests();

    const { selection } = await createActiveFoodSelection();
    const headers = await approvedAuthHeaders('alice@example.com');

    const res = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/recommendations`)
      .set(headers)
      .send({ useAi: true })
      .expect(200);

    expect(res.body.source).toBe('deterministic_fallback');
    expect(res.body.warnings.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('falls back to deterministic recommendations and persists the fallback source when the AI provider fails', async () => {
    process.env.AI_RECOMMENDATION_ENDPOINT = 'https://ai.example.com/recommend';
    process.env.AI_RECOMMENDATION_API_KEY = 'secret-key';
    process.env.AI_RECOMMENDATION_MODEL = 'gpt-test';
    process.env.AI_RECOMMENDATION_PROVIDER = 'test-provider';
    resetAiRecommendationConfigForTests();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    const { selection } = await createActiveFoodSelection();
    const headers = await approvedAuthHeaders('alice@example.com');

    const res = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/recommendations`)
      .set(headers)
      .send({ useAi: true })
      .expect(200);

    expect(res.body.source).toBe('deterministic_fallback');
    expect(res.body.warnings.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body.items)).toBe(true);

    const impression = await prisma.mealRecommendationImpression.findUnique({
      where: { id: res.body.impressionId },
    });
    expect(impression?.source).toBe('deterministic_fallback');

    vi.unstubAllGlobals();
  });

  // ─── No separate feedback endpoint (US3 regression) ──────

  it('does not expose a separate recommendation feedback endpoint', async () => {
    const { selection } = await createActiveFoodSelection();
    const headers = await approvedAuthHeaders('alice@example.com');

    const recRes = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/recommendations`)
      .set(headers)
      .send({})
      .expect(200);

    await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/recommendations/${recRes.body.impressionId}/feedback`)
      .set(headers)
      .send({ helpful: true })
      .expect(404);
  });

  it('upserts, lists, and deletes anticipated-like marks for the current selection menu', async () => {
    const { selection, item1 } = await createActiveFoodSelection();
    const headers = await approvedAuthHeaders('alice@example.com');

    await supertest(app.server)
      .put(`/api/food-selections/${selection.id}/marks/${item1.id}`)
      .set(headers)
      .send({ sentiment: 'like' })
      .expect(200);

    const listed = await supertest(app.server)
      .get(`/api/food-selections/${selection.id}/marks`)
      .set(headers)
      .expect(200);

    expect(listed.body.marks).toHaveLength(1);
    expect(listed.body.marks[0]).toMatchObject({
      itemId: item1.id,
      sentiment: 'like',
      itemIdentityKey: expect.any(String),
    });

    await supertest(app.server)
      .delete(`/api/food-selections/${selection.id}/marks/${item1.id}`)
      .set(headers)
      .expect(200);

    const cleared = await supertest(app.server)
      .get(`/api/food-selections/${selection.id}/marks`)
      .set(headers)
      .expect(200);

    expect(cleared.body.marks).toHaveLength(0);
  });

  it('returns flavor-diverse onboarding candidates for the current office', async () => {
    const headers = await approvedAuthHeaders('alice@example.com');
    const menu = await createMenu('Lunch Menu');
    await createMenuItem(menu.id, 'Chicken Pad Thai', 'Noodles and peanuts');
    await createMenuItem(menu.id, 'Green Curry', 'Thai curry bowl');
    await createMenuItem(menu.id, 'Massaman Curry', 'Thai curry bowl');
    await createMenuItem(menu.id, 'Thai Basil Chicken', 'Thai stir fry');
    await createMenuItem(menu.id, 'Beef Burger', 'Grilled burger');
    await createMenuItem(menu.id, 'Greek Salad', 'Fresh salad bowl');
    await createMenuItem(menu.id, 'Fish Sushi', 'Japanese rice roll');

    const res = await supertest(app.server)
      .get('/api/recommender/onboarding/candidates')
      .set(headers)
      .expect(200);

    expect(res.body.candidates).toHaveLength(6);
    const topThree = res.body.candidates.slice(0, 3);
    expect(topThree.some((candidate: { tags: string[] }) => candidate.tags.includes('style:burger'))).toBe(true);
    expect(new Set(topThree.flatMap((candidate: { tags: string[] }) => candidate.tags)).size).toBeGreaterThan(3);
  });

  it('returns pre-vote recommendations for eligible poll menus and persists a pre_vote impression', async () => {
    const headers = await approvedAuthHeaders('alice@example.com');
    const pizzaMenu = await createMenu('Pizza Place');
    const sushiMenu = await createMenu('Sushi Bar');
    const curryMenu = await createMenu('Curry House');
    await createMenuItem(pizzaMenu.id, 'Margherita', 'Classic pizza');
    await createMenuItem(sushiMenu.id, 'California Roll', 'Rice roll');
    await createMenuItem(curryMenu.id, 'Chicken Curry', 'Coconut curry');

    const pollRes = await supertest(app.server)
      .post('/api/polls')
      .set(headers)
      .send({
        description: 'Lunch poll',
        durationMinutes: 60,
        excludedMenuJustifications: [{ menuId: sushiMenu.id, reason: 'Out of stock' }],
      })
      .expect(201);

    const res = await supertest(app.server)
      .post('/api/recommender/pre-vote')
      .set(headers)
      .send({ pollId: pollRes.body.id, limit: 5 })
      .expect(200);

    expect(res.body.source).toBe('pre_vote');
    expect(res.body.pollId).toBe(pollRes.body.id);
    expect(res.body.warnings).toEqual(expect.arrayContaining([expect.stringContaining('history')]));
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.every((item: { menuId: string }) => item.menuId !== sushiMenu.id)).toBe(true);
    expect(res.body.items.some((item: { menuName: string }) => item.menuName === pizzaMenu.name)).toBe(true);

    const impression = await prisma.mealRecommendationImpression.findFirst({
      where: {
        officeLocationId: (await ensureDefaultOfficeLocation()).id,
        pollId: pollRes.body.id,
        actorKey: 'alice@example.com',
        source: 'pre_vote',
      },
    });
    expect(impression).not.toBeNull();
    expect(impression?.foodSelectionId).toBeNull();
    expect(impression?.pollId).toBe(pollRes.body.id);
    expect(impression?.source).toBe('pre_vote');
  });

  it('falls back to current office menus without pollId when no poll is active', async () => {
    const headers = await approvedAuthHeaders('alice@example.com');
    const pizzaMenu = await createMenu('Pizza Place');
    const sushiMenu = await createMenu('Sushi Bar');
    await createMenuItem(pizzaMenu.id, 'Margherita', 'Classic pizza');
    await createMenuItem(pizzaMenu.id, 'Pepperoni', 'Spicy pizza');
    await createMenuItem(sushiMenu.id, 'California Roll', 'Rice roll');

    const res = await supertest(app.server)
      .post('/api/recommender/pre-vote')
      .set(headers)
      .send({ limit: 3 })
      .expect(200);

    expect(res.body.source).toBe('pre_vote');
    expect(res.body.pollId).toBeUndefined();
    expect(res.body.warnings).toEqual(expect.arrayContaining([expect.stringContaining('history')]));
    expect(res.body.items).toHaveLength(3);
    expect(res.body.items.every((item: { menuId: string }) => [pizzaMenu.id, sushiMenu.id].includes(item.menuId))).toBe(true);
    expect(new Set(res.body.items.map((item: { menuName: string }) => item.menuName))).toEqual(
      new Set(['Pizza Place', 'Sushi Bar']),
    );
  });

  it('returns safe_learned recommendations and persists the model id when the learned path is enabled', async () => {
    const office = await ensureDefaultOfficeLocation();
    const { selection, menu, poll } = await createActiveFoodSelection();
    await seedHistoricalOrder(office.id, poll.id, menu.id, menu.name, 'Chicken Pad Thai', { rating: 5 });
    await seedHistoricalOrder(office.id, poll.id, menu.id, menu.name, 'Thai Green Curry', { rating: 5 });
    const model = await persistLearnedOfficeModel(office.id);

    const headers = await approvedAuthHeaders('alice@example.com');
    const res = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/recommendations`)
      .set(headers)
      .send({})
      .expect(200);

    expect(res.body.source).toBe('safe_learned');
    expect(res.body.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('not been evaluated for your office')]),
    );

    const impression = await prisma.mealRecommendationImpression.findUnique({
      where: { id: res.body.impressionId },
    });
    expect(impression?.recommenderModelId).toBe(model.id);
  });
});
