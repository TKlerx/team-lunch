import { createLocalJWKSet, jwtVerify, type JWTPayload, type JSONWebKeySet } from 'jose';
import { serviceError } from '../routes/routeUtils.js';

type EntraOidcConfiguration = {
  issuer: string;
  jwksUri: string;
};

type VerifyEntraIdTokenOptions = {
  tenantId: string;
  clientId: string;
  openIdConfigurationUrl?: string;
};

const openIdConfigurationCache = new Map<string, Promise<EntraOidcConfiguration>>();
const jwksCache = new Map<string, Promise<JSONWebKeySet>>();

function getOpenIdConfigurationUrl(
  tenantId: string,
  explicitOpenIdConfigurationUrl: string | undefined,
): string {
  const explicit = explicitOpenIdConfigurationUrl?.trim() ?? '';
  if (explicit.length > 0) {
    return explicit;
  }
  return `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`;
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw serviceError('Failed to load Entra OIDC configuration', 401);
  }

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !payload) {
    throw serviceError('Failed to load Entra OIDC configuration', 401);
  }

  return payload;
}

async function loadOpenIdConfiguration(url: string): Promise<EntraOidcConfiguration> {
  const payload = await fetchJson(url);
  const issuer = typeof payload.issuer === 'string' ? payload.issuer.trim() : '';
  const jwksUri = typeof payload.jwks_uri === 'string' ? payload.jwks_uri.trim() : '';
  if (!issuer || !jwksUri) {
    throw serviceError('Failed to load Entra OIDC configuration', 401);
  }
  return { issuer, jwksUri };
}

async function getOpenIdConfiguration(url: string): Promise<EntraOidcConfiguration> {
  const cached = openIdConfigurationCache.get(url);
  if (cached) {
    return await cached;
  }

  const pending = loadOpenIdConfiguration(url).catch((error: unknown) => {
    openIdConfigurationCache.delete(url);
    throw error;
  });
  openIdConfigurationCache.set(url, pending);
  return await pending;
}

async function loadJwks(url: string): Promise<JSONWebKeySet> {
  const payload = await fetchJson(url);
  const keys = Array.isArray(payload.keys) ? payload.keys : null;
  if (!keys) {
    throw serviceError('Failed to load Entra signing keys', 401);
  }

  return { keys: keys as JSONWebKeySet['keys'] };
}

async function getJwks(url: string): Promise<JSONWebKeySet> {
  const cached = jwksCache.get(url);
  if (cached) {
    return await cached;
  }

  const pending = loadJwks(url).catch((error: unknown) => {
    jwksCache.delete(url);
    throw error;
  });
  jwksCache.set(url, pending);
  return await pending;
}

export async function verifyEntraIdToken(options: VerifyEntraIdTokenOptions, idToken: string): Promise<JWTPayload> {
  const openIdConfigurationUrl = getOpenIdConfigurationUrl(
    options.tenantId,
    options.openIdConfigurationUrl,
  );
  const configuration = await getOpenIdConfiguration(openIdConfigurationUrl);
  const jwks = await getJwks(configuration.jwksUri);

  try {
    const { payload } = await jwtVerify(idToken, createLocalJWKSet(jwks), {
      issuer: configuration.issuer,
      audience: options.clientId,
    });
    return payload;
  } catch {
    throw serviceError('Invalid Entra id_token', 401);
  }
}

export function resetEntraOidcCacheForTests(): void {
  openIdConfigurationCache.clear();
  jwksCache.clear();
}
