import type { FastifyInstance } from 'fastify';
import * as foodSelectionService from '../services/foodSelection.js';
import * as pollService from '../services/poll.js';
import * as mealRecommendationService from '../services/mealRecommendation.js';
import * as mealRecommendationExploreService from '../services/mealRecommendationExplore.js';
import * as mealRecommendationPreVoteService from '../services/mealRecommendationPreVote.js';
import * as mealAnticipatedLikesService from '../services/mealAnticipatedLikes.js';
import prisma from '../db.js';
import { sendServiceError, serviceError } from './routeUtils.js';
import { isApprovalWorkflowEnabled } from '../services/authAccess.js';
import {
  readRequestedOfficeLocationId,
  resolveOfficeLocationIdFromCookie,
} from '../services/officeContext.js';
import { requireAuthenticatedActor } from './authIdentity.js';
import type {
  StartFoodSelectionRequest,
  PlaceOrderRequest,
  RateFoodOrderRequest,
  UpdateFoodOrderProcessedRequest,
  UpdateFoodOrderDeliveredRequest,
  WithdrawOrderRequest,
  ExtendFoodSelectionRequest,
  QuickStartFoodSelectionRequest,
  UpdateFoodSelectionEtaRequest,
  UpdateRemainingTimerRequest,
  PlaceDeliveryOrderRequest,
  ClaimOrderingResponsibilityRequest,
  RemindMissingOrdersRequest,
  PlaceFallbackOrderRequest,
  PingFallbackCandidateRequest,
  MealRecommendationRequest,
  MealRecommendationPreVoteRequest,
  MealRecommendationMarkRequest,
} from '../../lib/types.js';

async function requireAdminIfApprovalWorkflowEnabled(cookieHeader: string | undefined): Promise<void> {
  const actor = await requireAuthenticatedActor(cookieHeader);
  if (!isApprovalWorkflowEnabled()) {
    return;
  }

  if (!actor.isAdmin) {
    throw serviceError('Admin role required', 403);
  }
}

async function requireApprovedActorIfApprovalWorkflowEnabled(cookieHeader: string | undefined): Promise<{
  actorKey: string | null;
  isAdmin: boolean;
}> {
  const actor = await requireAuthenticatedActor(cookieHeader);
  return { actorKey: actor.actorKey, isAdmin: actor.isAdmin };
}

async function resolveOptionalApprovedActor(
  cookieHeader: string | undefined,
): Promise<{ actorKey: string | null; isAdmin: boolean } | null> {
  return requireApprovedActorIfApprovalWorkflowEnabled(cookieHeader);
}

async function requireAdminOrSelectionCreator(
  cookieHeader: string | undefined,
  selectionId: string,
): Promise<{ actorKey: string | null; isAdmin: boolean }> {
  const actor = await requireApprovedActorIfApprovalWorkflowEnabled(cookieHeader);
  if (actor.isAdmin) {
    return actor;
  }

  const selection = await prisma.foodSelection.findUnique({
    where: { id: selectionId },
    select: { createdBy: true },
  });
  if (!selection) {
    throw serviceError('Food selection not found', 404);
  }
  if (!selection.createdBy || actor.actorKey !== selection.createdBy.trim().toLowerCase()) {
    throw serviceError('Admin or creator role required', 403);
  }
  return actor;
}

function registerSelectionOverviewRoutes(app: FastifyInstance) {
  // POST /api/food-selections — start food selection
  app.post<{ Body: StartFoodSelectionRequest }>(
    '/api/food-selections',
    async (req, reply) => {
      try {
        const actor = await resolveOptionalApprovedActor(req.headers.cookie);
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const selection = await foodSelectionService.startFoodSelection(
          req.body.pollId,
          req.body.durationMinutes,
          officeLocationId,
          actor?.actorKey,
        );
        return reply.status(201).send(selection);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  // GET /api/food-selections/active — get active/overtime food selection with orders
  app.get('/api/food-selections/active', async (req, reply) => {
    try {
      await requireAuthenticatedActor(req.headers.cookie);
      const officeLocationId = await resolveOfficeLocationIdFromCookie(
        req.headers.cookie,
        readRequestedOfficeLocationId(req.query),
      );
      const selection = await foodSelectionService.getActiveFoodSelection(officeLocationId);
      if (!selection) {
        return reply.status(404).send({ error: 'No active food selection' });
      }
      return reply.send(selection);
    } catch (err) {
      return sendServiceError(reply, err);
    }
  });

  // GET /api/food-selections/history — latest completed selections (most recent first)
  app.get('/api/food-selections/history', async (req, reply) => {
    try {
      await requireAuthenticatedActor(req.headers.cookie);
      const officeLocationId = await resolveOfficeLocationIdFromCookie(
        req.headers.cookie,
        readRequestedOfficeLocationId(req.query),
      );
      const history = await foodSelectionService.getCompletedFoodSelectionsHistory(5, officeLocationId);
      return reply.send(history);
    } catch (err) {
      return sendServiceError(reply, err);
    }
  });

}

function registerOrderingRoutes(app: FastifyInstance) {
  // POST /api/food-selections/:id/orders — place/update order
  app.post<{ Params: { id: string }; Body: PlaceOrderRequest }>(
    '/api/food-selections/:id/orders',
    async (req, reply) => {
      try {
        const actor = await requireAuthenticatedActor(req.headers.cookie);
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const order = await foodSelectionService.placeOrder(
          req.params.id,
          actor.displayNameSnapshot,
          req.body.itemId,
          req.body.notes,
          officeLocationId,
          actor,
        );
        return reply.status(201).send(order);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  // DELETE /api/food-selections/:id/orders — withdraw order
  app.delete<{ Params: { id: string }; Body: WithdrawOrderRequest }>(
    '/api/food-selections/:id/orders',
    async (req, reply) => {
      try {
        const actor = await requireAuthenticatedActor(req.headers.cookie);
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        await foodSelectionService.withdrawOrder(
          req.params.id,
          actor.displayNameSnapshot,
          req.body.orderId,
          officeLocationId,
          actor,
        );
        return reply.status(204).send();
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

}

function registerSelectionLifecycleRoutes(app: FastifyInstance) {
  // POST /api/food-selections/:id/expire — trigger timer expiry
  app.post<{ Params: { id: string } }>(
    '/api/food-selections/:id/expire',
    async (req, reply) => {
      try {
        await requireAuthenticatedActor(req.headers.cookie);
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const selection = await foodSelectionService.expireFoodSelection(req.params.id, officeLocationId);
        return reply.send(selection);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  // POST /api/food-selections/:id/extend — extend overtime
  app.post<{ Params: { id: string }; Body: ExtendFoodSelectionRequest }>(
    '/api/food-selections/:id/extend',
    async (req, reply) => {
      try {
        await requireAdminOrSelectionCreator(req.headers.cookie, req.params.id);
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const selection = await foodSelectionService.extendFoodSelection(
          req.params.id,
          req.body.extensionMinutes,
          officeLocationId,
        );
        return reply.send(selection);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

}

function registerSelectionCompletionRoutes(app: FastifyInstance) {
  // POST /api/food-selections/:id/complete — finalize meal collection, enter ordering step
  app.post<{ Params: { id: string } }>(
    '/api/food-selections/:id/complete',
    async (req, reply) => {
      try {
        await requireApprovedActorIfApprovalWorkflowEnabled(req.headers.cookie);
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const selection = await foodSelectionService.completeFoodSelection(req.params.id, officeLocationId);
        return reply.send(selection);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  // POST /api/food-selections/:id/complete-now — finish active selection prematurely, enter ordering step
  app.post<{ Params: { id: string } }>(
    '/api/food-selections/:id/complete-now',
    async (req, reply) => {
      try {
        await requireApprovedActorIfApprovalWorkflowEnabled(req.headers.cookie);
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const selection = await foodSelectionService.completeFoodSelectionNow(req.params.id, officeLocationId);
        return reply.send(selection);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  // POST /api/food-selections/:id/remind-missing — manually remind voters who have not ordered yet
  app.post<{ Params: { id: string }; Body: RemindMissingOrdersRequest }>(
    '/api/food-selections/:id/remind-missing',
    async (req, reply) => {
      try {
        await requireAdminIfApprovalWorkflowEnabled(req.headers.cookie);
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const remindedCount = await foodSelectionService.sendMissingOrderReminderNow(
          req.params.id,
          officeLocationId,
        );
        return reply.send({ remindedCount });
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

}

function registerRecommendationAndFallbackRoutes(app: FastifyInstance) {
  // POST /api/food-selections/:id/recommendations — generate a personalized meal recommendation
  app.post<{ Params: { id: string }; Body: MealRecommendationRequest }>(
    '/api/food-selections/:id/recommendations',
    async (req, reply) => {
      try {
        const actor = await requireAuthenticatedActor(req.headers.cookie);
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const result = await mealRecommendationService.generateRecommendations(
          req.params.id,
          officeLocationId,
          actor,
          req.body?.useAi,
        );
        return reply.send(result);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  // POST /api/food-selections/:id/recommendations/explore — generate an exploratory recommendation set
  app.post<{ Params: { id: string } }>(
    '/api/food-selections/:id/recommendations/explore',
    async (req, reply) => {
      try {
        const actor = await requireAuthenticatedActor(req.headers.cookie);
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const result = await mealRecommendationExploreService.generateExploreRecommendations(
          req.params.id,
          officeLocationId,
          actor,
        );
        return reply.send(result);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  // POST /api/food-selections/:id/orders/:orderId/rating — rate completed meal
  app.post<{ Params: { id: string; orderId: string }; Body: RateFoodOrderRequest }>(
    '/api/food-selections/:id/orders/:orderId/rating',
    async (req, reply) => {
      try {
        const actor = await requireAuthenticatedActor(req.headers.cookie);
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const order = await foodSelectionService.rateOrder(
          req.params.id,
          req.params.orderId,
          actor.displayNameSnapshot,
          req.body.rating,
          req.body.feedbackComment,
          officeLocationId,
          actor,
        );
        return reply.send(order);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

}

function registerRecommendationMarkRoutes(app: FastifyInstance) {
  // PUT /api/food-selections/:id/marks/:itemId — upsert a personal anticipated-like mark
  app.put<{ Params: { id: string; itemId: string }; Body: MealRecommendationMarkRequest }>(
    '/api/food-selections/:id/marks/:itemId',
    async (req, reply) => {
      try {
        const actor = await requireAuthenticatedActor(req.headers.cookie);
        if (!req.body || (req.body.sentiment !== 'like' && req.body.sentiment !== 'dislike')) {
          throw serviceError('Sentiment must be like or dislike', 400);
        }
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const result = await mealAnticipatedLikesService.upsertMealAnticipatedLike(
          req.params.id,
          req.params.itemId,
          req.body.sentiment,
          officeLocationId,
          actor,
        );
        return reply.send(result);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  // DELETE /api/food-selections/:id/marks/:itemId — remove a personal anticipated-like mark
  app.delete<{ Params: { id: string; itemId: string } }>(
    '/api/food-selections/:id/marks/:itemId',
    async (req, reply) => {
      try {
        const actor = await requireAuthenticatedActor(req.headers.cookie);
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const result = await mealAnticipatedLikesService.deleteMealAnticipatedLike(
          req.params.id,
          req.params.itemId,
          officeLocationId,
          actor,
        );
        return reply.send(result);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  // GET /api/food-selections/:id/marks — list this user's marks on the current selection menu
  app.get<{ Params: { id: string } }>(
    '/api/food-selections/:id/marks',
    async (req, reply) => {
      try {
        const actor = await requireAuthenticatedActor(req.headers.cookie);
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const result = await mealAnticipatedLikesService.listMealAnticipatedLikes(
          req.params.id,
          officeLocationId,
          actor,
        );
        return reply.send(result);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  // GET /api/recommender/onboarding/candidates — office-scoped diverse onboarding picks
  app.get('/api/recommender/onboarding/candidates', async (req, reply) => {
    try {
      const actor = await requireAuthenticatedActor(req.headers.cookie);
      const officeLocationId = await resolveOfficeLocationIdFromCookie(
        req.headers.cookie,
        readRequestedOfficeLocationId(req.query),
      );
      const result = await mealAnticipatedLikesService.listMealRecommendationOnboardingCandidates(
        officeLocationId,
        actor,
      );
      return reply.send(result);
    } catch (err) {
      return sendServiceError(reply, err);
    }
  });

  // POST /api/recommender/pre-vote — preview likely dishes before the poll resolves
  app.post<{ Body: MealRecommendationPreVoteRequest }>(
    '/api/recommender/pre-vote',
    async (req, reply) => {
      try {
        const actor = await requireAuthenticatedActor(req.headers.cookie);
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const result = await mealRecommendationPreVoteService.generatePreVoteRecommendations(
          officeLocationId,
          actor,
          {
            pollId: req.body?.pollId,
            limit: req.body?.limit,
          },
        );
        return reply.send(result);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );
}

function registerFallbackRoutes(app: FastifyInstance) {
  // GET /api/food-selections/:id/fallback-candidates — users eligible for organizer fallback ordering
  app.get<{ Params: { id: string } }>(
    '/api/food-selections/:id/fallback-candidates',
    async (req, reply) => {
      try {
        await requireAuthenticatedActor(req.headers.cookie);
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const candidates = await foodSelectionService.listFallbackOrderCandidates(req.params.id, officeLocationId);
        return reply.send(candidates);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  // POST /api/food-selections/:id/fallback-orders — place a saved default meal for a missing voter
  app.post<{ Params: { id: string }; Body: PlaceFallbackOrderRequest }>(
    '/api/food-selections/:id/fallback-orders',
    async (req, reply) => {
      try {
        await requireAdminIfApprovalWorkflowEnabled(req.headers.cookie);
        const actor = await requireAuthenticatedActor(req.headers.cookie);
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const order = await foodSelectionService.placeFallbackOrder(
          req.params.id,
          req.body.nickname,
          actor.displayNameSnapshot,
          officeLocationId,
        );
        return reply.status(201).send(order);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

}

function registerFallbackReminderRoutes(app: FastifyInstance) {
  // POST /api/food-selections/:id/fallback-reminders — ping a specific fallback-eligible missing voter
  app.post<{ Params: { id: string }; Body: PingFallbackCandidateRequest }>(
    '/api/food-selections/:id/fallback-reminders',
    async (req, reply) => {
      try {
        await requireAdminIfApprovalWorkflowEnabled(req.headers.cookie);
        const actor = await requireAuthenticatedActor(req.headers.cookie);
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const result = await foodSelectionService.sendFallbackCandidateReminder(
          req.params.id,
          req.body.nickname,
          actor.displayNameSnapshot,
          officeLocationId,
        );
        return reply.send(result);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

}

function registerOrderStateRoutes(app: FastifyInstance) {
  // PATCH /api/food-selections/:id/orders/:orderId/processed — mark order line as processed/unprocessed
  app.patch<{ Params: { id: string; orderId: string }; Body: UpdateFoodOrderProcessedRequest }>(
    '/api/food-selections/:id/orders/:orderId/processed',
    async (req, reply) => {
      try {
        await requireAuthenticatedActor(req.headers.cookie);
        if (typeof req.body?.processed !== 'boolean') {
          throw serviceError('Processed flag must be boolean', 400);
        }
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const order = await foodSelectionService.setOrderProcessed(
          req.params.id,
          req.params.orderId,
          req.body.processed,
          officeLocationId,
        );
        return reply.send(order);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  // PATCH /api/food-selections/:id/orders/:orderId/delivered — mark order line as delivered/not-delivered
  app.patch<{ Params: { id: string; orderId: string }; Body: UpdateFoodOrderDeliveredRequest }>(
    '/api/food-selections/:id/orders/:orderId/delivered',
    async (req, reply) => {
      try {
        await requireAuthenticatedActor(req.headers.cookie);
        if (typeof req.body?.delivered !== 'boolean') {
          throw serviceError('Delivered flag must be boolean', 400);
        }
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const order = await foodSelectionService.setOrderDelivered(
          req.params.id,
          req.params.orderId,
          req.body.delivered,
          officeLocationId,
        );
        return reply.send(order);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

}

function registerDeliveryRoutes(app: FastifyInstance) {
  // POST /api/food-selections/:id/place-order — confirm order placement and start delivery timer
  app.post<{ Params: { id: string }; Body: ClaimOrderingResponsibilityRequest }>(
    '/api/food-selections/:id/claim-ordering',
    async (req, reply) => {
      try {
        const actor = await requireAuthenticatedActor(req.headers.cookie);
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const selection = await foodSelectionService.claimOrderingResponsibility(
          req.params.id,
          actor.displayNameSnapshot,
          officeLocationId,
        );
        return reply.send(selection);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  // POST /api/food-selections/:id/place-order — confirm order placement and start delivery timer
  app.post<{ Params: { id: string }; Body: PlaceDeliveryOrderRequest }>(
    '/api/food-selections/:id/place-order',
    async (req, reply) => {
      try {
        const actor = await requireAuthenticatedActor(req.headers.cookie);
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const selection = await foodSelectionService.placeDeliveryOrder(
          req.params.id,
          req.body.etaMinutes,
          actor.displayNameSnapshot,
          officeLocationId,
        );
        return reply.send(selection);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

}

function registerSelectionControlRoutes(app: FastifyInstance) {
  // POST /api/food-selections/:id/timer — update active selection timer remaining minutes
  app.post<{ Params: { id: string }; Body: UpdateRemainingTimerRequest }>(
    '/api/food-selections/:id/timer',
    async (req, reply) => {
      try {
        await requireAdminOrSelectionCreator(req.headers.cookie, req.params.id);
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const selection = await foodSelectionService.updateActiveFoodSelectionTimer(
          req.params.id,
          req.body.remainingMinutes,
          officeLocationId,
        );
        return reply.send(selection);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  // POST /api/food-selections/:id/abort — abort in-progress selection and reset process
  app.post<{ Params: { id: string } }>(
    '/api/food-selections/:id/abort',
    async (req, reply) => {
      try {
        await requireAdminIfApprovalWorkflowEnabled(req.headers.cookie);
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const selection = await foodSelectionService.abortFoodSelection(req.params.id, officeLocationId);
        return reply.send(selection);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

}

function registerDeliveryCompletionRoutes(app: FastifyInstance) {
  // POST /api/food-selections/:id/eta — set/update delivery ETA in minutes for ongoing delivery phase
  app.post<{ Params: { id: string }; Body: UpdateFoodSelectionEtaRequest }>(
    '/api/food-selections/:id/eta',
    async (req, reply) => {
      try {
        await requireAuthenticatedActor(req.headers.cookie);
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const selection = await foodSelectionService.updateCompletedFoodSelectionEta(
          req.params.id,
          req.body.etaMinutes,
          officeLocationId,
        );
        return reply.send(selection);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  // POST /api/food-selections/:id/confirm-arrival — finalize cycle and persist in history
  app.post<{ Params: { id: string } }>(
    '/api/food-selections/:id/confirm-arrival',
    async (req, reply) => {
      try {
        await requireAuthenticatedActor(req.headers.cookie);
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const selection = await foodSelectionService.confirmFoodArrival(req.params.id, officeLocationId);
        return reply.send(selection);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

}

function registerQuickStartAndExportRoutes(app: FastifyInstance) {
  // POST /api/food-selections/quick-start — skip poll for single menu
  app.post<{ Body: QuickStartFoodSelectionRequest }>(
    '/api/food-selections/quick-start',
    async (req, reply) => {
      try {
        const actor = await resolveOptionalApprovedActor(req.headers.cookie);
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        // Find menus that have at least one item
        const menus = await prisma.menu.findMany({
          where: { officeLocationId, items: { some: {} } },
          include: { items: true },
        });
        if (menus.length !== 1) {
          return reply.status(400).send({
            error:
              menus.length === 0
                ? 'No menus with items exist'
                : 'Quick start requires exactly one menu with items',
          });
        }

        const menu = menus[0];

        // Auto-create a finished poll for the single menu
        const poll = await pollService.createAutoFinishedPoll(menu.id, menu.name, officeLocationId);

        // Start food selection using the auto-created poll
        const selection = await foodSelectionService.startFoodSelection(
          poll.id,
          req.body.durationMinutes,
          officeLocationId,
          actor?.actorKey,
        );
        return reply.status(201).send(selection);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  // GET /api/food-selections/export/mine — export own orders/ratings as Excel
  app.get<{ Querystring: { nickname?: string } }>(
    '/api/food-selections/export/mine',
    async (req, reply) => {
      try {
        const actor = await requireAuthenticatedActor(req.headers.cookie);
        const workbook = await foodSelectionService.exportOrdersForUserXlsx(
          actor.displayNameSnapshot,
          actor,
        );
        const safeNickname = actor.displayNameSnapshot.replace(/[^a-zA-Z0-9._-]/g, '_');
        const fileName = `team-lunch-orders-${safeNickname || 'user'}.xlsx`;

        reply.header(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        reply.header('Content-Disposition', `attachment; filename="${fileName}"`);
        return reply.send(workbook);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );
}

export default async function foodSelectionRoutes(app: FastifyInstance) {
  registerSelectionOverviewRoutes(app);
  registerOrderingRoutes(app);
  registerSelectionLifecycleRoutes(app);
  registerSelectionCompletionRoutes(app);
  registerRecommendationAndFallbackRoutes(app);
  registerRecommendationMarkRoutes(app);
  registerFallbackRoutes(app);
  registerFallbackReminderRoutes(app);
  registerOrderStateRoutes(app);
  registerDeliveryRoutes(app);
  registerSelectionControlRoutes(app);
  registerDeliveryCompletionRoutes(app);
  registerQuickStartAndExportRoutes(app);
}
