import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/index.js';

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
    process.env.ENTRA_CLIENT_ID = 'client-id';
    process.env.ENTRA_CLIENT_SECRET = 'client-secret';
    process.env.ENTRA_TENANT_ID = 'tenant-id';
    process.env.BASE_PATH = '/team-lunch';
    delete process.env.ENTRA_REDIRECT_URI;
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

  it('keeps local login available when Entra auth is not configured', async () => {
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
        localEnabled: true,
      },
    });

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/local/login',
      payload: { username: 'missing@example.com', password: 'bad-password' },
    });
    expect(loginRes.statusCode).toBe(401);
    expect(loginRes.json()).toEqual({ error: 'Invalid username or password' });

    await app.close();
  });
});

