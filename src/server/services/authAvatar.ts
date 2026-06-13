type GraphAvatarConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
};

type CachedToken = {
  accessToken: string;
  expiresAt: number;
};

type AvatarCacheEntry =
  | {
      kind: 'image';
      bytes: Buffer;
      contentType: string;
      expiresAt: number;
    }
  | {
      kind: 'fallback';
      expiresAt: number;
    };

export type AuthAvatarResult =
  | {
      kind: 'image';
      bytes: Buffer;
      contentType: string;
      maxAgeSeconds: number;
    }
  | {
      kind: 'fallback';
      maxAgeSeconds: number;
    };

const DEFAULT_SUCCESS_TTL_SECONDS = 6 * 60 * 60;
const DEFAULT_NO_PHOTO_TTL_SECONDS = 60 * 60;
const DEFAULT_ERROR_TTL_SECONDS = 5 * 60;
const DEFAULT_MAX_CACHE_ENTRIES = 500;

let cachedConfig: GraphAvatarConfig | null | undefined;
let cachedToken: CachedToken | null = null;
const avatarCache = new Map<string, AvatarCacheEntry>();

function getFetch(): typeof fetch {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is unavailable');
  }
  return fetch;
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getSuccessTtlMs(): number {
  return readPositiveIntEnv('GRAPH_AVATAR_SUCCESS_TTL_SECONDS', DEFAULT_SUCCESS_TTL_SECONDS) * 1000;
}

function getNoPhotoTtlMs(): number {
  return readPositiveIntEnv('GRAPH_AVATAR_NO_PHOTO_TTL_SECONDS', DEFAULT_NO_PHOTO_TTL_SECONDS) * 1000;
}

function getErrorTtlMs(): number {
  return readPositiveIntEnv('GRAPH_AVATAR_ERROR_TTL_SECONDS', DEFAULT_ERROR_TTL_SECONDS) * 1000;
}

function getMaxCacheEntries(): number {
  return readPositiveIntEnv('GRAPH_AVATAR_MAX_CACHE_ENTRIES', DEFAULT_MAX_CACHE_ENTRIES);
}

function getGraphAvatarConfig(): GraphAvatarConfig | null {
  if (cachedConfig !== undefined) {
    return cachedConfig;
  }

  const tenantId = process.env.ENTRA_TENANT_ID?.trim() ?? '';
  const clientId = process.env.ENTRA_CLIENT_ID?.trim() ?? '';
  const clientSecret = process.env.ENTRA_CLIENT_SECRET?.trim() ?? '';

  if (!tenantId || !clientId || !clientSecret) {
    cachedConfig = null;
    return cachedConfig;
  }

  cachedConfig = { tenantId, clientId, clientSecret };
  return cachedConfig;
}

async function getAccessToken(config: GraphAvatarConfig): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }

  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(
    config.tenantId,
  )}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const response = await getFetch()(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    throw new Error(`Graph avatar token request failed (${response.status})`);
  }

  const payload = (await response.json().catch(() => null)) as
    | { access_token?: string; expires_in?: number }
    | null;
  if (!payload || typeof payload.access_token !== 'string' || payload.access_token.length === 0) {
    throw new Error('Graph avatar token response did not include an access token');
  }

  const expiresInSeconds =
    typeof payload.expires_in === 'number' && payload.expires_in > 0 ? payload.expires_in : 300;
  cachedToken = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  };
  return payload.access_token;
}

function pruneAvatarCache(): void {
  const maxEntries = getMaxCacheEntries();
  while (avatarCache.size > maxEntries) {
    const firstKey = avatarCache.keys().next().value as string | undefined;
    if (!firstKey) {
      return;
    }
    avatarCache.delete(firstKey);
  }
}

function cacheFallback(cacheKey: string, ttlMs: number): AuthAvatarResult {
  const expiresAt = Date.now() + ttlMs;
  avatarCache.set(cacheKey, { kind: 'fallback', expiresAt });
  pruneAvatarCache();
  return { kind: 'fallback', maxAgeSeconds: Math.floor(ttlMs / 1000) };
}

function cacheImage(
  cacheKey: string,
  bytes: Buffer,
  contentType: string,
  ttlMs: number,
): AuthAvatarResult {
  const expiresAt = Date.now() + ttlMs;
  avatarCache.set(cacheKey, { kind: 'image', bytes, contentType, expiresAt });
  pruneAvatarCache();
  return {
    kind: 'image',
    bytes,
    contentType,
    maxAgeSeconds: Math.floor(ttlMs / 1000),
  };
}

function readCachedAvatar(cacheKey: string): AuthAvatarResult | null {
  const cached = avatarCache.get(cacheKey);
  if (!cached) {
    return null;
  }
  const now = Date.now();
  if (cached.expiresAt <= now) {
    avatarCache.delete(cacheKey);
    return null;
  }
  const maxAgeSeconds = Math.max(1, Math.floor((cached.expiresAt - now) / 1000));
  if (cached.kind === 'image') {
    return {
      kind: 'image',
      bytes: cached.bytes,
      contentType: cached.contentType,
      maxAgeSeconds,
    };
  }
  return { kind: 'fallback', maxAgeSeconds };
}

async function fetchGraphAvatar(email: string, accessToken: string): Promise<{
  bytes: Buffer;
  contentType: string;
} | null> {
  const response = await getFetch()(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}/photo/$value`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Graph avatar photo request failed (${response.status})`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) {
    return null;
  }

  return {
    bytes,
    contentType: response.headers.get('content-type') ?? 'image/jpeg',
  };
}

export async function getAuthAvatarForUser(
  email: string,
  method: 'entra' | 'local',
): Promise<AuthAvatarResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const cacheKey = `${method}:${normalizedEmail}`;
  const cached = readCachedAvatar(cacheKey);
  if (cached) {
    return cached;
  }

  if (method !== 'entra' || !normalizedEmail) {
    return cacheFallback(cacheKey, getNoPhotoTtlMs());
  }

  const config = getGraphAvatarConfig();
  if (!config) {
    return cacheFallback(cacheKey, getErrorTtlMs());
  }

  try {
    const accessToken = await getAccessToken(config);
    const avatar = await fetchGraphAvatar(normalizedEmail, accessToken);
    if (!avatar) {
      return cacheFallback(cacheKey, getNoPhotoTtlMs());
    }
    return cacheImage(cacheKey, avatar.bytes, avatar.contentType, getSuccessTtlMs());
  } catch (error) {
    console.error('[auth-avatar] graph photo fetch failed', error);
    return cacheFallback(cacheKey, getErrorTtlMs());
  }
}

export function resetAuthAvatarCacheForTests(): void {
  cachedConfig = undefined;
  cachedToken = null;
  avatarCache.clear();
}
