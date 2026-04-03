import type { FastifyInstance } from 'fastify';
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
  StartPollRequest,
  CastVoteRequest,
  WithdrawVoteRequest,
  ExtendPollRequest,
  UpdateRemainingTimerRequest,
} from '../../lib/types.js';

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

async function requireAdminOrPollCreator(
  cookieHeader: string | undefined,
  pollId: string,
): Promise<{ actorKey: string | null; isAdmin: boolean }> {
  if (process.env.NODE_ENV === 'test' && process.env.AUTHZ_ENFORCE_ADMIN !== 'true') {
    const session = getAuthSessionFromCookieHeader(cookieHeader);
    return { actorKey: session?.username?.trim().toLowerCase() ?? null, isAdmin: true };
  }

  const actor = await requireApprovedActorIfApprovalWorkflowEnabled(cookieHeader);
  if (actor.isAdmin) {
    return actor;
  }

  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    select: { createdBy: true },
  });
  if (!poll) {
    throw serviceError('Poll not found', 404);
  }
  if (!poll.createdBy || actor.actorKey !== poll.createdBy.trim().toLowerCase()) {
    throw serviceError('Admin or creator role required', 403);
  }
  return actor;
}

export default async function pollRoutes(app: FastifyInstance) {
  // POST /api/polls — start a new poll
  app.post<{ Body: StartPollRequest }>('/api/polls', async (req, reply) => {
    try {
      const actor = await resolveOptionalApprovedActor(req.headers.cookie);
      const officeLocationId = await resolveOfficeLocationIdFromCookie(
        req.headers.cookie,
        readRequestedOfficeLocationId(req.query),
      );
      const poll = await pollService.startPoll(
        req.body.description,
        req.body.durationMinutes,
        req.body.excludedMenuJustifications,
        officeLocationId,
        actor?.actorKey,
      );
      return reply.status(201).send(poll);
    } catch (err) {
      return sendServiceError(reply, err);
    }
  });

  // GET /api/polls/active — get current active/tied poll
  app.get('/api/polls/active', async (req, reply) => {
    const officeLocationId = await resolveOfficeLocationIdFromCookie(
      req.headers.cookie,
      readRequestedOfficeLocationId(req.query),
    );
    const poll = await pollService.getActivePoll(officeLocationId);
    if (!poll) return reply.status(404).send({ error: 'No active poll' });
    return reply.send(poll);
  });

  // POST /api/polls/:id/votes — cast a vote
  app.post<{ Params: { id: string }; Body: CastVoteRequest }>(
    '/api/polls/:id/votes',
    async (req, reply) => {
      try {
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const poll = await pollService.castVote(
          req.params.id,
          req.body.menuId,
          req.body.nickname,
          officeLocationId,
        );
        return reply.status(201).send(poll);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  // DELETE /api/polls/:id/votes — withdraw a vote
  app.delete<{ Params: { id: string }; Body: WithdrawVoteRequest }>(
    '/api/polls/:id/votes',
    async (req, reply) => {
      try {
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const poll = await pollService.withdrawVote(
          req.params.id,
          req.body.menuId,
          req.body.nickname,
          officeLocationId,
        );
        return reply.send(poll);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  // DELETE /api/polls/:id/votes/all — withdraw all votes for a user
  app.delete<{ Params: { id: string }; Body: { nickname: string } }>(
    '/api/polls/:id/votes/all',
    async (req, reply) => {
      try {
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const poll = await pollService.withdrawAllVotes(req.params.id, req.body.nickname, officeLocationId);
        return reply.send(poll);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  // POST /api/polls/:id/end — trigger timer expiry / end poll
  app.post<{ Params: { id: string } }>('/api/polls/:id/end', async (req, reply) => {
    try {
      const session = getAuthSessionFromCookieHeader(req.headers.cookie);
      const officeLocationId = await resolveOfficeLocationIdFromCookie(
        req.headers.cookie,
        readRequestedOfficeLocationId(req.query),
      );
      return reply.send(
        await pollService.endPoll(req.params.id, {
          allowPremature: true,
          actorEmail: session?.username,
        }, officeLocationId),
      );
    } catch (err) {
      return sendServiceError(reply, err);
    }
  });

  // POST /api/polls/:id/timer — update active poll timer remaining minutes
  app.post<{ Params: { id: string }; Body: UpdateRemainingTimerRequest }>(
    '/api/polls/:id/timer',
    async (req, reply) => {
      try {
        await requireAdminOrPollCreator(req.headers.cookie, req.params.id);
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const poll = await pollService.updateActivePollTimer(
          req.params.id,
          req.body.remainingMinutes,
          officeLocationId,
        );
        return reply.send(poll);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  // POST /api/polls/:id/extend — extend a tied poll
  app.post<{ Params: { id: string }; Body: ExtendPollRequest }>(
    '/api/polls/:id/extend',
    async (req, reply) => {
      try {
        await requireAdminOrPollCreator(req.headers.cookie, req.params.id);
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        return reply.send(await pollService.extendPoll(req.params.id, req.body.extensionMinutes, officeLocationId));
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  // POST /api/polls/:id/random-winner — pick random winner from tie
  app.post<{ Params: { id: string } }>('/api/polls/:id/random-winner', async (req, reply) => {
    try {
      const officeLocationId = await resolveOfficeLocationIdFromCookie(
        req.headers.cookie,
        readRequestedOfficeLocationId(req.query),
      );
      return reply.send(await pollService.randomWinner(req.params.id, officeLocationId));
    } catch (err) {
      return sendServiceError(reply, err);
    }
  });

  // POST /api/polls/:id/abort — abort an active or tied poll
  app.post<{ Params: { id: string } }>('/api/polls/:id/abort', async (req, reply) => {
    try {
      await requireAdminIfApprovalWorkflowEnabled(req.headers.cookie);
      const session = getAuthSessionFromCookieHeader(req.headers.cookie);
      const officeLocationId = await resolveOfficeLocationIdFromCookie(
        req.headers.cookie,
        readRequestedOfficeLocationId(req.query),
      );
      return reply.send(
        await pollService.abortPoll(req.params.id, { actorEmail: session?.username }, officeLocationId),
      );
    } catch (err) {
      return sendServiceError(reply, err);
    }
  });
}
