import type { FastifyInstance } from 'fastify';
import * as shoppingListService from '../services/shoppingList.js';
import { sendServiceError, serviceError } from './routeUtils.js';
import { getAuthSessionFromCookieHeader } from '../services/authSession.js';
import {
  getBlockedUserMessage,
  resolveUserApproval,
} from '../services/authAccess.js';
import {
  readRequestedOfficeLocationId,
  resolveOfficeLocationIdFromCookie,
} from '../services/officeContext.js';
import type {
  CreateShoppingListItemRequest,
  MarkShoppingListItemBoughtRequest,
} from '../../lib/types.js';

async function resolveActingNickname(
  cookieHeader: string | undefined,
  providedNickname: string | undefined,
): Promise<string> {
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

  const nickname = providedNickname?.trim();
  if (!nickname) {
    throw serviceError('Nickname is required', 400);
  }
  if (nickname.length > 255) {
    throw serviceError('Nickname must be 1-255 characters', 400);
  }
  return nickname;
}

export default async function shoppingListRoutes(app: FastifyInstance) {
  app.get('/api/shopping-list', async (req, reply) => {
    try {
      const officeLocationId = await resolveOfficeLocationIdFromCookie(
        req.headers.cookie,
        readRequestedOfficeLocationId(req.query),
      );
      const items = await shoppingListService.listShoppingListItems(officeLocationId);
      return reply.send(items);
    } catch (err) {
      return sendServiceError(reply, err);
    }
  });

  app.post<{ Body: CreateShoppingListItemRequest }>(
    '/api/shopping-list',
    async (req, reply) => {
      try {
        const nickname = await resolveActingNickname(req.headers.cookie, req.body.nickname);
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const item = await shoppingListService.addShoppingListItem(req.body.name, nickname, officeLocationId);
        return reply.status(201).send(item);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  app.post<{ Params: { id: string }; Body: MarkShoppingListItemBoughtRequest }>(
    '/api/shopping-list/:id/bought',
    async (req, reply) => {
      try {
        const nickname = await resolveActingNickname(req.headers.cookie, req.body.nickname);
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const item = await shoppingListService.markShoppingListItemBought(req.params.id, nickname, officeLocationId);
        return reply.send(item);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );
}
