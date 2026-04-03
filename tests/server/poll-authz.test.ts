import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';
import { buildApp } from '../../src/server/index.js';
import { createSessionCookieValue } from '../../src/server/services/authSession.js';
import prisma from '../../src/server/db.js';
import * as menuService from '../../src/server/services/menu.js';
import * as pollService from '../../src/server/services/poll.js';
import { ensureDefaultOfficeLocation } from '../../src/server/services/officeLocation.js';

describe('poll route authorization', () => {
  const originalEnv = {
    AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
    AUTH_ADMIN_EMAIL: process.env.AUTH_ADMIN_EMAIL,
    AUTHZ_ENFORCE_ADMIN: process.env.AUTHZ_ENFORCE_ADMIN,
  };

  beforeEach(() => {
    process.env.AUTH_SESSION_SECRET = '12345678901234567890123456789012';
    process.env.AUTH_ADMIN_EMAIL = 'admin@company.com';
    process.env.AUTHZ_ENFORCE_ADMIN = 'true';
  });

  afterEach(async () => {
    pollService.clearAllTimers();
    await cleanDatabase();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  afterAll(async () => {
    pollService.clearAllTimers();
    await cleanDatabase();
    await disconnectDatabase();
  });

  it('rejects poll abort for unauthenticated users when approval workflow is enabled', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/polls/00000000-0000-0000-0000-000000000000/abort',
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'Authentication required' });
    await app.close();
  });

  it('rejects poll abort for non-admin users', async () => {
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'user@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/polls/00000000-0000-0000-0000-000000000000/abort',
      headers: { cookie: `team_lunch_auth_session=${session}` },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'Admin role required' });
    await app.close();
  });

  it('allows admin users to pass authorization check for poll abort', async () => {
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'admin@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/polls/00000000-0000-0000-0000-000000000000/abort',
      headers: { cookie: `team_lunch_auth_session=${session}` },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toContain('Poll not found');
    await app.close();
  });

  it('allows the poll creator to extend a tied poll', async () => {
    const app = await buildApp();
    const defaultOffice = await ensureDefaultOfficeLocation();
    await prisma.authAccessUser.create({
      data: {
        email: 'creator@company.com',
        approved: true,
        blocked: false,
        isAdmin: false,
        officeLocationId: defaultOffice.id,
      },
    });
    const menuA = await menuService.createMenu('Menu A');
    const menuB = await menuService.createMenu('Menu B');
    const poll = await pollService.startPoll('Creator poll', 60, undefined, undefined, 'creator@company.com');
    await pollService.castVote(poll.id, menuA.id, 'Alice');
    await pollService.castVote(poll.id, menuB.id, 'Bob');
    await pollService.endPoll(poll.id);
    const session = createSessionCookieValue({
      username: 'creator@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/polls/${poll.id}/extend`,
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: { extensionMinutes: 10 },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('active');
    await app.close();
  });

  it('rejects poll timer updates for approved non-creators', async () => {
    const app = await buildApp();
    const defaultOffice = await ensureDefaultOfficeLocation();
    await prisma.authAccessUser.create({
      data: {
        email: 'creator@company.com',
        approved: true,
        blocked: false,
        isAdmin: false,
        officeLocationId: defaultOffice.id,
      },
    });
    await prisma.authAccessUser.create({
      data: {
        email: 'other@company.com',
        approved: true,
        blocked: false,
        isAdmin: false,
        officeLocationId: defaultOffice.id,
      },
    });
    const poll = await pollService.startPoll('Creator poll', 60, undefined, undefined, 'creator@company.com');
    const session = createSessionCookieValue({
      username: 'other@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/polls/${poll.id}/timer`,
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: { remainingMinutes: 15 },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'Admin or creator role required' });
    await app.close();
  });
});
