import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/index.js';
import { createSessionCookieValue } from '../../src/server/services/authSession.js';

describe('auth approval gate', () => {
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

  it('marks admin session as approved and admin', async () => {
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'admin@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/config',
      headers: { cookie: `team_lunch_auth_session=${session}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      auth: {
        authenticated: true,
        approvalRequired: true,
        isAdmin: true,
        approved: true,
        blocked: false,
        role: 'admin',
        accessibleOfficeLocations: expect.any(Array),
        users: expect.any(Array),
      },
    });
    expect(res.json().auth.users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: 'admin@company.com',
          isAdmin: true,
        }),
      ]),
    );

    await app.close();
  });

  it('keeps non-admin user pending until approved', async () => {
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'user@company.com',
      method: 'local',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/config',
      headers: { cookie: `team_lunch_auth_session=${session}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      auth: {
        authenticated: true,
        approvalRequired: true,
        isAdmin: false,
        approved: false,
        blocked: false,
        role: 'user',
        accessibleOfficeLocations: [],
      },
    });

    await app.close();
  });

  it('marks blocked user as blocked in auth config', async () => {
    const app = await buildApp();
    const adminSession = createSessionCookieValue({
      username: 'admin@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    await app.inject({
      method: 'POST',
      url: '/api/auth/users/block',
      headers: { cookie: `team_lunch_auth_session=${adminSession}` },
      payload: { email: 'blocked@company.com' },
    });

    const blockedSession = createSessionCookieValue({
      username: 'blocked@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/config',
      headers: { cookie: `team_lunch_auth_session=${blockedSession}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      auth: {
        authenticated: true,
        approvalRequired: true,
        approved: false,
        blocked: true,
        isAdmin: false,
        role: 'user',
        accessibleOfficeLocations: [],
      },
    });

    await app.close();
  });
});

