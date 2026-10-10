import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/server/index.js';
import prisma from '../../src/server/db.js';
import type { AuthConfigResponse } from '../../src/lib/types.js';
import { createSessionCookieValue } from '../../src/server/services/authSession.js';
import { upsertLocalAuthUser } from '../../src/server/services/localAuth.js';
import * as offices from '../../src/server/services/officeLocation.js';
import * as access from '../../src/server/services/authAccess.js';
import * as connectivity from '../../src/server/services/dbConnectivity.js';
import { cleanDatabase } from './helpers/db.js';

const originalEnv = {
  AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
  AUTH_ADMIN_EMAIL: process.env.AUTH_ADMIN_EMAIL,
  ENTRA_CLIENT_ID: process.env.ENTRA_CLIENT_ID,
  ENTRA_CLIENT_SECRET: process.env.ENTRA_CLIENT_SECRET,
  ENTRA_TENANT_ID: process.env.ENTRA_TENANT_ID,
  APP_PUBLIC_URL: process.env.APP_PUBLIC_URL,
};
let app: Awaited<ReturnType<typeof buildApp>>;
let assigned: Awaited<ReturnType<typeof offices.createOfficeLocation>>[];
let unrelated: Awaited<ReturnType<typeof offices.createOfficeLocation>>;

beforeEach(async () => {
  await cleanDatabase();
  process.env.AUTH_SESSION_SECRET = 'privacy-test-secret-12345678901234567890';
  process.env.AUTH_ADMIN_EMAIL = 'bootstrap@example.com';
  process.env.ENTRA_CLIENT_ID = 'test-client';
  process.env.ENTRA_CLIENT_SECRET = 'test-secret';
  process.env.ENTRA_TENANT_ID = 'test-tenant';
  process.env.APP_PUBLIC_URL = 'https://lunch.example.com';
  assigned = [await offices.createOfficeLocation('Paderborn'), await offices.createOfficeLocation('Herford')];
  unrelated = await offices.createOfficeLocation('Unrelated Private Office');
  app = await buildApp();
});

afterEach(async () => {
  await app?.close();
  vi.restoreAllMocks();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function cookie(email = 'user@example.com', method: 'entra' | 'local' = 'entra', age = 0) {
  return `team_lunch_auth_session=${createSessionCookieValue({
    username: email, method, iat: Math.floor(Date.now() / 1000) - age,
  })}`;
}

async function seedUser(options: { isAdmin?: boolean; approved?: boolean; blocked?: boolean } = {}) {
  return prisma.authAccessUser.create({ data: {
    email: 'user@example.com', approved: options.approved ?? true,
    blocked: options.blocked ?? false, isAdmin: options.isAdmin ?? false,
    officeLocationId: assigned[0].id,
    officeMemberships: { create: assigned.map(office => ({ officeLocationId: office.id })) },
  } });
}

function expectPrivate(auth: AuthConfigResponse['auth']) {
  expect(auth.officeLocation).toBeNull();
  expect(auth.officeLocations).toEqual([]);
  expect(auth.accessibleOfficeLocations).toEqual([]);
  expect(auth.pendingApprovals).toEqual([]);
  expect(auth.users).toEqual([]);
  for (const office of [...assigned, unrelated]) {
    expect(JSON.stringify(auth)).not.toContain(office.id);
    expect(JSON.stringify(auth)).not.toContain(office.name);
  }
}

it.each(['anonymous', 'malformed', 'invalid signature', 'expired', 'deleted local account'])('%s reveals no offices and avoids their enumeration', async kind => {
  const headers = kind === 'anonymous' ? {} : { cookie:
    kind === 'malformed' ? 'team_lunch_auth_session=invalid' :
    kind === 'invalid signature' ? `${cookie()}tampered` :
    kind === 'expired' ? cookie('user@example.com', 'entra', 12 * 3600 + 1) :
    cookie('deleted@example.com', 'local'),
  };
  const listSpy = vi.spyOn(offices, 'listOfficeLocations');
  const response = await app.inject({ method: 'GET', url: '/api/auth/config', headers });
  expect(response.statusCode).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.json().auth).toMatchObject({ authenticated: false, entraEnabled: true, user: null, isAdmin: false });
  expectPrivate(response.json().auth);
  expect(listSpy).not.toHaveBeenCalled();
});

it.each([false, true])('revoked session discards already resolved private state (admin=%s)', async isAdmin => {
  const user = await seedUser({ isAdmin });
  const oldCookie = cookie();
  await prisma.authAccessUser.update({ where: { id: user.id }, data: { sessionVersion: 1 } });
  const response = await app.inject({ method: 'GET', url: '/api/auth/config', headers: { cookie: oldCookie } });
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.json().auth).toMatchObject({ authenticated: false, user: null, isAdmin: false, approved: false, role: null });
  expectPrivate(response.json().auth);
});

it('a post-approval profile failure discards private state', async () => {
  await seedUser({ isAdmin: true });
  vi.spyOn(access, 'getAuthDisplayProfile').mockRejectedValue(new Error('profile unavailable'));
  const response = await app.inject({ method: 'GET', url: '/api/auth/config', headers: { cookie: cookie() } });
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.json().auth).toMatchObject({ authenticated: false, user: null, isAdmin: false });
  expectPrivate(response.json().auth);
});

it.each(['pending', 'blocked'])('%s account retains status without office access', async status => {
  await seedUser({ approved: false, blocked: status === 'blocked' });
  const response = await app.inject({ method: 'GET', url: '/api/auth/config', headers: { cookie: cookie() } });
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.json().auth).toMatchObject({ authenticated: true, approved: false, blocked: status === 'blocked' });
  expectPrivate(response.json().auth);
});

it('approved user receives only assigned selector summaries after real local login', async () => {
  await seedUser();
  await upsertLocalAuthUser('user@example.com', 'TestPassword!123');
  const login = await app.inject({ method: 'POST', url: '/api/auth/local/login', payload: { username: 'user@example.com', password: 'TestPassword!123' } });
  expect(login.statusCode).toBe(200);
  const setCookie = login.headers['set-cookie'];
  const sessionCookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)!.split(';')[0];
  const listSpy = vi.spyOn(offices, 'listOfficeLocations');
  const response = await app.inject({ method: 'GET', url: '/api/auth/config', headers: { cookie: sessionCookie } });
  expect(response.headers['cache-control']).toBe('no-store');
  const auth: AuthConfigResponse['auth'] = response.json().auth;
  expect(auth).toMatchObject({ authenticated: true, localEnabled: true, approved: true, isAdmin: false,
    officeLocation: { id: assigned[0].id, key: assigned[0].key, name: assigned[0].name }, officeLocations: [], users: [], pendingApprovals: [] });
  expect(auth.accessibleOfficeLocations).toHaveLength(2);
  expect(auth.accessibleOfficeLocations).toEqual(expect.arrayContaining(assigned.map(({ id, key, name, isActive }) => ({ id, key, name, isActive }))));
  expect(JSON.stringify(auth)).not.toContain(unrelated.name);
  expect(listSpy).not.toHaveBeenCalled();
});

it('admin retains complete office administration including inactive offices', async () => {
  await seedUser({ isAdmin: true });
  await offices.deactivateOfficeLocation(unrelated.id);
  const response = await app.inject({ method: 'GET', url: '/api/auth/config', headers: { cookie: cookie() } });
  expect(response.headers['cache-control']).toBe('no-store');
  const auth: AuthConfigResponse['auth'] = response.json().auth;
  expect(auth.authenticated).toBe(true);
  expect(auth.isAdmin).toBe(true);
  expect(auth.officeLocations).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: unrelated.id, isActive: false, timeZone: 'Europe/Berlin', orderingIntervalWeeks: 1,
      autoStartPollEnabled: false, autoStartPollWeekdays: [], createdAt: expect.any(String), updatedAt: expect.any(String) }),
  ]));
  for (const office of auth.accessibleOfficeLocations) expect(Object.keys(office).sort()).toEqual(['id', 'isActive', 'key', 'name']);
});

it('database-unavailable responses remain private and non-cacheable', async () => {
  vi.spyOn(connectivity, 'getDatabaseConnectivityStatus').mockReturnValue({ connected: false, attemptCount: 1 });
  const response = await app.inject({ method: 'GET', url: '/api/auth/config', headers: { cookie: cookie() } });
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.json().auth.databaseUnavailable).toBe(true);
  expectPrivate(response.json().auth);
});

it('outer handler errors also prevent caching', async () => {
  const signedCookie = cookie();
  delete process.env.AUTH_SESSION_SECRET;
  const response = await app.inject({ method: 'GET', url: '/api/auth/config', headers: { cookie: signedCookie } });
  expect(response.statusCode).toBe(500);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.json()).toEqual({ error: expect.any(String) });
});
