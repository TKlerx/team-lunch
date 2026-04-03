import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { buildApp } from '../../src/server/index.js';
import { upsertLocalAuthUser } from '../../src/server/services/localAuth.js';
import { resetEntraOidcCacheForTests } from '../../src/server/services/entraOidc.js';
import { resetLocalLoginProtectionForTests } from '../../src/server/services/localLoginProtection.js';
import { cleanDatabase } from './helpers/db.js';

function asCookieHeader(setCookieHeader: string | string[] | undefined): string {
  const values = Array.isArray(setCookieHeader) ? setCookieHeader : setCookieHeader ? [setCookieHeader] : [];
  return values
    .map((value) => value.split(';', 1)[0])
    .join('; ');
}

function asCookieList(setCookieHeader: string | string[] | undefined): string[] {
  return Array.isArray(setCookieHeader) ? setCookieHeader : setCookieHeader ? [setCookieHeader] : [];
}

describe('auth hardening', () => {
  const originalEnv = {
    ENTRA_CLIENT_ID: process.env.ENTRA_CLIENT_ID,
    ENTRA_CLIENT_SECRET: process.env.ENTRA_CLIENT_SECRET,
    ENTRA_TENANT_ID: process.env.ENTRA_TENANT_ID,
    APP_PUBLIC_URL: process.env.APP_PUBLIC_URL,
    BASE_PATH: process.env.BASE_PATH,
    ENTRA_OPENID_CONFIGURATION_URL: process.env.ENTRA_OPENID_CONFIGURATION_URL,
    AUTH_ADMIN_EMAIL: process.env.AUTH_ADMIN_EMAIL,
    GRAPH_MAIL_SENDER: process.env.GRAPH_MAIL_SENDER,
    GRAPH_MAIL_TEST_RECIPIENT: process.env.GRAPH_MAIL_TEST_RECIPIENT,
  };

  beforeEach(async () => {
    await cleanDatabase();
    resetEntraOidcCacheForTests();
    resetLocalLoginProtectionForTests();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();

    process.env.ENTRA_CLIENT_ID = 'client-id';
    process.env.ENTRA_CLIENT_SECRET = 'client-secret';
    process.env.ENTRA_TENANT_ID = 'tenant-id';
    process.env.APP_PUBLIC_URL = 'https://lunch.example.com';
    process.env.BASE_PATH = '/team-lunch';
    delete process.env.ENTRA_OPENID_CONFIGURATION_URL;
    delete process.env.AUTH_ADMIN_EMAIL;
    delete process.env.GRAPH_MAIL_SENDER;
    delete process.env.GRAPH_MAIL_TEST_RECIPIENT;
  });

  afterEach(() => {
    resetEntraOidcCacheForTests();
    resetLocalLoginProtectionForTests();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();

    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  async function createEntraToken(options?: {
    audience?: string;
    tenantId?: string;
    issuer?: string;
  }): Promise<{
    token: string;
    jwks: { keys: Awaited<ReturnType<typeof exportJWK>>[] };
  }> {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = 'kid-1';
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';

    const token = await new SignJWT({
      tid: options?.tenantId ?? 'tenant-id',
      preferred_username: 'alice@example.com',
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'kid-1' })
      .setIssuer(options?.issuer ?? 'https://login.microsoftonline.com/tenant-id/v2.0')
      .setAudience(options?.audience ?? 'client-id')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);

    return {
      token,
      jwks: { keys: [publicJwk] },
    };
  }

  async function mockEntraExchange(idToken: string, jwks: { keys: Awaited<ReturnType<typeof exportJWK>>[] }) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof URL ? input.toString() : input.toString();

      if (url.includes('/oauth2/v2.0/token')) {
        return new Response(JSON.stringify({ id_token: idToken }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'https://entra.example.com/.well-known/openid-configuration') {
        return new Response(
          JSON.stringify({
            issuer: 'https://login.microsoftonline.com/tenant-id/v2.0',
            jwks_uri: 'https://entra.example.com/keys',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      if (url === 'https://entra.example.com/keys') {
        return new Response(JSON.stringify(jwks), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch URL in test: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);
    process.env.ENTRA_OPENID_CONFIGURATION_URL = 'https://entra.example.com/.well-known/openid-configuration';
  }

  async function startEntraLogin(app: Awaited<ReturnType<typeof buildApp>>) {
    const loginRes = await app.inject({ method: 'GET', url: '/api/auth/entra/login' });
    const location = loginRes.headers.location;
    if (!location) {
      throw new Error('Expected Entra login redirect location');
    }
    const redirectUrl = new URL(location);
    const state = redirectUrl.searchParams.get('state');
    if (!state) {
      throw new Error('Expected Entra login redirect to include state');
    }
    return {
      state,
      cookieHeader: asCookieHeader(loginRes.headers['set-cookie']),
    };
  }

  it('rejects Entra callback when the token audience is invalid', async () => {
    const { token, jwks } = await createEntraToken({ audience: 'wrong-client-id' });
    await mockEntraExchange(token, jwks);
    const app = await buildApp();
    const login = await startEntraLogin(app);

    const response = await app.inject({
      method: 'GET',
      url: `/api/auth/entra/callback?code=test-code&state=${encodeURIComponent(login.state)}`,
      headers: { cookie: login.cookieHeader },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Invalid Entra id_token' });
    expect(asCookieList(response.headers['set-cookie']).some((value) => value.includes('team_lunch_auth_session='))).toBe(false);
    expect(asCookieList(response.headers['set-cookie']).some((value) => value.includes('team_lunch_entra_state=;'))).toBe(true);

    await app.close();
  });

  it('rejects Entra callback when the token signature does not match Entra signing keys', async () => {
    const signed = await createEntraToken();
    const unrelatedKeys = await createEntraToken();
    await mockEntraExchange(signed.token, unrelatedKeys.jwks);
    const app = await buildApp();
    const login = await startEntraLogin(app);

    const response = await app.inject({
      method: 'GET',
      url: `/api/auth/entra/callback?code=test-code&state=${encodeURIComponent(login.state)}`,
      headers: { cookie: login.cookieHeader },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Invalid Entra id_token' });
    expect(asCookieList(response.headers['set-cookie']).some((value) => value.includes('team_lunch_auth_session='))).toBe(false);

    await app.close();
  });

  it('rejects Entra callback when the verified token is not in the allowed tenant', async () => {
    const { token, jwks } = await createEntraToken({ tenantId: 'other-tenant' });
    await mockEntraExchange(token, jwks);
    const app = await buildApp();
    const login = await startEntraLogin(app);

    const response = await app.inject({
      method: 'GET',
      url: `/api/auth/entra/callback?code=test-code&state=${encodeURIComponent(login.state)}`,
      headers: { cookie: login.cookieHeader },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Account is not in the allowed tenant' });
    expect(asCookieList(response.headers['set-cookie']).some((value) => value.includes('team_lunch_auth_session='))).toBe(false);

    await app.close();
  });

  it('locks repeated failed local logins for the same username and IP', async () => {
    const app = await buildApp();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/local/login',
        payload: { username: 'missing@example.com', password: 'bad-password' },
        headers: { 'x-forwarded-for': '203.0.113.10' },
      });
      expect(response.statusCode).toBe(401);
    }

    const lockedResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/local/login',
      payload: { username: 'missing@example.com', password: 'bad-password' },
      headers: { 'x-forwarded-for': '203.0.113.10' },
    });

    expect(lockedResponse.statusCode).toBe(429);
    expect(lockedResponse.headers['retry-after']).toBeDefined();
    expect(lockedResponse.json()).toEqual({
      error: expect.stringContaining('Too many failed login attempts.'),
    });

    await app.close();
  });

  it('clears the local-login penalty after a successful login', async () => {
    await upsertLocalAuthUser('alice@example.com', 'Secret#1234');
    const app = await buildApp();
    const headers = { 'x-forwarded-for': '203.0.113.20' };

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/local/login',
        payload: { username: 'alice@example.com', password: 'wrong-password' },
        headers,
      });
      expect(response.statusCode).toBe(401);
    }

    const successResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/local/login',
      payload: { username: 'alice@example.com', password: 'Secret#1234' },
      headers,
    });
    expect(successResponse.statusCode).toBe(200);

    const firstRetry = await app.inject({
      method: 'POST',
      url: '/api/auth/local/login',
      payload: { username: 'alice@example.com', password: 'wrong-password' },
      headers,
    });
    const secondRetry = await app.inject({
      method: 'POST',
      url: '/api/auth/local/login',
      payload: { username: 'alice@example.com', password: 'wrong-password' },
      headers,
    });

    expect(firstRetry.statusCode).toBe(401);
    expect(secondRetry.statusCode).toBe(401);

    await app.close();
  });
});
