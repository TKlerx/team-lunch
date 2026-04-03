import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../src/server/index.js';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';
import { clearAllTimers } from '../../src/server/services/poll.js';
import { createOfficeLocation, ensureDefaultOfficeLocation } from '../../src/server/services/officeLocation.js';
import { createSessionCookieValue } from '../../src/server/services/authSession.js';
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
      endedPrematurely: poll.endedPrematurely,
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
}));

let app: FastifyInstance;

describe('Poll routes (integration)', () => {
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    clearAllTimers();
    await cleanDatabase();
  });

  afterAll(async () => {
    clearAllTimers();
    await cleanDatabase();
    await app.close();
    await disconnectDatabase();
  });

  // Helper: create a menu for voting
  async function createMenu(name: string) {
    const res = await supertest(app.server).post('/api/menus').send({ name }).expect(201);
    return res.body;
  }

  // Helper: start a poll
  async function startPoll(
    description = 'What do we eat?',
    durationMinutes = 60,
    excludedMenuJustifications: Array<{ menuId: string; reason: string }> = [],
  ) {
    const res = await supertest(app.server)
      .post('/api/polls')
      .send({ description, durationMinutes, excludedMenuJustifications })
      .expect(201);
    return res.body;
  }

  // ─── POST /api/polls ────────────────────────────────────

  it('creates a poll successfully', async () => {
    const poll = await startPoll('Lunch poll', 120);
    expect(poll.description).toBe('Lunch poll');
    expect(poll.status).toBe('active');
    expect(poll.id).toBeDefined();
  });

  it('rejects with 409 if active poll exists', async () => {
    await startPoll();
    const res = await supertest(app.server)
      .post('/api/polls')
      .send({ description: 'Another', durationMinutes: 60 })
      .expect(409);
    expect(res.body.error).toContain('already in progress');
  });

  it('returns active poll only for the signed-in user office', async () => {
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

    await supertest(app.server).post('/api/menus').set('Cookie', berlinCookie).send({ name: 'Berlin Menu' }).expect(201);
    await supertest(app.server).post('/api/menus').set('Cookie', munichCookie).send({ name: 'Munich Menu' }).expect(201);

    const berlinPoll = await supertest(app.server)
      .post('/api/polls')
      .set('Cookie', berlinCookie)
      .send({ description: 'Berlin lunch', durationMinutes: 60, excludedMenuJustifications: [] })
      .expect(201);

    const munichActive = await supertest(app.server)
      .get('/api/polls/active')
      .set('Cookie', munichCookie)
      .expect(404);
    const berlinActive = await supertest(app.server)
      .get('/api/polls/active')
      .set('Cookie', berlinCookie)
      .expect(200);

    expect(munichActive.body.error).toContain('No active poll');
    expect(berlinActive.body.id).toBe(berlinPoll.body.id);
  });

  it('rejects with 400 for invalid duration', async () => {
    const res = await supertest(app.server)
      .post('/api/polls')
      .send({ description: 'Test', durationMinutes: 3 })
      .expect(400);
    expect(res.body.error).toContain('multiple of 5');
  });

  it('rejects with 400 for empty description', async () => {
    const res = await supertest(app.server)
      .post('/api/polls')
      .send({ description: '', durationMinutes: 60 })
      .expect(400);
    expect(res.body.error).toContain('1–120 characters');
  });

  // ─── GET /api/polls/active ──────────────────────────────

  it('returns active poll', async () => {
    const poll = await startPoll();
    const res = await supertest(app.server).get('/api/polls/active').expect(200);
    expect(res.body.id).toBe(poll.id);
  });

  it('returns 404 when no active poll', async () => {
    await supertest(app.server).get('/api/polls/active').expect(404);
  });

  // ─── POST /api/polls/:id/votes ──────────────────────────

  it('casts a vote successfully', async () => {
    const menu = await createMenu('Italian');
    const poll = await startPoll();

    const res = await supertest(app.server)
      .post(`/api/polls/${poll.id}/votes`)
      .send({ menuId: menu.id, nickname: 'Alice' })
      .expect(201);
    expect(res.body.voteCounts[menu.id]).toBe(1);
  });

  it('rejects vote after timer expiry', async () => {
    const menu = await createMenu('Italian');
    const defaultOffice = await ensureDefaultOfficeLocation();

    // Create an already-expired poll directly in DB
    const now = new Date();
    const expiredPoll = await prisma.poll.create({
      data: {
        officeLocationId: defaultOffice.id,
        description: 'Expired',
        status: 'active',
        startedAt: new Date(now.getTime() - 120000),
        endsAt: new Date(now.getTime() - 1000),
      },
    });

    const res = await supertest(app.server)
      .post(`/api/polls/${expiredPoll.id}/votes`)
      .send({ menuId: menu.id, nickname: 'Alice' })
      .expect(400);
    expect(res.body.error).toContain('expired');
  });

  it('rejects duplicate vote for same menu by same user', async () => {
    const menu = await createMenu('Italian');
    const poll = await startPoll();

    await supertest(app.server)
      .post(`/api/polls/${poll.id}/votes`)
      .send({ menuId: menu.id, nickname: 'Alice' })
      .expect(201);

    const res = await supertest(app.server)
      .post(`/api/polls/${poll.id}/votes`)
      .send({ menuId: menu.id, nickname: 'Alice' })
      .expect(409);
    expect(res.body.error).toContain('already voted');
  });

  // ─── DELETE /api/polls/:id/votes ────────────────────────

  it('withdraws a vote successfully', async () => {
    const menu = await createMenu('Italian');
    const poll = await startPoll();

    await supertest(app.server)
      .post(`/api/polls/${poll.id}/votes`)
      .send({ menuId: menu.id, nickname: 'Alice' })
      .expect(201);

    const res = await supertest(app.server)
      .delete(`/api/polls/${poll.id}/votes`)
      .send({ menuId: menu.id, nickname: 'Alice' })
      .expect(200);
    expect(res.body.voteCounts[menu.id]).toBeUndefined();
  });

  it('withdraws all votes for a user', async () => {
    const menuA = await createMenu('Italian');
    const menuB = await createMenu('Chinese');
    const poll = await startPoll();

    await supertest(app.server)
      .post(`/api/polls/${poll.id}/votes`)
      .send({ menuId: menuA.id, nickname: 'Alice' })
      .expect(201);
    await supertest(app.server)
      .post(`/api/polls/${poll.id}/votes`)
      .send({ menuId: menuB.id, nickname: 'Alice' })
      .expect(201);

    const res = await supertest(app.server)
      .delete(`/api/polls/${poll.id}/votes/all`)
      .send({ nickname: 'Alice' })
      .expect(200);

    expect(res.body.voteCounts[menuA.id]).toBeUndefined();
    expect(res.body.voteCounts[menuB.id]).toBeUndefined();
  });

  // ─── Vote cast/withdraw round-trip ──────────────────────

  it('vote cast/withdraw round-trip updates totals correctly', async () => {
    const menuA = await createMenu('Italian');
    const menuB = await createMenu('Chinese');
    const poll = await startPoll();

    // Alice votes for both menus
    await supertest(app.server)
      .post(`/api/polls/${poll.id}/votes`)
      .send({ menuId: menuA.id, nickname: 'Alice' })
      .expect(201);
    await supertest(app.server)
      .post(`/api/polls/${poll.id}/votes`)
      .send({ menuId: menuB.id, nickname: 'Alice' })
      .expect(201);

    // Bob votes for Italian
    const afterBob = await supertest(app.server)
      .post(`/api/polls/${poll.id}/votes`)
      .send({ menuId: menuA.id, nickname: 'Bob' })
      .expect(201);
    expect(afterBob.body.voteCounts[menuA.id]).toBe(2);
    expect(afterBob.body.voteCounts[menuB.id]).toBe(1);

    // Alice withdraws Italian vote
    const afterWithdraw = await supertest(app.server)
      .delete(`/api/polls/${poll.id}/votes`)
      .send({ menuId: menuA.id, nickname: 'Alice' })
      .expect(200);
    expect(afterWithdraw.body.voteCounts[menuA.id]).toBe(1);
    expect(afterWithdraw.body.voteCounts[menuB.id]).toBe(1);
  });

  // ─── POST /api/polls/:id/extend ────────────────────────

  it('extends a tied poll', async () => {
    const menuA = await createMenu('Italian');
    const menuB = await createMenu('Chinese');
    const poll = await startPoll();

    await supertest(app.server)
      .post(`/api/polls/${poll.id}/votes`)
      .send({ menuId: menuA.id, nickname: 'Alice' })
      .expect(201);
    await supertest(app.server)
      .post(`/api/polls/${poll.id}/votes`)
      .send({ menuId: menuB.id, nickname: 'Bob' })
      .expect(201);

    await prisma.poll.update({
      where: { id: poll.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });

    // End poll → tied
    await supertest(app.server).post(`/api/polls/${poll.id}/end`).expect(200);

    // Extend
    const res = await supertest(app.server)
      .post(`/api/polls/${poll.id}/extend`)
      .send({ extensionMinutes: 10 })
      .expect(200);
    expect(res.body.status).toBe('active');
  });

  it('allows ending an active poll before timer expiry', async () => {
    const poll = await startPoll();
    const res = await supertest(app.server)
      .post(`/api/polls/${poll.id}/end`)
      .expect(200);

    expect(res.body.status).toBe('finished');
    expect(res.body.endedPrematurely).toBe(true);
  });

  it('accepts excluded menu justifications on poll creation', async () => {
    const menuA = await createMenu('Italian');
    const menuB = await createMenu('Sushi');

    const poll = await startPoll('Lunch poll', 5, [
      { menuId: menuB.id, reason: 'Closed today' },
    ]);

    expect(poll.excludedMenuJustifications).toEqual([
      { menuId: menuB.id, menuName: 'Sushi', reason: 'Closed today' },
    ]);
    expect(poll.id).toBeDefined();
    expect(menuA.id).toBeDefined();
  });

  it('rejects exclusion without reason', async () => {
    const menu = await createMenu('Italian');
    const res = await supertest(app.server)
      .post('/api/polls')
      .send({
        description: 'Lunch poll',
        durationMinutes: 5,
        excludedMenuJustifications: [{ menuId: menu.id, reason: '  ' }],
      })
      .expect(400);
    expect(res.body.error).toContain('justification');
  });

  it('rejects extension if poll is not tied', async () => {
    const poll = await startPoll();
    const res = await supertest(app.server)
      .post(`/api/polls/${poll.id}/extend`)
      .send({ extensionMinutes: 10 })
      .expect(400);
    expect(res.body.error).toContain('Only tied polls');
  });

  // ─── POST /api/polls/:id/timer ─────────────────────────

  it('updates active poll timer successfully', async () => {
    const poll = await startPoll('Timer update', 60);

    const res = await supertest(app.server)
      .post(`/api/polls/${poll.id}/timer`)
      .send({ remainingMinutes: 20 })
      .expect(200);

    expect(res.body.id).toBe(poll.id);
    expect(res.body.status).toBe('active');
  });

  it('rejects active timer update when poll is not active', async () => {
    const poll = await startPoll('Timer update', 60);
    await prisma.poll.update({
      where: { id: poll.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });
    await supertest(app.server).post(`/api/polls/${poll.id}/end`).expect(200);

    const res = await supertest(app.server)
      .post(`/api/polls/${poll.id}/timer`)
      .send({ remainingMinutes: 20 })
      .expect(400);

    expect(res.body.error).toContain('Only active polls can update timer');
  });

  // ─── POST /api/polls/:id/random-winner ──────────────────

  it('picks random winner from tied poll', async () => {
    const menuA = await createMenu('Italian');
    const menuB = await createMenu('Chinese');
    const poll = await startPoll();

    await supertest(app.server)
      .post(`/api/polls/${poll.id}/votes`)
      .send({ menuId: menuA.id, nickname: 'Alice' });
    await supertest(app.server)
      .post(`/api/polls/${poll.id}/votes`)
      .send({ menuId: menuB.id, nickname: 'Bob' });

    await prisma.poll.update({
      where: { id: poll.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });

    await supertest(app.server).post(`/api/polls/${poll.id}/end`).expect(200);

    const res = await supertest(app.server)
      .post(`/api/polls/${poll.id}/random-winner`)
      .expect(200);
    expect(res.body.status).toBe('finished');
    expect(res.body.winnerSelectedRandomly).toBe(true);
    expect([menuA.id, menuB.id]).toContain(res.body.winnerMenuId);
  });

  // ─── POST /api/polls/:id/end ────────────────────────────

  it('ends an active poll after timer expiry', async () => {
    const poll = await startPoll('What do we eat?', 5);
    await prisma.poll.update({
      where: { id: poll.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });

    const res = await supertest(app.server)
      .post(`/api/polls/${poll.id}/end`)
      .expect(200);
    expect(res.body.status).toBe('finished');
  });

  // ─── POST /api/polls/:id/abort ───────────────────────────

  it('aborts an active poll', async () => {
    const poll = await startPoll();
    const res = await supertest(app.server)
      .post(`/api/polls/${poll.id}/abort`)
      .expect(200);
    expect(res.body.status).toBe('aborted');
  });

  it('rejects aborting a finished poll', async () => {
    const poll = await startPoll();
    await prisma.poll.update({
      where: { id: poll.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });
    await supertest(app.server).post(`/api/polls/${poll.id}/end`);
    const res = await supertest(app.server)
      .post(`/api/polls/${poll.id}/abort`)
      .expect(400);
    expect(res.body.error).toContain('Only active or tied');
  });

  it('allows starting a new poll after aborting', async () => {
    const poll = await startPoll();
    await supertest(app.server).post(`/api/polls/${poll.id}/abort`).expect(200);
    const res = await supertest(app.server)
      .post('/api/polls')
      .send({ description: 'New poll', durationMinutes: 5 })
      .expect(201);
    expect(res.body.status).toBe('active');
  });
});



