import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/index.js';
import { createSessionCookieValue } from '../../src/server/services/authSession.js';
import prisma from '../../src/server/db.js';

describe('local user management authorization', () => {
  const originalEnv = {
    AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
    AUTH_ADMIN_EMAIL: process.env.AUTH_ADMIN_EMAIL,
  };

  beforeEach(() => {
    process.env.AUTH_SESSION_SECRET = '12345678901234567890123456789012';
    process.env.AUTH_ADMIN_EMAIL = 'admin@company.com';
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('rejects local-user generation for non-admin users', async () => {
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'user@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/local/users/generate',
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: { email: 'new.user@company.com' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'Admin role required' });
    await app.close();
  });

  it('allows admin role to access generation endpoint', async () => {
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'admin@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/local/users/generate',
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'Email is required' });
    await app.close();
  });

  it('rejects pending-user decline for non-admin users', async () => {
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'user@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/users/decline',
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: { email: 'new.user@company.com' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'Admin approval required' });
    await app.close();
  });

  it('allows admin role to access decline endpoint', async () => {
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'admin@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/users/decline',
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'Email is required' });
    await app.close();
  });

  it('rejects promote-user for non-admin users', async () => {
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'user@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/users/promote',
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: { email: 'member@company.com' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'Admin approval required' });
    await app.close();
  });

  it('allows admin role to access promote endpoint', async () => {
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'admin@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/users/promote',
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'Email is required' });
    await app.close();
  });

  it('rejects demote-user for non-admin users', async () => {
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'user@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/users/demote',
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: { email: 'member@company.com' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'Admin approval required' });
    await app.close();
  });

  it('allows admin role to access demote endpoint', async () => {
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'admin@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/users/demote',
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'Email is required' });
    await app.close();
  });

  it('rejects block-user for non-admin users', async () => {
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'user@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/users/block',
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: { email: 'member@company.com' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'Admin approval required' });
    await app.close();
  });

  it('allows admin role to access block endpoint', async () => {
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'admin@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/users/block',
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'Email is required' });
    await app.close();
  });

  it('rejects unblock-user for non-admin users', async () => {
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'user@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/users/unblock',
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: { email: 'member@company.com' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'Admin approval required' });
    await app.close();
  });

  it('allows admin role to access unblock endpoint', async () => {
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'admin@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/users/unblock',
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'Email is required' });
    await app.close();
  });

  it('rejects assign-office for non-admin users', async () => {
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'user@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/users/assign-office',
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: { email: 'member@company.com', officeLocationId: 'office-1' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'Admin approval required' });
    await app.close();
  });

  it('allows admin role to access assign-office endpoint', async () => {
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'admin@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/users/assign-office',
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'Email is required' });
    await app.close();
  });

  it('rejects assign-offices for non-admin users', async () => {
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'user@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/users/assign-offices',
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: { email: 'member@company.com', officeLocationIds: ['office-1'] },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'Admin approval required' });
    await app.close();
  });

  it('allows admin role to access assign-offices endpoint', async () => {
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'admin@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/users/assign-offices',
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'Email is required' });
    await app.close();
  });

  it('allows assigning offices to the bootstrap admin even without an existing access-user row', async () => {
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'admin@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });
    const officeKey = `berlin-authz-${Date.now()}`;
    const officeName = `Berlin Authz ${Date.now()}`;

    const office = await prisma.officeLocation.create({
      data: {
        key: officeKey,
        name: officeName,
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/users/assign-offices',
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: {
        email: 'admin@company.com',
        officeLocationIds: [office.id],
        preferredOfficeLocationId: office.id,
      },
    });

    expect(res.statusCode).toBe(200);
    const persisted = await prisma.authAccessUser.findUnique({
      where: { email: 'admin@company.com' },
      include: { officeMemberships: true },
    });
    expect(persisted).toBeTruthy();
    expect(persisted?.isAdmin).toBe(true);
    expect(persisted?.officeLocationId).toBe(office.id);
    expect(
      persisted?.officeMemberships.map((membership: { officeLocationId: string }) => membership.officeLocationId),
    ).toEqual([office.id]);
    await app.close();
  });

  it('rejects office creation for non-admin users', async () => {
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'user@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/offices',
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: { name: 'Berlin' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'Admin approval required' });
    await app.close();
  });

  it('allows admin role to access office creation endpoint', async () => {
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'admin@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/offices',
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'Office location name is required' });
    await app.close();
  });

  it('rejects office rename for non-admin users', async () => {
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'user@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/offices/office-1/rename',
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: { name: 'Berlin' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'Admin approval required' });
    await app.close();
  });

  it('allows admin role to access office rename endpoint', async () => {
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'admin@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/offices/office-1/rename',
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'Office location name is required' });
    await app.close();
  });

  it('rejects office deactivation for non-admin users', async () => {
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'user@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/offices/office-1/deactivate',
      headers: { cookie: `team_lunch_auth_session=${session}` },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'Admin approval required' });
    await app.close();
  });

  it('allows admin role to access office deactivation endpoint', async () => {
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'admin@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/offices/office-1/deactivate',
      headers: { cookie: `team_lunch_auth_session=${session}` },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Office location not found' });
    await app.close();
  });

  it('rejects office settings updates for non-admin users', async () => {
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'user@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/offices/office-1/settings',
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: {
        autoStartPollEnabled: true,
        autoStartPollWeekdays: ['monday'],
        autoStartPollFinishTime: '11:30',
        defaultFoodSelectionDurationMinutes: 20,
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'Admin approval required' });
    await app.close();
  });

  it('allows admin role to access office settings endpoint', async () => {
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'admin@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/offices/office-1/settings',
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: {
        autoStartPollEnabled: true,
        autoStartPollWeekdays: ['monday'],
        autoStartPollFinishTime: '11:30',
        defaultFoodSelectionDurationMinutes: 20,
      },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Office location not found' });
    await app.close();
  });
});

