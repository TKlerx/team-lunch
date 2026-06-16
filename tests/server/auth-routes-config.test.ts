import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { buildApp } from '../../src/server/index.js';
import { cleanDatabase } from './helpers/db.js';
import { getDatabaseConnectivityStatus } from '../../src/server/services/dbConnectivity.js';

vi.mock('../../src/server/services/dbConnectivity.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/server/services/dbConnectivity.js')>(
    '../../src/server/services/dbConnectivity.js',
  );
  return { ...actual, getDatabaseConnectivityStatus: vi.fn(actual.getDatabaseConnectivityStatus) };
});

describe('auth routes config', () => {
  const originalEnv = {
    ENTRA_CLIENT_ID: process.env.ENTRA_CLIENT_ID,
    ENTRA_CLIENT_SECRET: process.env.ENTRA_CLIENT_SECRET,
    ENTRA_TENANT_ID: process.env.ENTRA_TENANT_ID,
    ENTRA_REDIRECT_URI: process.env.ENTRA_REDIRECT_URI,
    APP_PUBLIC_URL: process.env.APP_PUBLIC_URL,
    BASE_PATH: process.env.BASE_PATH,
  };

  beforeEach(() => {
    (getDatabaseConnectivityStatus as Mock).mockReturnValue({ connected: true, attemptCount: 0 });
    process.env.ENTRA_CLIENT_ID = 'client-id';
    process.env.ENTRA_CLIENT_SECRET = 'client-secret';
    process.env.ENTRA_TENANT_ID = 'tenant-id';
    process.env.BASE_PATH = '/team-lunch';
    delete process.env.ENTRA_REDIRECT_URI;
  });

  afterEach(async () => {
    (getDatabaseConnectivityStatus as Mock).mockReset();
    await cleanDatabase();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('enables Entra auth when APP_PUBLIC_URL is set and redirect URI is derived', async () => {
    process.env.APP_PUBLIC_URL = 'https://lunch.example.com';
    const app = await buildApp();

    const configRes = await app.inject({ method: 'GET', url: '/api/auth/config' });
    expect(configRes.statusCode).toBe(200);
    expect(configRes.json()).toMatchObject({
      auth: {
        entraEnabled: true,
      },
    });

    const loginRes = await app.inject({ method: 'GET', url: '/api/auth/entra/login' });
    expect(loginRes.statusCode).toBe(302);
    expect(loginRes.headers.location).toContain(
      encodeURIComponent('https://lunch.example.com/team-lunch/api/auth/entra/callback'),
    );

    await app.close();
  });

  it('uses ENTRA_REDIRECT_URI override when set', async () => {
    process.env.APP_PUBLIC_URL = 'https://lunch.example.com';
    process.env.ENTRA_REDIRECT_URI = 'https://override.example.com/callback';
    const app = await buildApp();

    const loginRes = await app.inject({ method: 'GET', url: '/api/auth/entra/login' });
    expect(loginRes.statusCode).toBe(302);
    expect(loginRes.headers.location).toContain(
      encodeURIComponent('https://override.example.com/callback'),
    );

    await app.close();
  });

  it('reports database unavailable instead of a misleading auth warning when the DB is down', async () => {
    (getDatabaseConnectivityStatus as Mock).mockReturnValue({ connected: false, attemptCount: 1 });
    const app = await buildApp();

    const configRes = await app.inject({ method: 'GET', url: '/api/auth/config' });
    expect(configRes.statusCode).toBe(200);
    expect(configRes.json()).toMatchObject({
      auth: {
        databaseUnavailable: true,
        localEnabled: false,
        authenticated: false,
      },
    });
    expect(configRes.json().auth.warning).toMatch(/database is unavailable/i);
    expect(configRes.json().auth.warning).not.toMatch(/Local sign-in is still available/i);

    await app.close();
  });

  it('reports setup required when no auth method is configured', async () => {
    await cleanDatabase();
    delete process.env.ENTRA_CLIENT_ID;
    delete process.env.ENTRA_CLIENT_SECRET;
    delete process.env.ENTRA_TENANT_ID;
    delete process.env.APP_PUBLIC_URL;

    const app = await buildApp();

    const configRes = await app.inject({ method: 'GET', url: '/api/auth/config' });
    expect(configRes.statusCode).toBe(200);
    expect(configRes.json()).toMatchObject({
      auth: {
        entraEnabled: false,
        localEnabled: false,
        authenticated: false,
      },
    });
    expect(configRes.json().auth.warning).toMatch(/Authentication is required/i);

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/local/login',
      payload: { username: 'missing@example.com', password: 'bad-password' },
    });
    expect(loginRes.statusCode).toBe(401);

    await app.close();
  });
});

