import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type {
  LocalLoginRequest,
  OfficeLocation,
  UpdateOfficeLocationSettingsRequest,
} from '../../lib/types.js';
import { serviceError, sendServiceError } from './routeUtils.js';
import {
  buildClearEntraStateCookieHeader,
  buildClearSessionCookieHeader,
  buildSetEntraStateCookieHeader,
  buildSetSessionCookieHeader,
  generateEntraState,
  getAuthSessionFromCookieHeader,
  getEntraStateFromCookieHeader,
} from '../services/authSession.js';
import {
  authenticateLocalUser,
  hasAnyLocalAuthUsers,
  upsertLocalAuthUser,
} from '../services/localAuth.js';
import { verifyEntraIdToken } from '../services/entraOidc.js';
import {
  assertLocalLoginAllowed,
  clearLocalLoginPenalty,
  recordLocalLoginFailure,
} from '../services/localLoginProtection.js';
import {
  approveUserByAdmin,
  assignUserOfficesByAdmin,
  assignUserOfficeByAdmin,
  blockUserByAdmin,
  getBlockedUserMessage,
  declineUserByAdmin,
  demoteUserByAdmin,
  listAccessUsers,
  listPendingAccessRequests,
  promoteUserByAdmin,
  resolveUserApproval,
  unblockUserByAdmin,
} from '../services/authAccess.js';
import {
  createOfficeLocation,
  deactivateOfficeLocation,
  listOfficeLocations,
  renameOfficeLocation,
  updateOfficeLocationSettings,
} from '../services/officeLocation.js';
import type { JWTPayload } from 'jose';

type AuthConfigResponse = {
  auth: {
    entraEnabled: boolean;
    localEnabled: boolean;
    authenticated: boolean;
    warning?: string;
    user: { username: string; method: 'entra' | 'local' } | null;
    officeLocation: { id: string; key: string; name: string } | null;
    officeLocations: OfficeLocation[];
    accessibleOfficeLocations: Array<{ id: string; key: string; name: string; isActive: boolean }>;
    approvalRequired: boolean;
    approved: boolean;
    blocked: boolean;
    isAdmin: boolean;
    role: 'admin' | 'user' | null;
    pendingApprovals: Array<{ email: string; requestedAt: string }>;
    users: Array<{
      email: string;
      approved: boolean;
      blocked: boolean;
      isAdmin: boolean;
      officeLocationId: string | null;
      officeLocationKey: string | null;
      officeLocationName: string | null;
      assignedOfficeLocationIds: string[];
      assignedOfficeLocations: Array<{ id: string; key: string; name: string; isActive: boolean }>;
      requestedAt: string;
      approvedAt: string | null;
      blockedAt: string | null;
      updatedAt: string;
    }>;
  };
};

function buildDefaultApprovalState() {
  return {
    approvalRequired: false,
    approved: false,
    blocked: false,
    isAdmin: false,
    officeLocationId: null as string | null,
    officeLocationKey: null as string | null,
    officeLocationName: null as string | null,
    accessibleOfficeLocationIds: [] as string[],
    accessibleOfficeLocations: [] as Array<{
      id: string;
      key: string;
      name: string;
      isActive: boolean;
    }>,
  };
}

function normalizeBasePath(value: string | undefined): string {
  if (!value || value === '/') {
    return '';
  }

  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.endsWith('/')
    ? withLeadingSlash.slice(0, Math.max(1, withLeadingSlash.length - 1))
    : withLeadingSlash;
}

function deriveEntraRedirectUri(
  explicitRedirectUri: string | undefined,
  appPublicUrl: string | undefined,
  basePath: string | undefined,
): string {
  const explicit = explicitRedirectUri?.trim() ?? '';
  if (explicit.length > 0) {
    return explicit;
  }

  const appUrl = appPublicUrl?.trim() ?? '';
  if (appUrl.length === 0) {
    return '';
  }

  try {
    const parsed = new URL(appUrl);
    const origin = parsed.origin.replace(/\/$/, '');
    return `${origin}${normalizeBasePath(basePath)}/api/auth/entra/callback`;
  } catch {
    return '';
  }
}

function getEntraConfig() {
  const clientId = process.env.ENTRA_CLIENT_ID?.trim() ?? '';
  const clientSecret = process.env.ENTRA_CLIENT_SECRET?.trim() ?? '';
  const tenantId = process.env.ENTRA_TENANT_ID?.trim() ?? '';
  const redirectUri = deriveEntraRedirectUri(
    process.env.ENTRA_REDIRECT_URI,
    process.env.APP_PUBLIC_URL,
    process.env.BASE_PATH,
  );
  const normalizedBasePath = normalizeBasePath(process.env.BASE_PATH?.trim() ?? '');
  const postLoginRedirectUri = normalizedBasePath ? `${normalizedBasePath}/` : '/';

  const enabled =
    clientId.length > 0 &&
    clientSecret.length > 0 &&
    tenantId.length > 0 &&
    redirectUri.length > 0;

  return {
    enabled,
    clientId,
    clientSecret,
    tenantId,
    redirectUri,
    openIdConfigurationUrl: process.env.ENTRA_OPENID_CONFIGURATION_URL?.trim() ?? '',
    postLoginRedirectUri,
    authorizeUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    scope: 'openid profile email',
  };
}

function getTenantIdFromClaims(claims: JWTPayload): string | null {
  return typeof claims.tid === 'string' ? claims.tid : null;
}

function getUsernameFromClaims(claims: JWTPayload): string {
  const preferredUsername =
    (typeof claims.preferred_username === 'string' && claims.preferred_username.trim()) ||
    (typeof claims.upn === 'string' && claims.upn.trim()) ||
    (typeof claims.email === 'string' && claims.email.trim()) ||
    (typeof claims.name === 'string' && claims.name.trim()) ||
    '';
  if (!preferredUsername) {
    throw serviceError('Unable to resolve username from Entra claims', 401);
  }
  return preferredUsername;
}

function validateCredentials(body: LocalLoginRequest): { username: string; password: string } {
  const username = body.username?.trim();
  const password = body.password;

  if (!username || typeof password !== 'string') {
    throw serviceError('Username and password are required', 400);
  }

  if (username.length > 100 || password.length > 200) {
    throw serviceError('Invalid credentials payload', 400);
  }

  return { username, password };
}

function getRequesterIpAddress(req: FastifyRequest): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim().length > 0) {
    return forwardedFor.split(',')[0]?.trim() || req.ip;
  }

  return req.ip;
}

export default async function authRoutes(app: FastifyInstance) {
  const handleEntraCallback = async (
    req: FastifyRequest<{ Querystring: { code?: string; state?: string } }>,
    reply: FastifyReply,
  ) => {
    try {
      const entra = getEntraConfig();
      if (!entra.enabled) {
        throw serviceError('Entra authentication is not configured', 503);
      }

      const code = req.query.code;
      const returnedState = req.query.state;
      if (!code || !returnedState) {
        throw serviceError('Missing Entra callback parameters', 400);
      }

      const expectedState = getEntraStateFromCookieHeader(req.headers.cookie);
      if (!expectedState || expectedState !== returnedState) {
        throw serviceError('Invalid Entra callback state', 401);
      }

      const body = new URLSearchParams();
      body.set('client_id', entra.clientId);
      body.set('client_secret', entra.clientSecret);
      body.set('grant_type', 'authorization_code');
      body.set('code', code);
      body.set('redirect_uri', entra.redirectUri);
      body.set('scope', entra.scope);

      const tokenResponse = await fetch(entra.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });

      const tokenPayload = (await tokenResponse.json().catch(() => null)) as
        | Record<string, unknown>
        | null;
      if (!tokenResponse.ok || !tokenPayload || typeof tokenPayload.id_token !== 'string') {
        throw serviceError('Failed to complete Entra token exchange', 401);
      }

      const idTokenClaims = await verifyEntraIdToken(
        {
          tenantId: entra.tenantId,
          clientId: entra.clientId,
          openIdConfigurationUrl: entra.openIdConfigurationUrl,
        },
        tokenPayload.id_token,
      );
      const actualTenantId = getTenantIdFromClaims(idTokenClaims);
      if (!actualTenantId || actualTenantId !== entra.tenantId) {
        throw serviceError('Account is not in the allowed tenant', 403);
      }

      const username = getUsernameFromClaims(idTokenClaims);
      const approval = await resolveUserApproval(username);
      if (approval.blocked) {
        throw serviceError(getBlockedUserMessage(), 403);
      }

      reply.header('Set-Cookie', [
        buildSetSessionCookieHeader({
          username,
          method: 'entra',
          iat: Math.floor(Date.now() / 1000),
        }),
        buildClearEntraStateCookieHeader(),
      ]);

      return reply.redirect(entra.postLoginRedirectUri);
    } catch (err) {
      reply.header('Set-Cookie', buildClearEntraStateCookieHeader());
      return sendServiceError(reply, err);
    }
  };

  app.get('/api/auth/config', async (req, reply) => {
    try {
      const entra = getEntraConfig();
      const session = getAuthSessionFromCookieHeader(req.headers.cookie);
      const localEnabled =
        !!session || !entra.enabled || (await hasAnyLocalAuthUsers());
      let warning = '';
      let approvalState = buildDefaultApprovalState();
      if (session) {
        try {
          approvalState = await resolveUserApproval(session.username);
        } catch {
          warning =
            'Authentication settings are partially unavailable. Local sign-in is still available.';
        }
      }
      let pendingApprovals: Array<{ email: string; requestedAt: string }> = [];
      let users: AuthConfigResponse['auth']['users'] = [];
      if (!warning && session && approvalState.isAdmin) {
        try {
          [pendingApprovals, users] = await Promise.all([
            listPendingAccessRequests(),
            listAccessUsers(),
          ]);
        } catch {
          warning =
            'Authentication settings are partially unavailable. Local sign-in is still available.';
        }
      }
      let officeLocations: OfficeLocation[] = [];
      try {
        officeLocations = await listOfficeLocations();
      } catch {
        warning =
          'Authentication settings are partially unavailable. Local sign-in is still available.';
      }
      const accessibleOfficeLocations = approvalState.isAdmin
        ? officeLocations
        : officeLocations.filter((location) =>
            approvalState.accessibleOfficeLocationIds.includes(location.id),
          );

      const response: AuthConfigResponse = {
        auth: {
          entraEnabled: entra.enabled,
          localEnabled,
          authenticated: !!session,
          ...(warning ? { warning } : {}),
          user: session ? { username: session.username, method: session.method } : null,
          officeLocation: approvalState.officeLocationId
            ? {
                id: approvalState.officeLocationId,
                key: approvalState.officeLocationKey ?? '',
                name: approvalState.officeLocationName ?? '',
              }
            : null,
          officeLocations,
          accessibleOfficeLocations,
          approvalRequired: approvalState.approvalRequired,
          approved: approvalState.approved,
          blocked: approvalState.blocked,
          isAdmin: approvalState.isAdmin,
          role: session ? (approvalState.isAdmin ? 'admin' : 'user') : null,
          pendingApprovals,
          users,
        },
      };

      return reply.send(response);
    } catch (err) {
      return sendServiceError(reply, err);
    }
  });

  app.post<{ Body: LocalLoginRequest }>('/api/auth/local/login', async (req, reply) => {
    try {
      const credentials = validateCredentials(req.body);
      const loginAttempt = {
        ipAddress: getRequesterIpAddress(req),
        username: credentials.username,
      };
      assertLocalLoginAllowed(loginAttempt);
      const authenticatedUsername = await authenticateLocalUser(credentials.username, credentials.password);
      if (!authenticatedUsername) {
        recordLocalLoginFailure(loginAttempt);
        throw serviceError('Invalid username or password', 401);
      }
      const approval = await resolveUserApproval(authenticatedUsername);
      if (approval.blocked) {
        throw serviceError(getBlockedUserMessage(), 403);
      }
      clearLocalLoginPenalty(loginAttempt);

      reply.header(
        'Set-Cookie',
        buildSetSessionCookieHeader({
          username: authenticatedUsername,
          method: 'local',
          iat: Math.floor(Date.now() / 1000),
        }),
      );

      return reply.send({ username: authenticatedUsername, method: 'local' as const });
    } catch (err) {
      return sendServiceError(reply, err);
    }
  });

  app.post<{ Body: { email?: string; password?: string; officeLocationId?: string } }>(
    '/api/auth/local/users/generate',
    async (req, reply) => {
      try {
        const session = getAuthSessionFromCookieHeader(req.headers.cookie);
        if (!session) {
          throw serviceError('Authentication required', 401);
        }
        const access = await resolveUserApproval(session.username);
        if (access.blocked) {
          throw serviceError(getBlockedUserMessage(), 403);
        }
        if (!access.isAdmin) {
          throw serviceError('Admin role required', 403);
        }

        const email = req.body?.email?.trim();
        if (!email) {
          throw serviceError('Email is required', 400);
        }
        const officeLocationId = req.body?.officeLocationId?.trim();
        if (!officeLocationId) {
          throw serviceError('Office location is required', 400);
        }

        const created = await upsertLocalAuthUser(email, req.body?.password);
        await approveUserByAdmin(created.email, officeLocationId);
        return reply.send(created);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  app.post<{ Body: { email?: string; officeLocationId?: string } }>('/api/auth/users/approve', async (req, reply) => {
    try {
      const session = getAuthSessionFromCookieHeader(req.headers.cookie);
      if (!session) {
        throw serviceError('Authentication required', 401);
      }

      const access = await resolveUserApproval(session.username);
      if (access.blocked) {
        throw serviceError(getBlockedUserMessage(), 403);
      }
      if (!access.isAdmin) {
        throw serviceError('Admin approval required', 403);
      }

      const email = req.body?.email?.trim();
      if (!email) {
        throw serviceError('Email is required', 400);
      }
      const officeLocationId = req.body?.officeLocationId?.trim();
      if (!officeLocationId) {
        throw serviceError('Office location is required', 400);
      }

      await approveUserByAdmin(email, officeLocationId);
      return reply.send({ email, approved: true });
    } catch (err) {
      return sendServiceError(reply, err);
    }
  });

  app.post<{ Body: { email?: string } }>('/api/auth/users/decline', async (req, reply) => {
    try {
      const session = getAuthSessionFromCookieHeader(req.headers.cookie);
      if (!session) {
        throw serviceError('Authentication required', 401);
      }

      const access = await resolveUserApproval(session.username);
      if (access.blocked) {
        throw serviceError(getBlockedUserMessage(), 403);
      }
      if (!access.isAdmin) {
        throw serviceError('Admin approval required', 403);
      }

      const email = req.body?.email?.trim();
      if (!email) {
        throw serviceError('Email is required', 400);
      }

      await declineUserByAdmin(email);
      return reply.send({ email, declined: true });
    } catch (err) {
      return sendServiceError(reply, err);
    }
  });

  app.post<{ Body: { email?: string } }>('/api/auth/users/promote', async (req, reply) => {
    try {
      const session = getAuthSessionFromCookieHeader(req.headers.cookie);
      if (!session) {
        throw serviceError('Authentication required', 401);
      }

      const access = await resolveUserApproval(session.username);
      if (access.blocked) {
        throw serviceError(getBlockedUserMessage(), 403);
      }
      if (!access.isAdmin) {
        throw serviceError('Admin approval required', 403);
      }

      const email = req.body?.email?.trim();
      if (!email) {
        throw serviceError('Email is required', 400);
      }

      await promoteUserByAdmin(email);
      return reply.send({ email, promoted: true });
    } catch (err) {
      return sendServiceError(reply, err);
    }
  });

  app.post<{ Body: { email?: string } }>('/api/auth/users/block', async (req, reply) => {
    try {
      const session = getAuthSessionFromCookieHeader(req.headers.cookie);
      if (!session) {
        throw serviceError('Authentication required', 401);
      }

      const access = await resolveUserApproval(session.username);
      if (access.blocked) {
        throw serviceError(getBlockedUserMessage(), 403);
      }
      if (!access.isAdmin) {
        throw serviceError('Admin approval required', 403);
      }

      const email = req.body?.email?.trim();
      if (!email) {
        throw serviceError('Email is required', 400);
      }

      await blockUserByAdmin(email, session.username);
      return reply.send({ email, blocked: true });
    } catch (err) {
      return sendServiceError(reply, err);
    }
  });

  app.post<{ Body: { email?: string } }>('/api/auth/users/unblock', async (req, reply) => {
    try {
      const session = getAuthSessionFromCookieHeader(req.headers.cookie);
      if (!session) {
        throw serviceError('Authentication required', 401);
      }

      const access = await resolveUserApproval(session.username);
      if (access.blocked) {
        throw serviceError(getBlockedUserMessage(), 403);
      }
      if (!access.isAdmin) {
        throw serviceError('Admin approval required', 403);
      }

      const email = req.body?.email?.trim();
      if (!email) {
        throw serviceError('Email is required', 400);
      }

      await unblockUserByAdmin(email, session.username);
      return reply.send({ email, blocked: false });
    } catch (err) {
      return sendServiceError(reply, err);
    }
  });

  app.post<{ Body: { email?: string; officeLocationId?: string } }>('/api/auth/users/demote', async (req, reply) => {
    try {
      const session = getAuthSessionFromCookieHeader(req.headers.cookie);
      if (!session) {
        throw serviceError('Authentication required', 401);
      }

      const access = await resolveUserApproval(session.username);
      if (access.blocked) {
        throw serviceError(getBlockedUserMessage(), 403);
      }
      if (!access.isAdmin) {
        throw serviceError('Admin approval required', 403);
      }

      const email = req.body?.email?.trim();
      if (!email) {
        throw serviceError('Email is required', 400);
      }

      await demoteUserByAdmin(email, req.body?.officeLocationId?.trim());
      return reply.send({ email, demoted: true });
    } catch (err) {
      return sendServiceError(reply, err);
    }
  });

  app.post<{ Body: { email?: string; officeLocationId?: string } }>(
    '/api/auth/users/assign-office',
    async (req, reply) => {
      try {
        const session = getAuthSessionFromCookieHeader(req.headers.cookie);
        if (!session) {
          throw serviceError('Authentication required', 401);
        }

        const access = await resolveUserApproval(session.username);
        if (access.blocked) {
          throw serviceError(getBlockedUserMessage(), 403);
        }
        if (!access.isAdmin) {
          throw serviceError('Admin approval required', 403);
        }

        const email = req.body?.email?.trim();
        if (!email) {
          throw serviceError('Email is required', 400);
        }
        const officeLocationId = req.body?.officeLocationId?.trim();
        if (!officeLocationId) {
          throw serviceError('Office location is required', 400);
        }

        await assignUserOfficeByAdmin(email, officeLocationId);
        return reply.send({ email, officeLocationId });
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  app.post<{
    Body: {
      email?: string;
      officeLocationIds?: string[];
      preferredOfficeLocationId?: string;
    };
  }>('/api/auth/users/assign-offices', async (req, reply) => {
    try {
      const session = getAuthSessionFromCookieHeader(req.headers.cookie);
      if (!session) {
        throw serviceError('Authentication required', 401);
      }

      const access = await resolveUserApproval(session.username);
      if (access.blocked) {
        throw serviceError(getBlockedUserMessage(), 403);
      }
      if (!access.isAdmin) {
        throw serviceError('Admin approval required', 403);
      }

      const email = req.body?.email?.trim();
      if (!email) {
        throw serviceError('Email is required', 400);
      }

      await assignUserOfficesByAdmin(
        email,
        Array.isArray(req.body?.officeLocationIds) ? req.body.officeLocationIds : [],
        req.body?.preferredOfficeLocationId?.trim(),
      );
      return reply.send({
        email,
        officeLocationIds: Array.isArray(req.body?.officeLocationIds) ? req.body.officeLocationIds : [],
        preferredOfficeLocationId: req.body?.preferredOfficeLocationId?.trim() ?? null,
      });
    } catch (err) {
      return sendServiceError(reply, err);
    }
  });

  app.post<{ Body: { name?: string } }>('/api/auth/offices', async (req, reply) => {
    try {
      const session = getAuthSessionFromCookieHeader(req.headers.cookie);
      if (!session) {
        throw serviceError('Authentication required', 401);
      }

      const access = await resolveUserApproval(session.username);
      if (access.blocked) {
        throw serviceError(getBlockedUserMessage(), 403);
      }
      if (!access.isAdmin) {
        throw serviceError('Admin approval required', 403);
      }

      const name = req.body?.name?.trim();
      if (!name) {
        throw serviceError('Office location name is required', 400);
      }

      const office = await createOfficeLocation(name);
      return reply.send({ office });
    } catch (err) {
      return sendServiceError(reply, err);
    }
  });

  app.post<{ Params: { officeId: string }; Body: { name?: string } }>(
    '/api/auth/offices/:officeId/rename',
    async (req, reply) => {
      try {
        const session = getAuthSessionFromCookieHeader(req.headers.cookie);
        if (!session) {
          throw serviceError('Authentication required', 401);
        }

        const access = await resolveUserApproval(session.username);
        if (access.blocked) {
          throw serviceError(getBlockedUserMessage(), 403);
        }
        if (!access.isAdmin) {
          throw serviceError('Admin approval required', 403);
        }

        const name = req.body?.name?.trim();
        if (!name) {
          throw serviceError('Office location name is required', 400);
        }

        const office = await renameOfficeLocation(req.params.officeId, name);
        return reply.send({ office });
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  app.post<{ Params: { officeId: string } }>('/api/auth/offices/:officeId/deactivate', async (req, reply) => {
    try {
      const session = getAuthSessionFromCookieHeader(req.headers.cookie);
      if (!session) {
        throw serviceError('Authentication required', 401);
      }

      const access = await resolveUserApproval(session.username);
      if (access.blocked) {
        throw serviceError(getBlockedUserMessage(), 403);
      }
      if (!access.isAdmin) {
        throw serviceError('Admin approval required', 403);
      }

      const office = await deactivateOfficeLocation(req.params.officeId);
      return reply.send({ office });
    } catch (err) {
      return sendServiceError(reply, err);
    }
  });

  app.post<{ Params: { officeId: string }; Body: UpdateOfficeLocationSettingsRequest }>(
    '/api/auth/offices/:officeId/settings',
    async (req, reply) => {
      try {
        const session = getAuthSessionFromCookieHeader(req.headers.cookie);
        if (!session) {
          throw serviceError('Authentication required', 401);
        }

        const access = await resolveUserApproval(session.username);
        if (access.blocked) {
          throw serviceError(getBlockedUserMessage(), 403);
        }
        if (!access.isAdmin) {
          throw serviceError('Admin approval required', 403);
        }

        const office = await updateOfficeLocationSettings(req.params.officeId, req.body);
        return reply.send({ office });
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  app.post('/api/auth/logout', async (_req, reply) => {
    reply.header('Set-Cookie', buildClearSessionCookieHeader());
    return reply.status(204).send();
  });

  app.get('/api/auth/entra/login', async (_req, reply) => {
    try {
      const entra = getEntraConfig();
      if (!entra.enabled) {
        throw serviceError('Entra authentication is not configured', 503);
      }

      const state = generateEntraState();
      const url = new URL(entra.authorizeUrl);
      url.searchParams.set('client_id', entra.clientId);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('redirect_uri', entra.redirectUri);
      url.searchParams.set('response_mode', 'query');
      url.searchParams.set('scope', entra.scope);
      url.searchParams.set('state', state);

      reply.header('Set-Cookie', buildSetEntraStateCookieHeader(state));
      return reply.redirect(url.toString());
    } catch (err) {
      return sendServiceError(reply, err);
    }
  });

  app.get('/api/auth/entra/callback', handleEntraCallback);
  app.get('/api/auth/callback/azure-ad', handleEntraCallback);
}
