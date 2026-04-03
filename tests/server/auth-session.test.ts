import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildSetSessionCookieHeader,
  buildClearSessionCookieHeader,
  createSessionCookieValue,
  parseSessionCookieValue,
  buildSetEntraStateCookieHeader,
  buildClearEntraStateCookieHeader,
} from '../../src/server/services/authSession.js';

describe('auth session cookies', () => {
  const originalBasePath = process.env.BASE_PATH;
  const originalSecret = process.env.AUTH_SESSION_SECRET;

  beforeEach(() => {
    process.env.AUTH_SESSION_SECRET = '12345678901234567890123456789012';
    process.env.BASE_PATH = '/team-lunch';
  });

  afterEach(() => {
    if (originalBasePath === undefined) {
      delete process.env.BASE_PATH;
    } else {
      process.env.BASE_PATH = originalBasePath;
    }

    if (originalSecret === undefined) {
      delete process.env.AUTH_SESSION_SECRET;
    } else {
      process.env.AUTH_SESSION_SECRET = originalSecret;
    }
  });

  it('creates and parses a signed session value', () => {
    const cookieValue = createSessionCookieValue({
      username: 'alice@example.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    });

    const parsed = parseSessionCookieValue(cookieValue);
    expect(parsed).toMatchObject({
      username: 'alice@example.com',
      method: 'entra',
    });
  });

  it('rejects tampered session values', () => {
    const cookieValue = createSessionCookieValue({
      username: 'bob',
      method: 'local',
      iat: Math.floor(Date.now() / 1000),
    });

    const tampered = `${cookieValue}x`;
    expect(parseSessionCookieValue(tampered)).toBeNull();
  });

  it('scopes auth cookies to BASE_PATH', () => {
    expect(buildSetSessionCookieHeader({ username: 'bob', method: 'local', iat: 1 })).toContain(
      'Path=/team-lunch',
    );
    expect(buildClearSessionCookieHeader()).toContain('Path=/team-lunch');
    expect(buildSetEntraStateCookieHeader('state')).toContain('Path=/team-lunch');
    expect(buildClearEntraStateCookieHeader()).toContain('Path=/team-lunch');
  });
});

