import type { FastifyInstance } from 'fastify';
import { serviceError, sendServiceError } from './routeUtils.js';
import { requireAuthenticatedActor } from './authIdentity.js';
import { evaluateMealRecommendationModel } from '../services/mealRecommendationEval.js';
import {
  getRecommenderAdminStatus,
  setOfficeRecommenderExploreEnabled,
  setOfficeRecommenderSafeMode,
} from '../services/officeRecommenderSettings.js';
import {
  persistMealRecommendationModel,
  trainMealRecommendationModelFromData,
} from '../services/mealRecommendationModel.js';
import type {
  RecommenderEvaluationRequest,
  RecommenderOfficeExploreRequest,
  RecommenderOfficeModeRequest,
} from '../../lib/types.js';

async function requireAdminActor(cookieHeader: string | undefined): Promise<void> {
  const actor = await requireAuthenticatedActor(cookieHeader);
  if (!actor.isAdmin) {
    throw serviceError('Admin role required', 403);
  }
}

export default async function recommenderAdminRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/admin/recommender/train', async (req, reply) => {
    try {
      await requireAdminActor(req.headers.cookie);
      const { model, trainingSampleCount } = await trainMealRecommendationModelFromData();
      const saved = await persistMealRecommendationModel(model, trainingSampleCount);
      return reply.status(202).send({ modelVersion: saved.version, trainingSampleCount });
    } catch (err) {
      return sendServiceError(reply, err);
    }
  });

  app.post<{ Body: RecommenderEvaluationRequest }>('/api/admin/recommender/evaluate', async (req, reply) => {
    try {
      await requireAdminActor(req.headers.cookie);
      const result = await evaluateMealRecommendationModel(req.body ?? {});
      return reply.send(result);
    } catch (err) {
      return sendServiceError(reply, err);
    }
  });

  app.get('/api/admin/recommender/status', async (req, reply) => {
    try {
      await requireAdminActor(req.headers.cookie);
      const result = await getRecommenderAdminStatus();
      return reply.send(result);
    } catch (err) {
      return sendServiceError(reply, err);
    }
  });

  app.put<{ Params: { officeId: string }; Body: RecommenderOfficeModeRequest }>(
    '/api/admin/recommender/offices/:officeId/mode',
    async (req, reply) => {
      try {
        await requireAdminActor(req.headers.cookie);
        const result = await setOfficeRecommenderSafeMode(
          req.params.officeId,
          req.body.safeMode,
          req.body.modelVersion ?? null,
        );
        return reply.send(result);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  app.put<{ Params: { officeId: string }; Body: RecommenderOfficeExploreRequest }>(
    '/api/admin/recommender/offices/:officeId/explore',
    async (req, reply) => {
      try {
        await requireAdminActor(req.headers.cookie);
        const result = await setOfficeRecommenderExploreEnabled(req.params.officeId, req.body.enabled);
        return reply.send(result);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );
}
