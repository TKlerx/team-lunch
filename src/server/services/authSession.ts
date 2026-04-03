import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type AuthMethod = 'entra' | 'local';

// The signed cookie stores only the auth method, username, and issued-at timestamp.
// Approval, blocked-state, admin role, and office access are resolved from application data
// on protected requests so logout only clears the browser cookie, not server-side user state.
export interface AuthSession {
  username: string;
  method: AuthMethod;
  iat: number;
}

const SESSION_COOKIE_NAME = 'team_lunch_auth_session';
const ENTRA_STATE_COOKIE_NAME = 'team_lunch_entra_state';
const SESSION_TTL_SECONDS = 60 * 60 * 12;

function getSessionSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET?.trim() ?? '';
  if (secret.length < 32) {
    throw new Error('AUTH_SESSION_SECRET must be set to at least 32 characters');
  }
  return secret;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signData(data: string): string {
  return createHmac('sha256', getSessionSecret()).update(data).digest('base64url');
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};

  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.includes('='))
    .reduce<Record<string, string>>((acc, part) => {
      const [key, ...rest] = part.split('=');
      acc[key] = rest.join('=');
      return acc;
    }, {});
}

function normalizeCookiePath(): string {
  const basePath = process.env.BASE_PATH?.trim() ?? '';
  if (!basePath || basePath === '/') return '/';
  if (basePath.startsWith('/')) return basePath;
  return `/${basePath}`;
}

export function createSessionCookieValue(session: AuthSession): string {
  const payload = base64UrlEncode(JSON.stringify(session));
  const signature = signData(payload);
  return `${payload}.${signature}`;
}

export function parseSessionCookieValue(value: string | undefined): AuthSession | null {
  if (!value) return null;
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return null;

  const expectedSignature = signData(payload);
  const actualBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  if (actualBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as Partial<AuthSession>;
    if (
      typeof parsed.username !== 'string' ||
      (parsed.method !== 'entra' && parsed.method !== 'local') ||
      typeof parsed.iat !== 'number'
    ) {
      return null;
    }
    if (Date.now() / 1000 - parsed.iat > SESSION_TTL_SECONDS) return null;
    return {
      username: parsed.username,
      method: parsed.method,
      iat: parsed.iat,
    };
  } catch {
    return null;
  }
}

export function getAuthSessionFromCookieHeader(cookieHeader: string | undefined): AuthSession | null {
  const cookies = parseCookies(cookieHeader);
  return parseSessionCookieValue(cookies[SESSION_COOKIE_NAME]);
}

export function buildSetSessionCookieHeader(session: AuthSession): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=${createSessionCookieValue(session)}; Path=${normalizeCookiePath()}; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

export function buildClearSessionCookieHeader(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=; Path=${normalizeCookiePath()}; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function generateEntraState(): string {
  return randomBytes(16).toString('hex');
}

export function buildSetEntraStateCookieHeader(state: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${ENTRA_STATE_COOKIE_NAME}=${state}; Path=${normalizeCookiePath()}; HttpOnly; SameSite=Lax; Max-Age=600${secure}`;
}

export function buildClearEntraStateCookieHeader(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${ENTRA_STATE_COOKIE_NAME}=; Path=${normalizeCookiePath()}; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function getEntraStateFromCookieHeader(cookieHeader: string | undefined): string | null {
  const cookies = parseCookies(cookieHeader);
  const value = cookies[ENTRA_STATE_COOKIE_NAME];
  return value && value.length > 0 ? value : null;
}
