import type { FastifyInstance } from 'fastify';
import * as foodSelectionService from '../services/foodSelection.js';
import * as pollService from '../services/poll.js';
import prisma from '../db.js';
import { sendServiceError, serviceError } from './routeUtils.js';
import { getAuthSessionFromCookieHeader } from '../services/authSession.js';
import {
  getBlockedUserMessage,
  isApprovalWorkflowEnabled,
  resolveUserApproval,
} from '../services/authAccess.js';
import {
  readRequestedOfficeLocationId,
  resolveOfficeLocationIdFromCookie,
} from '../services/officeContext.js';
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
} from '../../lib/types.js';

function resolveActingNickname(
  cookieHeader: string | undefined,
  providedNickname: string | undefined,
): Promise<string> | string {
  const session = getAuthSessionFromCookieHeader(cookieHeader);
  if (session) {
    return (async () => {
      const approval = await resolveUserApproval(session.username);
      if (approval.blocked) {
        throw serviceError(getBlockedUserMessage(), 403);
      }
      if (approval.approvalRequired && !approval.approved && !approval.isAdmin) {
        throw serviceError('User is awaiting approval', 403);
      }
      return session.username;
    })();
  }

  const nickname = providedNickname?.trim();
  if (!nickname) {
    throw serviceError('Nickname is required', 400);
  }
  if (nickname.length > 30) {
    throw serviceError('Nickname must be 1–30 characters', 400);
  }
  return nickname;
}

async function requireAdminIfApprovalWorkflowEnabled(cookieHeader: string | undefined): Promise<void> {
  if (process.env.NODE_ENV === 'test' && process.env.AUTHZ_ENFORCE_ADMIN !== 'true') {
    return;
  }

  if (!isApprovalWorkflowEnabled()) {
    return;
  }

  const session = getAuthSessionFromCookieHeader(cookieHeader);
  if (!session) {
    throw serviceError('Authentication required', 401);
  }

  const approval = await resolveUserApproval(session.username);
  if (approval.blocked) {
    throw serviceError(getBlockedUserMessage(), 403);
  }
  if (!approval.isAdmin) {
    throw serviceError('Admin role required', 403);
  }
}

async function requireApprovedActorIfApprovalWorkflowEnabled(cookieHeader: string | undefined): Promise<{
  actorKey: string | null;
  isAdmin: boolean;
}> {
  if (!isApprovalWorkflowEnabled()) {
    const session = getAuthSessionFromCookieHeader(cookieHeader);
    return {
      actorKey: session?.username?.trim().toLowerCase() ?? null,
      isAdmin: false,
    };
  }

  const session = getAuthSessionFromCookieHeader(cookieHeader);
  if (!session) {
    throw serviceError('Authentication required', 401);
  }

  const approval = await resolveUserApproval(session.username);
  if (approval.blocked) {
    throw serviceError(getBlockedUserMessage(), 403);
  }
  if (!approval.isAdmin && !approval.approved) {
    throw serviceError('User is awaiting approval', 403);
  }

  return {
    actorKey: session.username.trim().toLowerCase(),
    isAdmin: approval.isAdmin,
  };
}

async function resolveOptionalApprovedActor(
  cookieHeader: string | undefined,
): Promise<{ actorKey: string | null; isAdmin: boolean } | null> {
  const session = getAuthSessionFromCookieHeader(cookieHeader);
  if (!session) {
    return null;
  }
  return requireApprovedActorIfApprovalWorkflowEnabled(cookieHeader);
}

async function requireAdminOrSelectionCreator(
  cookieHeader: string | undefined,
  selectionId: string,
): Promise<{ actorKey: string | null; isAdmin: boolean }> {
  if (process.env.NODE_ENV === 'test' && process.env.AUTHZ_ENFORCE_ADMIN !== 'true') {
    const session = getAuthSessionFromCookieHeader(cookieHeader);
    return { actorKey: session?.username?.trim().toLowerCase() ?? null, isAdmin: true };
  }

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

export default async function foodSelectionRoutes(app: FastifyInstance) {
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
    const officeLocationId = await resolveOfficeLocationIdFromCookie(
      req.headers.cookie,
      readRequestedOfficeLocationId(req.query),
    );
    const selection = await foodSelectionService.getActiveFoodSelection(officeLocationId);
    if (!selection) {
      return reply.status(404).send({ error: 'No active food selection' });
    }
    return reply.send(selection);
  });

  // GET /api/food-selections/history — latest completed selections (most recent first)
  app.get('/api/food-selections/history', async (req, reply) => {
    try {
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

  // POST /api/food-selections/:id/orders — place/update order
  app.post<{ Params: { id: string }; Body: PlaceOrderRequest }>(
    '/api/food-selections/:id/orders',
    async (req, reply) => {
      try {
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const order = await foodSelectionService.placeOrder(
          req.params.id,
          req.body.nickname,
          req.body.itemId,
          req.body.notes,
          officeLocationId,
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
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        await foodSelectionService.withdrawOrder(
          req.params.id,
          req.body.nickname,
          req.body.orderId,
          officeLocationId,
        );
        return reply.status(204).send();
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  // POST /api/food-selections/:id/expire — trigger timer expiry
  app.post<{ Params: { id: string } }>(
    '/api/food-selections/:id/expire',
    async (req, reply) => {
      try {
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

  // POST /api/food-selections/:id/orders/:orderId/rating — rate completed meal
  app.post<{ Params: { id: string; orderId: string }; Body: RateFoodOrderRequest }>(
    '/api/food-selections/:id/orders/:orderId/rating',
    async (req, reply) => {
      try {
        const nickname = await resolveActingNickname(req.headers.cookie, req.body.nickname);
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const order = await foodSelectionService.rateOrder(
          req.params.id,
          req.params.orderId,
          nickname,
          req.body.rating,
          req.body.feedbackComment,
          officeLocationId,
        );
        return reply.send(order);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  // GET /api/food-selections/:id/fallback-candidates — users eligible for organizer fallback ordering
  app.get<{ Params: { id: string } }>(
    '/api/food-selections/:id/fallback-candidates',
    async (req, reply) => {
      try {
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
        const actingNickname = await resolveActingNickname(
          req.headers.cookie,
          req.body.actingNickname,
        );
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const order = await foodSelectionService.placeFallbackOrder(
          req.params.id,
          req.body.nickname,
          actingNickname,
          officeLocationId,
        );
        return reply.status(201).send(order);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  // POST /api/food-selections/:id/fallback-reminders — ping a specific fallback-eligible missing voter
  app.post<{ Params: { id: string }; Body: PingFallbackCandidateRequest }>(
    '/api/food-selections/:id/fallback-reminders',
    async (req, reply) => {
      try {
        await requireAdminIfApprovalWorkflowEnabled(req.headers.cookie);
        const actingNickname = await resolveActingNickname(
          req.headers.cookie,
          req.body.actingNickname,
        );
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const result = await foodSelectionService.sendFallbackCandidateReminder(
          req.params.id,
          req.body.nickname,
          actingNickname,
          officeLocationId,
        );
        return reply.send(result);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  // PATCH /api/food-selections/:id/orders/:orderId/processed — mark order line as processed/unprocessed
  app.patch<{ Params: { id: string; orderId: string }; Body: UpdateFoodOrderProcessedRequest }>(
    '/api/food-selections/:id/orders/:orderId/processed',
    async (req, reply) => {
      try {
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

  // POST /api/food-selections/:id/place-order — confirm order placement and start delivery timer
  app.post<{ Params: { id: string }; Body: ClaimOrderingResponsibilityRequest }>(
    '/api/food-selections/:id/claim-ordering',
    async (req, reply) => {
      try {
        const nickname = await resolveActingNickname(req.headers.cookie, req.body.nickname);
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const selection = await foodSelectionService.claimOrderingResponsibility(
          req.params.id,
          nickname,
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
        const nickname = await resolveActingNickname(req.headers.cookie, req.body.nickname);
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const selection = await foodSelectionService.placeDeliveryOrder(
          req.params.id,
          req.body.etaMinutes,
          nickname,
          officeLocationId,
        );
        return reply.send(selection);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

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

  // POST /api/food-selections/:id/eta — set/update delivery ETA in minutes for ongoing delivery phase
  app.post<{ Params: { id: string }; Body: UpdateFoodSelectionEtaRequest }>(
    '/api/food-selections/:id/eta',
    async (req, reply) => {
      try {
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
        const nickname = await resolveActingNickname(req.headers.cookie, req.query.nickname);
        const workbook = await foodSelectionService.exportOrdersForUserXlsx(nickname);
        const safeNickname = nickname.replace(/[^a-zA-Z0-9._-]/g, '_');
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
