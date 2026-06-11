import type { FastifyInstance } from 'fastify';
import { sendServiceError } from './routeUtils.js';
import * as userPreferencesService from '../services/userPreferences.js';
import * as userMenuDefaultsService from '../services/userMenuDefaults.js';
import { requireAuthenticatedActor } from './authIdentity.js';
import type {
  UpdateUserPreferencesRequest,
  UpdateUserMenuDefaultPreferenceRequest,
} from '../../lib/types.js';

async function resolveUserKey(cookieHeader: string | undefined, testFallbackLabel?: string): Promise<string> {
  return (await requireAuthenticatedActor(cookieHeader, testFallbackLabel)).actorKey;
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
