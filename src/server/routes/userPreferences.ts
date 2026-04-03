import type { FastifyInstance } from 'fastify';
import { getAuthSessionFromCookieHeader } from '../services/authSession.js';
import { sendServiceError, serviceError } from './routeUtils.js';
import * as userPreferencesService from '../services/userPreferences.js';
import * as userMenuDefaultsService from '../services/userMenuDefaults.js';
import { getBlockedUserMessage, resolveUserApproval } from '../services/authAccess.js';
import type {
  UpdateUserPreferencesRequest,
  UpdateUserMenuDefaultPreferenceRequest,
} from '../../lib/types.js';

async function resolveUserKey(cookieHeader: string | undefined, fallbackNickname?: string): Promise<string> {
  const session = getAuthSessionFromCookieHeader(cookieHeader);
  if (session) {
    const approval = await resolveUserApproval(session.username);
    if (approval.blocked) {
      throw serviceError(getBlockedUserMessage(), 403);
    }
    if (approval.approvalRequired && !approval.approved && !approval.isAdmin) {
      throw serviceError('User is awaiting approval', 403);
    }
    return session.username;
  }

  const trimmed = fallbackNickname?.trim();
  if (!trimmed) {
    throw serviceError('Nickname is required', 400);
  }

  return trimmed;
}

export default async function userPreferencesRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { nickname?: string } }>('/api/user/preferences', async (req, reply) => {
    try {
      const userKey = await resolveUserKey(req.headers.cookie, req.query.nickname);
      const preferences = await userPreferencesService.getUserPreferences(userKey);
      return reply.send(preferences);
    } catch (err) {
      return sendServiceError(reply, err);
    }
  });

  app.put<{ Body: UpdateUserPreferencesRequest }>('/api/user/preferences', async (req, reply) => {
    try {
      const userKey = await resolveUserKey(req.headers.cookie, req.body.nickname);
      const preferences = await userPreferencesService.upsertUserPreferences(
        userKey,
        req.body.allergies,
        req.body.dislikes,
      );
      return reply.send(preferences);
    } catch (err) {
      return sendServiceError(reply, err);
    }
  });

  app.get<{ Querystring: { nickname?: string } }>('/api/user/menu-defaults', async (req, reply) => {
    try {
      const userKey = await resolveUserKey(req.headers.cookie, req.query.nickname);
      const preferences = await userMenuDefaultsService.listUserMenuDefaultPreferences(userKey);
      return reply.send(preferences);
    } catch (err) {
      return sendServiceError(reply, err);
    }
  });

  app.put<{ Params: { menuId: string }; Body: UpdateUserMenuDefaultPreferenceRequest }>(
    '/api/user/menu-defaults/:menuId',
    async (req, reply) => {
      try {
        const userKey = await resolveUserKey(req.headers.cookie, req.body.nickname);
        const preference = await userMenuDefaultsService.upsertUserMenuDefaultPreference(
          userKey,
          req.params.menuId,
          req.body.itemId,
          req.body.defaultComment,
          req.body.allowOrganizerFallback,
        );
        return reply.send(preference);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );
}
