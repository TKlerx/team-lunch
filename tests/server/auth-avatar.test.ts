import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../../src/server/db.js';
import { buildApp } from '../../src/server/index.js';
import { createSessionCookieValue } from '../../src/server/services/authSession.js';
import { resetAuthAvatarCacheForTests } from '../../src/server/services/authAvatar.js';
import { upsertLocalAuthUser } from '../../src/server/services/localAuth.js';
import { cleanDatabase } from './helpers/db.js';

function sessionCookie(username: string, method: 'entra' | 'local'): string {
  const value = createSessionCookieValue({
    username,
    method,
    iat: Math.floor(Date.now() / 1000),
    sessionVersion: 0,
  });
  return `team_lunch_auth_session=${value}`;
}

function graphTokenResponse(): Response {
  return new Response(JSON.stringify({ access_token: 'graph-token', expires_in: 3600 }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('auth avatar routes', () => {
  const originalEnv = {
    AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
    ENTRA_CLIENT_ID: process.env.ENTRA_CLIENT_ID,
    ENTRA_CLIENT_SECRET: process.env.ENTRA_CLIENT_SECRET,
    ENTRA_TENANT_ID: process.env.ENTRA_TENANT_ID,
  };
  const originalFetch = globalThis.fetch;
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(async () => {
    process.env.AUTH_SESSION_SECRET = '12345678901234567890123456789012';
    process.env.ENTRA_CLIENT_ID = 'client-id';
    process.env.ENTRA_CLIENT_SECRET = 'client-secret';
    process.env.ENTRA_TENANT_ID = 'tenant-id';
    resetAuthAvatarCacheForTests();
    await cleanDatabase();
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    vi.stubGlobal('fetch', originalFetch);
    resetAuthAvatarCacheForTests();
    consoleErrorSpy.mockClear();
  });

  it('returns Graph profile photo bytes for Entra users', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/oauth2/v2.0/token')) {
        return graphTokenResponse();
      }
      if (url === 'https://graph.microsoft.com/v1.0/users/alice%40example.com/photo/$value') {
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        });
      }
      return new Response('unexpected', { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);
    await prisma.authAccessUser.create({
      data: { email: 'alice@example.com', approved: true, blocked: false, isAdmin: false },
    });
    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me/avatar',
      headers: { cookie: sessionCookie('alice@example.com', 'entra') },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('image/png');
    expect(response.headers['cache-control']).toMatch(/^private, max-age=/);
    expect([...response.rawPayload]).toEqual([1, 2, 3]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await app.close();
  });

  it('falls back cleanly when Graph reports no photo', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/oauth2/v2.0/token')) {
        return graphTokenResponse();
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    await prisma.authAccessUser.create({
      data: { email: 'no-photo@example.com', approved: true, blocked: false, isAdmin: false },
    });
    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me/avatar',
      headers: { cookie: sessionCookie('no-photo@example.com', 'entra') },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['cache-control']).toMatch(/^private, max-age=/);
    await app.close();
  });

  it('falls back cleanly when Graph auth or photo fetch fails', async () => {
    const fetchMock = vi.fn(async () => new Response('denied', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    await prisma.authAccessUser.create({
      data: { email: 'error@example.com', approved: true, blocked: false, isAdmin: false },
    });
    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me/avatar',
      headers: { cookie: sessionCookie('error@example.com', 'entra') },
    });

    expect(response.statusCode).toBe(204);
    expect(consoleErrorSpy).toHaveBeenCalled();
    await app.close();
  });

  it('caches avatar lookups within the success TTL', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/oauth2/v2.0/token')) {
        return graphTokenResponse();
      }
      return new Response(new Uint8Array([9, 8, 7]), {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    await prisma.authAccessUser.create({
      data: { email: 'cached@example.com', approved: true, blocked: false, isAdmin: false },
    });
    const app = await buildApp();
    const request = {
      method: 'GET' as const,
      url: '/api/auth/me/avatar',
      headers: { cookie: sessionCookie('cached@example.com', 'entra') },
    };

    const first = await app.inject(request);
    const second = await app.inject(request);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect([...second.rawPayload]).toEqual([9, 8, 7]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await app.close();
  });

  it('skips Graph for local manual accounts', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await upsertLocalAuthUser('guest@example.com', 'Secret#1234');
    await prisma.authAccessUser.create({
      data: { email: 'guest@example.com', approved: true, blocked: false, isAdmin: false },
    });
    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me/avatar',
      headers: { cookie: sessionCookie('guest@example.com', 'local') },
    });

    expect(response.statusCode).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
    await app.close();
  });
});
