import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../src/server/index.js';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';
import { clearAllTimers as clearPollTimers } from '../../src/server/services/poll.js';
import { clearAllTimers as clearFoodSelectionTimers } from '../../src/server/services/foodSelection.js';
import { createOfficeLocation, ensureDefaultOfficeLocation } from '../../src/server/services/officeLocation.js';
import { createSessionCookieValue } from '../../src/server/services/authSession.js';
import prisma from '../../src/server/db.js';
import type { FastifyInstance } from 'fastify';
import * as userMenuDefaultsService from '../../src/server/services/userMenuDefaults.js';

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

describe('Food selection routes (integration)', () => {
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    clearPollTimers();
    clearFoodSelectionTimers();
    await cleanDatabase();
  });

  afterAll(async () => {
    clearPollTimers();
    clearFoodSelectionTimers();
    await cleanDatabase();
    await app.close();
    await disconnectDatabase();
  });

  // ─── Helpers ─────────────────────────────────────────────

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

  async function createFinishedPoll() {
    const menu = await createMenu('Thai Food');
    const item = await createMenuItem(menu.id, 'Pad Thai', 'Noodles');

    // Start poll
    const pollRes = await supertest(app.server)
      .post('/api/polls')
      .send({ description: 'Lunch poll', durationMinutes: 60 })
      .expect(201);
    const poll = pollRes.body;

    // Cast a vote
    await supertest(app.server)
      .post(`/api/polls/${poll.id}/votes`)
      .send({ menuId: menu.id, nickname: 'Alice' })
      .expect(201);

    await prisma.poll.update({
      where: { id: poll.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });

    // End the poll
    const endRes = await supertest(app.server)
      .post(`/api/polls/${poll.id}/end`)
      .expect(200);

    return { menu, item, poll: endRes.body };
  }

  async function startFoodSelection(pollId: string, durationMinutes = 10) {
    const res = await supertest(app.server)
      .post('/api/food-selections')
      .send({ pollId, durationMinutes })
      .expect(201);
    return res.body;
  }

  async function approvedAuthHeaders(email = 'approved-user@company.com') {
    const defaultOffice = await ensureDefaultOfficeLocation();
    await prisma.authAccessUser.upsert({
      where: { email },
      update: {
        approved: true,
        blocked: false,
        isAdmin: false,
        officeLocationId: defaultOffice.id,
      },
      create: {
        email,
        approved: true,
        blocked: false,
        isAdmin: false,
        officeLocationId: defaultOffice.id,
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

  async function completeFoodSelectionAsApproved(selectionId: string, email?: string) {
    return supertest(app.server)
      .post(`/api/food-selections/${selectionId}/complete`)
      .set(await approvedAuthHeaders(email))
      .expect(200);
  }

  async function completeFoodSelectionNowAsApproved(selectionId: string, email?: string) {
    return supertest(app.server)
      .post(`/api/food-selections/${selectionId}/complete-now`)
      .set(await approvedAuthHeaders(email))
      .expect(200);
  }

  // ─── POST /api/food-selections ───────────────────────────

  it('creates a food selection successfully', async () => {
    const { poll } = await createFinishedPoll();
    const selection = await startFoodSelection(poll.id);
    expect(selection.status).toBe('active');
    expect(selection.menuName).toBe('Thai Food');
    expect(selection.id).toBeDefined();
  });

  it('rejects with 400 if poll is not finished', async () => {
    await createMenu('Test Menu');
    const pollRes = await supertest(app.server)
      .post('/api/polls')
      .send({ description: 'Test', durationMinutes: 60 })
      .expect(201);

    const res = await supertest(app.server)
      .post('/api/food-selections')
      .send({ pollId: pollRes.body.id, durationMinutes: 10 })
      .expect(400);
    expect(res.body.error).toContain('Poll must be finished');

    // Clean up poll
    await supertest(app.server).post(`/api/polls/${pollRes.body.id}/end`);
  });

  it('rejects with 404 if poll does not exist', async () => {
    const res = await supertest(app.server)
      .post('/api/food-selections')
      .send({ pollId: '00000000-0000-0000-0000-000000000000', durationMinutes: 10 })
      .expect(404);
    expect(res.body.error).toContain('Poll not found');
  });

  it('rejects with 400 for invalid duration', async () => {
    const { poll } = await createFinishedPoll();
    const res = await supertest(app.server)
      .post('/api/food-selections')
      .send({ pollId: poll.id, durationMinutes: 45 })
      .expect(400);
    expect(res.body.error).toContain('Duration must be 1 minute or a multiple of 5 between 5 and 30 minutes');
  });

  // ─── POST /api/food-selections/:id/orders ────────────────

  it('places an order successfully', async () => {
    const { poll, item } = await createFinishedPoll();
    const selection = await startFoodSelection(poll.id);

    const res = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/orders`)
      .send({ nickname: 'Bob', itemId: item.id, notes: 'Extra spicy' })
      .expect(201);

    expect(res.body.nickname).toBe('Bob');
    expect(res.body.itemName).toBe('Pad Thai');
    expect(res.body.notes).toBe('Extra spicy');
  });

  it('rejects order after timer expiry (overtime)', async () => {
    const { poll, item } = await createFinishedPoll();
    const selection = await startFoodSelection(poll.id);

    // Expire the selection
    await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/expire`)
      .expect(200);

    const res = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/orders`)
      .send({ nickname: 'Late', itemId: item.id })
      .expect(400);
    expect(res.body.error).toContain('Food selection is not active');
  });

  it('order place/update/withdraw round-trip works', async () => {
    const { poll, item } = await createFinishedPoll();
    const selection = await startFoodSelection(poll.id);

    // Place order
    const placeRes = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/orders`)
      .send({ nickname: 'Charlie', itemId: item.id, notes: 'Original' })
      .expect(201);
    expect(placeRes.body.notes).toBe('Original');

    // Update order (same nickname + same item updates)
    const updateRes = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/orders`)
      .send({ nickname: 'Charlie', itemId: item.id, notes: 'Updated' })
      .expect(201);
    expect(updateRes.body.notes).toBe('Updated');
    expect(updateRes.body.id).not.toBe(placeRes.body.id);

    // Withdraw order
    await supertest(app.server)
      .delete(`/api/food-selections/${selection.id}/orders`)
      .send({ nickname: 'Charlie' })
      .expect(204);

    // Verify no orders remain
    const orders = await prisma.foodOrder.findMany({
      where: { selectionId: selection.id },
    });
    expect(orders).toHaveLength(0);
  });

  it('allows multi-item orders for the same nickname', async () => {
    const { poll, item, menu } = await createFinishedPoll();
    const extraItem = await createMenuItem(menu.id, 'Green Curry', 'Spicy curry');
    const selection = await startFoodSelection(poll.id);

    const first = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/orders`)
      .send({ nickname: 'Charlie', itemId: item.id })
      .expect(201);

    const second = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/orders`)
      .send({ nickname: 'Charlie', itemId: extraItem.id })
      .expect(201);

    expect(first.body.id).not.toBe(second.body.id);

    const orders = await prisma.foodOrder.findMany({
      where: { selectionId: selection.id, nickname: 'Charlie' },
    });
    expect(orders).toHaveLength(2);
  });

  it('withdraws only the selected line item when orderId is provided', async () => {
    const { poll, item, menu } = await createFinishedPoll();
    const extraItem = await createMenuItem(menu.id, 'Green Curry', 'Spicy curry');
    const selection = await startFoodSelection(poll.id);

    const firstOrder = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/orders`)
      .send({ nickname: 'Charlie', itemId: item.id })
      .expect(201);

    await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/orders`)
      .send({ nickname: 'Charlie', itemId: extraItem.id })
      .expect(201);

    await supertest(app.server)
      .delete(`/api/food-selections/${selection.id}/orders`)
      .send({ nickname: 'Charlie', orderId: firstOrder.body.id })
      .expect(204);

    const orders = await prisma.foodOrder.findMany({
      where: { selectionId: selection.id, nickname: 'Charlie' },
    });
    expect(orders).toHaveLength(1);
    expect(orders[0].itemId).toBe(extraItem.id);
  });

  // ─── GET /api/food-selections/active ─────────────────────

  it('returns active food selection', async () => {
    const { poll } = await createFinishedPoll();
    const selection = await startFoodSelection(poll.id);

    const res = await supertest(app.server)
      .get('/api/food-selections/active')
      .expect(200);

    expect(res.body.id).toBe(selection.id);
    expect(res.body.status).toBe('active');
  });

  it('returns active food selection only for the signed-in user office', async () => {
    const berlin = await createOfficeLocation('Berlin');
    const munich = await createOfficeLocation('Munich');
    await prisma.authAccessUser.createMany({
      data: [
        { email: 'berlin@company.com', approved: true, blocked: false, isAdmin: false, officeLocationId: berlin.id },
        { email: 'munich@company.com', approved: true, blocked: false, isAdmin: false, officeLocationId: munich.id },
      ],
    });

    const berlinCookie = `team_lunch_auth_session=${createSessionCookieValue({
      username: 'berlin@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    })}`;
    const munichCookie = `team_lunch_auth_session=${createSessionCookieValue({
      username: 'munich@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    })}`;

    const berlinMenu = await supertest(app.server).post('/api/menus').set('Cookie', berlinCookie).send({ name: 'Berlin Menu' }).expect(201);
    await supertest(app.server)
      .post(`/api/menus/${berlinMenu.body.id}/items`)
      .set('Cookie', berlinCookie)
      .send({ name: 'Berlin Meal' })
      .expect(201);
    const berlinPoll = await supertest(app.server)
      .post('/api/polls')
      .set('Cookie', berlinCookie)
      .send({ description: 'Berlin poll', durationMinutes: 60 })
      .expect(201);
    await supertest(app.server)
      .post(`/api/polls/${berlinPoll.body.id}/votes`)
      .set('Cookie', berlinCookie)
      .send({ menuId: berlinMenu.body.id, nickname: 'berlin@company.com' })
      .expect(201);
    await supertest(app.server).post(`/api/polls/${berlinPoll.body.id}/end`).set('Cookie', berlinCookie).expect(200);
    const berlinSelection = await supertest(app.server)
      .post('/api/food-selections')
      .set('Cookie', berlinCookie)
      .send({ pollId: berlinPoll.body.id, durationMinutes: 10 })
      .expect(201);

    const berlinActive = await supertest(app.server)
      .get('/api/food-selections/active')
      .set('Cookie', berlinCookie)
      .expect(200);
    const munichActive = await supertest(app.server)
      .get('/api/food-selections/active')
      .set('Cookie', munichCookie)
      .expect(404);

    expect(berlinActive.body.id).toBe(berlinSelection.body.id);
    expect(munichActive.body.error).toContain('No active food selection');
  });

  it('returns 404 when no active food selection', async () => {
    await supertest(app.server)
      .get('/api/food-selections/active')
      .expect(404);
  });

  // ─── POST /api/food-selections/:id/timer ───────────────

  it('updates active food selection timer successfully', async () => {
    const { poll } = await createFinishedPoll();
    const selection = await startFoodSelection(poll.id, 10);

    const res = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/timer`)
      .send({ remainingMinutes: 25 })
      .expect(200);

    expect(res.body.id).toBe(selection.id);
    expect(res.body.status).toBe('active');
  });

  it('rejects timer update when selection is not active', async () => {
    const { poll } = await createFinishedPoll();
    const selection = await startFoodSelection(poll.id, 10);
    await supertest(app.server).post(`/api/food-selections/${selection.id}/expire`).expect(200);

    const res = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/timer`)
      .send({ remainingMinutes: 20 })
      .expect(400);

    expect(res.body.error).toContain('Only active food selections can update timer');
  });

  // ─── GET /api/food-selections/history ───────────────────

  it('returns completed food selection history (most recent first)', async () => {
    const { poll } = await createFinishedPoll();
    const first = await startFoodSelection(poll.id);
    await supertest(app.server).post(`/api/food-selections/${first.id}/expire`).expect(200);
    await completeFoodSelectionAsApproved(first.id);
    await supertest(app.server).post(`/api/food-selections/${first.id}/place-order`).send({ etaMinutes: 20, nickname: 'admin@example.com' }).expect(200);
    await supertest(app.server).post(`/api/food-selections/${first.id}/confirm-arrival`).expect(200);

    const secondMenu = await createMenu('History Menu');
    await createMenuItem(secondMenu.id, 'History Item');
    const secondPollRes = await supertest(app.server)
      .post('/api/polls')
      .send({ description: 'History Poll', durationMinutes: 60 })
      .expect(201);
    await supertest(app.server)
      .post(`/api/polls/${secondPollRes.body.id}/votes`)
      .send({ menuId: secondMenu.id, nickname: 'Eve' })
      .expect(201);
    await prisma.poll.update({
      where: { id: secondPollRes.body.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });
    await supertest(app.server).post(`/api/polls/${secondPollRes.body.id}/end`).expect(200);

    const second = await startFoodSelection(secondPollRes.body.id);
    await supertest(app.server).post(`/api/food-selections/${second.id}/expire`).expect(200);
    await completeFoodSelectionAsApproved(second.id);
    await supertest(app.server).post(`/api/food-selections/${second.id}/place-order`).send({ etaMinutes: 20, nickname: 'admin@example.com' }).expect(200);
    await supertest(app.server).post(`/api/food-selections/${second.id}/confirm-arrival`).expect(200);

    const res = await supertest(app.server).get('/api/food-selections/history').expect(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].id).toBe(second.id);
    expect(res.body[1].id).toBe(first.id);
  });

  // ─── POST /api/food-selections/:id/expire ────────────────

  it('expires a food selection', async () => {
    const { poll } = await createFinishedPoll();
    const selection = await startFoodSelection(poll.id);

    const res = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/expire`)
      .expect(200);

    expect(res.body.status).toBe('overtime');
  });

  // ─── POST /api/food-selections/:id/extend ────────────────

  it('extends an overtime food selection', async () => {
    const { poll } = await createFinishedPoll();
    const selection = await startFoodSelection(poll.id);

    await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/expire`)
      .expect(200);

    const res = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/extend`)
      .send({ extensionMinutes: 10 })
      .expect(200);

    expect(res.body.status).toBe('active');
  });

  it('rejects extend if not overtime', async () => {
    const { poll } = await createFinishedPoll();
    const selection = await startFoodSelection(poll.id);

    const res = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/extend`)
      .send({ extensionMinutes: 10 })
      .expect(400);
    expect(res.body.error).toContain('Only overtime food selections can be extended');
  });

  // ─── POST /api/food-selections/:id/complete ──────────────

  it('completes an overtime food selection', async () => {
    const { poll } = await createFinishedPoll();
    const selection = await startFoodSelection(poll.id);

    await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/expire`)
      .expect(200);

    const res = await completeFoodSelectionAsApproved(selection.id);

    expect(res.body.status).toBe('ordering');
  });

  it('rejects complete if not overtime', async () => {
    const { poll } = await createFinishedPoll();
    const selection = await startFoodSelection(poll.id);

    const res = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/complete`)
      .set(await approvedAuthHeaders())
      .expect(400);
    expect(res.body.error).toContain('Only overtime food selections can be completed');
  });

  it('completes an active food selection via complete-now', async () => {
    const { poll } = await createFinishedPoll();
    const selection = await startFoodSelection(poll.id);

    const res = await completeFoodSelectionNowAsApproved(selection.id);

    expect(res.body.status).toBe('ordering');
  });

  it('sends manual reminders to voters without orders', async () => {
    const menu = await createMenu('Reminder Menu');
    const item = await createMenuItem(menu.id, 'Reminder Item', 'Tasty');
    const pollRes = await supertest(app.server)
      .post('/api/polls')
      .send({ description: 'Reminder poll', durationMinutes: 60 })
      .expect(201);
    const poll = pollRes.body;
    await supertest(app.server)
      .post(`/api/polls/${poll.id}/votes`)
      .send({ menuId: menu.id, nickname: 'Alice' })
      .expect(201);
    await supertest(app.server)
      .post(`/api/polls/${poll.id}/votes`)
      .send({ menuId: menu.id, nickname: 'bob@example.com' })
      .expect(201);
    await prisma.poll.update({
      where: { id: poll.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });
    await supertest(app.server).post(`/api/polls/${poll.id}/end`).expect(200);

    const selection = await startFoodSelection(poll.id);
    await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/orders`)
      .send({ nickname: 'Alice', itemId: item.id })
      .expect(201);

    const res = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/remind-missing`)
      .send({})
      .expect(200);

    expect(res.body).toEqual({ remindedCount: 1 });
  });

  it('lists fallback-order candidates during ordering', async () => {
    const menu = await createMenu('Fallback Menu');
    const item = await createMenuItem(menu.id, 'Fallback Item', 'Tasty');
    const pollRes = await supertest(app.server)
      .post('/api/polls')
      .send({ description: 'Fallback poll', durationMinutes: 60 })
      .expect(201);
    const poll = pollRes.body;
    await supertest(app.server)
      .post(`/api/polls/${poll.id}/votes`)
      .send({ menuId: menu.id, nickname: 'Alice' })
      .expect(201);
    await supertest(app.server)
      .post(`/api/polls/${poll.id}/votes`)
      .send({ menuId: menu.id, nickname: 'dana@example.com' })
      .expect(201);
    await prisma.poll.update({
      where: { id: poll.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });
    await supertest(app.server).post(`/api/polls/${poll.id}/end`).expect(200);
    const selection = await startFoodSelection(poll.id);
    await userMenuDefaultsService.upsertUserMenuDefaultPreference(
      'dana@example.com',
      menu.id,
      item.id,
      null,
      true,
    );
    await supertest(app.server).post(`/api/food-selections/${selection.id}/expire`).expect(200);
    await completeFoodSelectionAsApproved(selection.id);

    const res = await supertest(app.server)
      .get(`/api/food-selections/${selection.id}/fallback-candidates`)
      .expect(200);

    expect(res.body).toEqual([
      expect.objectContaining({
        nickname: 'dana@example.com',
        itemId: item.id,
        itemName: 'Fallback Item',
      }),
    ]);
  });

  it('places fallback order during ordering', async () => {
    const menu = await createMenu('Fallback Menu');
    const item = await createMenuItem(menu.id, 'Fallback Item', 'Tasty');
    const pollRes = await supertest(app.server)
      .post('/api/polls')
      .send({ description: 'Fallback poll', durationMinutes: 60 })
      .expect(201);
    const poll = pollRes.body;
    await supertest(app.server)
      .post(`/api/polls/${poll.id}/votes`)
      .send({ menuId: menu.id, nickname: 'dana@example.com' })
      .expect(201);
    await prisma.poll.update({
      where: { id: poll.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });
    await supertest(app.server).post(`/api/polls/${poll.id}/end`).expect(200);
    const selection = await startFoodSelection(poll.id);
    await userMenuDefaultsService.upsertUserMenuDefaultPreference(
      'dana@example.com',
      menu.id,
      item.id,
      'No onions',
      true,
    );
    await supertest(app.server).post(`/api/food-selections/${selection.id}/expire`).expect(200);
    await completeFoodSelectionAsApproved(selection.id);

    const res = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/fallback-orders`)
      .send({ nickname: 'dana@example.com', actingNickname: 'organizer@example.com' })
      .expect(201);

    expect(res.body.nickname).toBe('dana@example.com');
    expect(res.body.itemName).toBe('Fallback Item');
    expect(res.body.notes).toContain('No onions');
    expect(res.body.notes).toContain('Default meal placed by organizer');
  });

  it('pings a fallback-order candidate during ordering', async () => {
    const menu = await createMenu('Fallback Menu');
    const item = await createMenuItem(menu.id, 'Fallback Item', 'Tasty');
    const pollRes = await supertest(app.server)
      .post('/api/polls')
      .send({ description: 'Fallback poll', durationMinutes: 60 })
      .expect(201);
    const poll = pollRes.body;
    await supertest(app.server)
      .post(`/api/polls/${poll.id}/votes`)
      .send({ menuId: menu.id, nickname: 'dana@example.com' })
      .expect(201);
    await prisma.poll.update({
      where: { id: poll.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });
    await supertest(app.server).post(`/api/polls/${poll.id}/end`).expect(200);
    const selection = await startFoodSelection(poll.id);
    await userMenuDefaultsService.upsertUserMenuDefaultPreference(
      'dana@example.com',
      menu.id,
      item.id,
      null,
      true,
    );
    await supertest(app.server).post(`/api/food-selections/${selection.id}/expire`).expect(200);
    await completeFoodSelectionAsApproved(selection.id);

    const res = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/fallback-reminders`)
      .send({ nickname: 'dana@example.com', actingNickname: 'organizer@example.com' })
      .expect(200);

    expect(res.body).toEqual({ targetNickname: 'dana@example.com' });
  });

  it('marks an order as processed during ordering phase', async () => {
    const { poll, item } = await createFinishedPoll();
    const selection = await startFoodSelection(poll.id);
    const orderRes = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/orders`)
      .send({ nickname: 'Alice', itemId: item.id })
      .expect(201);
    await supertest(app.server).post(`/api/food-selections/${selection.id}/expire`).expect(200);
    await completeFoodSelectionAsApproved(selection.id);

    const res = await supertest(app.server)
      .patch(`/api/food-selections/${selection.id}/orders/${orderRes.body.id}/processed`)
      .send({ processed: true, nickname: 'admin@example.com' })
      .expect(200);

    expect(res.body.id).toBe(orderRes.body.id);
    expect(res.body.processed).toBe(true);
    expect(res.body.processedAt).toEqual(expect.any(String));
  });

  it('rejects processing checkmarks outside ordering phase', async () => {
    const { poll, item } = await createFinishedPoll();
    const selection = await startFoodSelection(poll.id);
    const orderRes = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/orders`)
      .send({ nickname: 'Alice', itemId: item.id })
      .expect(201);

    const res = await supertest(app.server)
      .patch(`/api/food-selections/${selection.id}/orders/${orderRes.body.id}/processed`)
      .send({ processed: true })
      .expect(400);

    expect(res.body.error).toContain('ordering phase');
  });

  it('aborts an active food selection and resets persisted process state', async () => {
    const { poll } = await createFinishedPoll();
    const selection = await startFoodSelection(poll.id);

    await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/orders`)
      .send({ nickname: 'Alice', itemId: (await prisma.menuItem.findFirstOrThrow()).id })
      .expect(201);

    const res = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/abort`)
      .expect(200);

    expect(res.body.status).toBe('aborted');

    const persistedSelection = await prisma.foodSelection.findUnique({ where: { id: selection.id } });
    const persistedOrders = await prisma.foodOrder.findMany({ where: { selectionId: selection.id } });
    const persistedPoll = await prisma.poll.findUnique({ where: { id: poll.id } });

    expect(persistedSelection).toBeNull();
    expect(persistedOrders).toHaveLength(0);
    expect(persistedPoll?.status).toBe('aborted');
  });

  it('aborts a delivering food selection', async () => {
    const { poll } = await createFinishedPoll();
    const selection = await startFoodSelection(poll.id);
    await supertest(app.server).post(`/api/food-selections/${selection.id}/expire`).expect(200);
    await completeFoodSelectionAsApproved(selection.id);
    await supertest(app.server).post(`/api/food-selections/${selection.id}/place-order`).send({ etaMinutes: 20, nickname: 'admin@example.com' }).expect(200);

    const res = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/abort`)
      .expect(200);

    expect(res.body.status).toBe('aborted');
  });

  // ─── POST /api/food-selections/:id/eta ──────────────────

  it('updates ETA for an ongoing delivery selection', async () => {
    const { poll } = await createFinishedPoll();
    const selection = await startFoodSelection(poll.id);
    await supertest(app.server).post(`/api/food-selections/${selection.id}/expire`).expect(200);
    await completeFoodSelectionAsApproved(selection.id);
    await supertest(app.server).post(`/api/food-selections/${selection.id}/place-order`).send({ etaMinutes: 20, nickname: 'admin@example.com' }).expect(200);

    const res = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/eta`)
      .send({ etaMinutes: 25, nickname: 'admin@example.com' })
      .expect(200);

    expect(res.body.etaMinutes).toBe(25);
    expect(res.body.status).toBe('delivering');
  });

  it('rejects ETA update when delivery phase is not active', async () => {
    const { poll } = await createFinishedPoll();
    const selection = await startFoodSelection(poll.id);

    const res = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/eta`)
      .send({ etaMinutes: 25, nickname: 'admin@example.com' })
      .expect(400);

    expect(res.body.error).toContain('ETA can only be updated for ongoing delivery phase');
  });

  it('rejects invalid ETA minutes', async () => {
    const { poll } = await createFinishedPoll();
    const selection = await startFoodSelection(poll.id);
    await supertest(app.server).post(`/api/food-selections/${selection.id}/expire`).expect(200);
    await completeFoodSelectionAsApproved(selection.id);
    await supertest(app.server).post(`/api/food-selections/${selection.id}/place-order`).send({ etaMinutes: 20, nickname: 'admin@example.com' }).expect(200);

    const res = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/eta`)
      .send({ etaMinutes: 0, nickname: 'admin@example.com' })
      .expect(400);

    expect(res.body.error).toContain('ETA must be an integer between 1 and 240 minutes');
  });

  it('confirms lunch arrival and finalizes selection', async () => {
    const { poll } = await createFinishedPoll();
    const selection = await startFoodSelection(poll.id);
    await supertest(app.server).post(`/api/food-selections/${selection.id}/expire`).expect(200);
    await completeFoodSelectionAsApproved(selection.id);
    await supertest(app.server).post(`/api/food-selections/${selection.id}/place-order`).send({ etaMinutes: 20, nickname: 'admin@example.com' }).expect(200);

    const res = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/confirm-arrival`)
      .expect(200);

    expect(res.body.status).toBe('completed');
    expect(res.body.completedAt).toEqual(expect.any(String));
  });

  it('places delivery order from ordering phase', async () => {
    const { poll } = await createFinishedPoll();
    const selection = await startFoodSelection(poll.id);
    await supertest(app.server).post(`/api/food-selections/${selection.id}/expire`).expect(200);
    await completeFoodSelectionAsApproved(selection.id);

    const res = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/place-order`)
      .send({ etaMinutes: 35, nickname: 'admin@example.com' })
      .expect(200);

    expect(res.body.status).toBe('delivering');
    expect(res.body.orderPlacedAt).toEqual(expect.any(String));
    expect(res.body.etaMinutes).toBe(35);
  });

  it('claims ordering responsibility before the order is placed', async () => {
    const { poll } = await createFinishedPoll();
    const selection = await startFoodSelection(poll.id);
    await supertest(app.server).post(`/api/food-selections/${selection.id}/expire`).expect(200);
    await completeFoodSelectionAsApproved(selection.id);

    const res = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/claim-ordering`)
      .send({ nickname: 'alice@example.com' })
      .expect(200);

    expect(res.body.status).toBe('ordering');
    expect(res.body.orderPlacedBy).toBe('alice@example.com');
    expect(res.body.orderPlacedAt).toBeNull();
  });

  it('rejects placing the order when another user already claimed ordering responsibility', async () => {
    const { poll } = await createFinishedPoll();
    const selection = await startFoodSelection(poll.id);
    await supertest(app.server).post(`/api/food-selections/${selection.id}/expire`).expect(200);
    await completeFoodSelectionAsApproved(selection.id);
    await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/claim-ordering`)
      .send({ nickname: 'alice@example.com' })
      .expect(200);

    const res = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/place-order`)
      .send({ etaMinutes: 35, nickname: 'bob@example.com' })
      .expect(409);

    expect(res.body.error).toContain('already being placed by alice@example.com');
  });
  it('marks an order as delivered during delivery phase', async () => {
    const { poll, item } = await createFinishedPoll();
    const selection = await startFoodSelection(poll.id);
    const orderRes = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/orders`)
      .send({ nickname: 'Alice', itemId: item.id })
      .expect(201);
    await supertest(app.server).post(`/api/food-selections/${selection.id}/expire`).expect(200);
    await completeFoodSelectionAsApproved(selection.id);
    await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/place-order`)
      .send({ etaMinutes: 20, nickname: 'admin@example.com' })
      .expect(200);

    const res = await supertest(app.server)
      .patch(`/api/food-selections/${selection.id}/orders/${orderRes.body.id}/delivered`)
      .send({ delivered: true, nickname: 'admin@example.com' })
      .expect(200);

    expect(res.body.id).toBe(orderRes.body.id);
    expect(res.body.delivered).toBe(true);
    expect(res.body.deliveredAt).toEqual(expect.any(String));
  });

  it('rejects delivered checkmarks outside delivery phase', async () => {
    const { poll, item } = await createFinishedPoll();
    const selection = await startFoodSelection(poll.id);
    const orderRes = await supertest(app.server)
      .post(`/api/food-selections/${selection.id}/orders`)
      .send({ nickname: 'Alice', itemId: item.id })
      .expect(201);

    const res = await supertest(app.server)
      .patch(`/api/food-selections/${selection.id}/orders/${orderRes.body.id}/delivered`)
      .send({ delivered: true })
      .expect(400);

    expect(res.body.error).toContain('delivery phase');
  });

  // ─── POST /api/food-selections/quick-start ───────────────

  describe('quick-start (single menu skip)', () => {
    it('creates food selection when exactly one menu with items exists', async () => {
      const menu = await createMenu('Solo Menu');
      await createMenuItem(menu.id, 'Item A');

      const res = await supertest(app.server)
        .post('/api/food-selections/quick-start')
        .send({ durationMinutes: 10 })
        .expect(201);

      expect(res.body.status).toBe('active');
      expect(res.body.menuName).toBe('Solo Menu');

      // Verify auto-created poll exists
      const polls = await prisma.poll.findMany();
      expect(polls).toHaveLength(1);
      expect(polls[0].status).toBe('finished');
      expect(polls[0].winnerMenuName).toBe('Solo Menu');
    });

    it('rejects with 400 when no menus with items exist', async () => {
      const res = await supertest(app.server)
        .post('/api/food-selections/quick-start')
        .send({ durationMinutes: 10 })
        .expect(400);

      expect(res.body.error).toContain('No menus with items exist');
    });

    it('rejects with 400 when multiple menus with items exist', async () => {
      const menu1 = await createMenu('Menu A');
      await createMenuItem(menu1.id, 'Item A');
      const menu2 = await createMenu('Menu B');
      await createMenuItem(menu2.id, 'Item B');

      const res = await supertest(app.server)
        .post('/api/food-selections/quick-start')
        .send({ durationMinutes: 10 })
        .expect(400);

      expect(res.body.error).toContain('exactly one menu');
    });

    it('ignores empty menus (no items) when counting', async () => {
      await createMenu('Empty Menu'); // no items
      const menu = await createMenu('Real Menu');
      await createMenuItem(menu.id, 'Burger');

      const res = await supertest(app.server)
        .post('/api/food-selections/quick-start')
        .send({ durationMinutes: 15 })
        .expect(201);

      expect(res.body.menuName).toBe('Real Menu');
    });

    it('rejects with 400 for invalid duration', async () => {
      const menu = await createMenu('Solo');
      await createMenuItem(menu.id, 'Thing');

      const res = await supertest(app.server)
        .post('/api/food-selections/quick-start')
        .send({ durationMinutes: 7 })
        .expect(400);

      expect(res.body.error).toContain('Duration must be 1 minute or a multiple of 5 between 5 and 30 minutes');
    });

    it('rejects with 409 when an active poll exists', async () => {
      const menu = await createMenu('Solo');
      await createMenuItem(menu.id, 'Thing');

      // Start a regular poll first
      await supertest(app.server)
        .post('/api/polls')
        .send({ description: 'Existing poll', durationMinutes: 5 })
        .expect(201);

      const res = await supertest(app.server)
        .post('/api/food-selections/quick-start')
        .send({ durationMinutes: 10 })
        .expect(409);

      expect(res.body.error).toContain('already in progress');
    });
  });
});




