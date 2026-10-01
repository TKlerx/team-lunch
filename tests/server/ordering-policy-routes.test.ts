import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/index.js';
import prisma from '../../src/server/db.js';
import { createSessionCookieValue } from '../../src/server/services/authSession.js';
import { createOfficeLocation } from '../../src/server/services/officeLocation.js';
import { evaluateOrderingPolicy } from '../../src/server/services/orderingPolicy.js';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';

const NOW = new Date('2026-10-01T10:00:00Z');
const EMAIL = 'member@example.com';
const originalEnv = {
  AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
  AUTH_ADMIN_EMAIL: process.env.AUTH_ADMIN_EMAIL,
};
const originalFindFirst = prisma.foodSelection.findFirst;
let app: FastifyInstance;
let officeId: string;
let otherOfficeId: string;
let userId: string;

function cookie(username = EMAIL) {
  return `team_lunch_auth_session=${createSessionCookieValue({
    username, method: 'entra', iat: Math.floor(Date.now() / 1000),
  })}`;
}

function read(target?: string, auth: string | null = cookie()) {
  return app.inject({
    method: 'GET',
    url: `/api/polls/ordering-policy${target ? `?officeLocationId=${target}` : ''}`,
    headers: auth === null ? {} : { cookie: auth },
  });
}

beforeAll(async () => {
  process.env.AUTH_SESSION_SECRET = '12345678901234567890123456789012';
  process.env.AUTH_ADMIN_EMAIL = 'admin@example.com';
  app = await buildApp();
  await app.ready();
});
beforeEach(async () => {
  await cleanDatabase();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  officeId = (await createOfficeLocation('Vienna')).id;
  otherOfficeId = (await createOfficeLocation('Berlin')).id;
  await prisma.officeLocation.update({
    where: { id: officeId },
    data: { orderingAnchorDate: new Date('2026-09-28T00:00:00Z'), timeZone: 'Europe/Vienna' },
  });
  userId = (await prisma.authAccessUser.create({
    data: { email: EMAIL, approved: true, officeLocationId: officeId },
  })).id;
});
afterEach(() => {
  vi.restoreAllMocks();
  prisma.foodSelection.findFirst = originalFindFirst;
  vi.useRealTimers();
});
afterAll(async () => {
  await cleanDatabase();
  await app.close();
  await disconnectDatabase();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('public ordering policy route', () => {
  it('returns current public availability for the assigned office, not a poll-id lookup', async () => {
    const expected = (await evaluateOrderingPolicy(officeId)).availability;
    const response = await read();
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toEqual(expected);
    expect(expected).toMatchObject({ status: 'eligible', timeZone: 'Europe/Vienna' });
    const historical = await app.inject({
      method: 'GET', url: `/api/polls/00000000-0000-4000-8000-000000000000?officeLocationId=${officeId}`, headers: { cookie: cookie() },
    });
    expect(historical.statusCode).toBe(404);
    expect(historical.json()).toEqual({ error: 'Poll not found' });
  });

  it.each([null, 'team_lunch_auth_session=forged'])('rejects unauthenticated or invalid sessions (%s)', async auth => {
    const response = await read(officeId, auth);
    expect(response.statusCode).toBe(401);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toEqual({ error: expect.any(String) });
  });

  it.each([{ approved: false }, { blocked: true }, { sessionVersion: 1 }])('retains session/approval restrictions: %j', async data => {
    await prisma.authAccessUser.update({ where: { id: userId }, data });
    const response = await read();
    expect(response.statusCode).toBe(data.sessionVersion ? 401 : 403);
    expect(response.json()).toEqual({ error: expect.any(String) });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('requires authentication even without the approval workflow', async () => {
    delete process.env.AUTH_ADMIN_EMAIL;
    try {
      expect((await read(officeId, null)).statusCode).toBe(401);
      expect((await read()).statusCode).toBe(200);
    } finally {
      process.env.AUTH_ADMIN_EMAIL = 'admin@example.com';
    }
  });

});

describe('ordering policy office authorization', () => {
  it('rejects a user with no office assignment through the existing approval rules', async () => {
    await prisma.authAccessUser.update({ where: { id: userId }, data: { officeLocationId: null } });
    const response = await read();
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'User is awaiting approval' });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('rejects another office outside the assignment set', async () => {
    const response = await read(otherOfficeId);
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Requested office is not assigned to the user' });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('honors explicit office context within memberships and global-admin selection', async () => {
    await prisma.authAccessUserOffice.createMany({ data: [
      { authAccessUserId: userId, officeLocationId: officeId },
      { authAccessUserId: userId, officeLocationId: otherOfficeId },
    ] });
    await prisma.officeLocation.update({ where: { id: otherOfficeId }, data: { orderingIntervalWeeks: 0 } });
    for (const auth of [cookie(), cookie('admin@example.com')]) {
      const response = await read(otherOfficeId, auth);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual((await evaluateOrderingPolicy(otherOfficeId)).availability);
      expect(response.json()).toMatchObject({ officeLocationId: otherOfficeId, status: 'unrestricted', nextEligibleAt: null });
    }
    expect((await read()).json().officeLocationId).toBe(officeId);
  });

  it('returns not_started for a future anchor and 404 for a missing admin-selected office', async () => {
    await prisma.officeLocation.update({
      where: { id: officeId }, data: { orderingAnchorDate: new Date('2026-10-05T00:00:00Z') },
    });
    expect((await read()).json()).toMatchObject({
      status: 'not_started', nextEligibleAt: '2026-10-04T22:00:00.000Z', blockStart: null, blockEnd: null,
    });
    const missing = await read('missing', cookie('admin@example.com'));
    expect(missing.statusCode).toBe(404);
    expect(missing.headers['cache-control']).toBe('no-store');
    expect(missing.json()).toEqual({ error: expect.any(String) });
  });

});

describe('ordering policy privacy and failures', () => {
  it('counts only selected-office completions and keeps exception/evidence fields private for all roles', async () => {
    const poll = await prisma.poll.create({ data: {
      officeLocationId: otherOfficeId, description: 'Private lunch', status: 'finished', startedAt: NOW, endsAt: NOW,
      orderingPolicyException: { reason: 'Secret reason', actorKey: EMAIL, displayNameSnapshot: 'Private actor' },
    } });
    const selection = await prisma.foodSelection.create({ data: {
      officeLocationId: otherOfficeId, pollId: poll.id, menuName: 'Meal', status: 'completed',
      startedAt: NOW, endsAt: NOW, completedAt: NOW,
    } });
    expect((await read()).json().status).toBe('eligible');
    await prisma.foodSelection.update({ where: { id: selection.id }, data: { officeLocationId: officeId } });
    for (const auth of [cookie(), cookie('admin@example.com')]) {
      const response = await read(officeId, auth);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual((await evaluateOrderingPolicy(officeId)).availability);
      expect(response.json().status).toBe('period_used');
      expect(response.body).not.toContain(selection.id);
      expect(response.body).not.toContain('Secret reason');
      expect(response.body).not.toContain('actorKey');
      expect(response.body).not.toContain('previousCompleted');
      expect(response.headers['cache-control']).toBe('no-store');
    }
  });

  it('returns evaluation errors without fabricated eligibility', async () => {
    vi.spyOn(prisma.foodSelection, 'findFirst').mockRejectedValueOnce(new Error('Policy lookup unavailable'));
    const response = await read();
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'Policy lookup unavailable' });
    expect(response.headers['cache-control']).toBe('no-store');
  });
});
