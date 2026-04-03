import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';
import { buildApp } from '../../src/server/index.js';
import { createSessionCookieValue } from '../../src/server/services/authSession.js';
import prisma from '../../src/server/db.js';
import { ensureDefaultOfficeLocation } from '../../src/server/services/officeLocation.js';
import * as menuService from '../../src/server/services/menu.js';
import * as pollService from '../../src/server/services/poll.js';
import * as foodSelectionService from '../../src/server/services/foodSelection.js';

describe('food selection route authorization', () => {
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
    foodSelectionService.clearAllTimers();
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
    foodSelectionService.clearAllTimers();
    pollService.clearAllTimers();
    await cleanDatabase();
    await disconnectDatabase();
  });

  it('allows unauthenticated start-food-selection requests to continue to business validation', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/food-selections',
      payload: { pollId: '00000000-0000-0000-0000-000000000000', durationMinutes: 10 },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Poll not found' });
    await app.close();
  });

  it('allows approved non-admin users to start food selection', async () => {
    const app = await buildApp();
    const defaultOffice = await ensureDefaultOfficeLocation();
    await prisma.authAccessUser.create({
      data: {
        email: 'approved-user@company.com',
        approved: true,
        blocked: false,
        isAdmin: false,
        officeLocationId: defaultOffice.id,
      },
    });
    const session = createSessionCookieValue({
      username: 'approved-user@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/food-selections',
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: { pollId: '00000000-0000-0000-0000-000000000000', durationMinutes: 10 },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Poll not found' });
    await app.close();
  });

  it('allows admin users to pass authorization check for start food selection', async () => {
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'admin@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/food-selections',
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: { pollId: '00000000-0000-0000-0000-000000000000', durationMinutes: 10 },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toContain('Poll not found');
    await app.close();
  });

  it('allows approved non-admin users to quick-start food selection', async () => {
    const app = await buildApp();
    const defaultOffice = await ensureDefaultOfficeLocation();
    await prisma.authAccessUser.create({
      data: {
        email: 'starter@company.com',
        approved: true,
        blocked: false,
        isAdmin: false,
        officeLocationId: defaultOffice.id,
      },
    });
    const menu = await menuService.createMenu('Quick Menu');
    await menuService.createItem(menu.id, 'Meal 1');
    const session = createSessionCookieValue({
      username: 'starter@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/food-selections/quick-start',
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: { durationMinutes: 10 },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe('active');
    await app.close();
  });

  it('allows the food-selection creator to extend overtime', async () => {
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
    const menu = await menuService.createMenu('Thai Food');
    await menuService.createItem(menu.id, 'Pad Thai');
    const poll = await pollService.startPoll('Lunch poll', 60);
    await pollService.castVote(poll.id, menu.id, 'Alice');
    const finishedPoll = await pollService.endPoll(poll.id);
    const selection = await foodSelectionService.startFoodSelection(
      finishedPoll.id,
      10,
      undefined,
      'creator@company.com',
    );
    await foodSelectionService.expireFoodSelection(selection.id);
    const session = createSessionCookieValue({
      username: 'creator@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/food-selections/${selection.id}/extend`,
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: { extensionMinutes: 10 },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('active');
    await app.close();
  });

  it('rejects food-selection timer updates for approved non-creators', async () => {
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
    const menu = await menuService.createMenu('Thai Food');
    await menuService.createItem(menu.id, 'Pad Thai');
    const poll = await pollService.startPoll('Lunch poll', 60);
    await pollService.castVote(poll.id, menu.id, 'Alice');
    const finishedPoll = await pollService.endPoll(poll.id);
    const selection = await foodSelectionService.startFoodSelection(
      finishedPoll.id,
      10,
      undefined,
      'creator@company.com',
    );
    const session = createSessionCookieValue({
      username: 'other@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/food-selections/${selection.id}/timer`,
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: { remainingMinutes: 15 },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'Admin or creator role required' });
    await app.close();
  });

  it('rejects abort food selection for non-admin users', async () => {
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'user@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/food-selections/00000000-0000-0000-0000-000000000000/abort',
      headers: { cookie: `team_lunch_auth_session=${session}` },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'Admin role required' });
    await app.close();
  });

  it('allows approved non-admin users to complete-now a food selection', async () => {
    const app = await buildApp();
    const defaultOffice = await ensureDefaultOfficeLocation();
    await prisma.authAccessUser.create({
      data: {
        email: 'finisher@company.com',
        approved: true,
        blocked: false,
        isAdmin: false,
        officeLocationId: defaultOffice.id,
      },
    });
    const session = createSessionCookieValue({
      username: 'finisher@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/food-selections/00000000-0000-0000-0000-000000000000/complete-now',
      headers: { cookie: `team_lunch_auth_session=${session}` },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toContain('Food selection not found');
    await app.close();
  });

  it('allows approved non-admin users to complete a food selection', async () => {
    const app = await buildApp();
    const defaultOffice = await ensureDefaultOfficeLocation();
    await prisma.authAccessUser.create({
      data: {
        email: 'collector@company.com',
        approved: true,
        blocked: false,
        isAdmin: false,
        officeLocationId: defaultOffice.id,
      },
    });
    const session = createSessionCookieValue({
      username: 'collector@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/food-selections/00000000-0000-0000-0000-000000000000/complete',
      headers: { cookie: `team_lunch_auth_session=${session}` },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toContain('Food selection not found');
    await app.close();
  });

  it('rejects remind-missing for non-admin users', async () => {
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'user@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/food-selections/00000000-0000-0000-0000-000000000000/remind-missing',
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: {},
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'Admin role required' });
    await app.close();
  });

  it('rejects fallback-orders for non-admin users', async () => {
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'user@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/food-selections/00000000-0000-0000-0000-000000000000/fallback-orders',
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: { nickname: 'target@company.com' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'Admin role required' });
    await app.close();
  });
});

