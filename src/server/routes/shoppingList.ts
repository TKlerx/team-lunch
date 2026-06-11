import type { FastifyInstance } from 'fastify';
import * as shoppingListService from '../services/shoppingList.js';
import { sendServiceError } from './routeUtils.js';
import {
  readRequestedOfficeLocationId,
  resolveOfficeLocationIdFromCookie,
} from '../services/officeContext.js';
import { requireAuthenticatedActor } from './authIdentity.js';
import type {
  CreateShoppingListItemRequest,
  MarkShoppingListItemBoughtRequest,
} from '../../lib/types.js';

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
        const actor = await requireAuthenticatedActor(req.headers.cookie, req.body.nickname);
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const item = await shoppingListService.addShoppingListItem(req.body.name, actor.displayNameSnapshot, officeLocationId);
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
        const actor = await requireAuthenticatedActor(req.headers.cookie, req.body.nickname);
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const item = await shoppingListService.markShoppingListItemBought(req.params.id, actor.displayNameSnapshot, officeLocationId);
        return reply.send(item);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );
}
