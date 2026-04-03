import type { FastifyInstance } from 'fastify';
import * as menuService from '../services/menu.js';
import { sendServiceError } from './routeUtils.js';
import {
  readRequestedOfficeLocationId,
  resolveOfficeLocationIdFromCookie,
} from '../services/officeContext.js';
import type {
  CreateMenuRequest,
  UpdateMenuRequest,
  CreateMenuItemRequest,
  UpdateMenuItemRequest,
  ImportMenuRequest,
} from '../../lib/types.js';

export default async function menuRoutes(app: FastifyInstance) {
  // GET /api/menus — list all menus with items
  app.get('/api/menus', async (req, reply) => {
    const officeLocationId = await resolveOfficeLocationIdFromCookie(
      req.headers.cookie,
      readRequestedOfficeLocationId(req.query),
    );
    const menus = await menuService.listMenus(officeLocationId);
    return reply.send(menus);
  });

  // POST /api/menus — create menu
  app.post<{ Body: CreateMenuRequest }>('/api/menus', async (req, reply) => {
    try {
      const officeLocationId = await resolveOfficeLocationIdFromCookie(
        req.headers.cookie,
        readRequestedOfficeLocationId(req.query),
      );
      const menu = await menuService.createMenu(req.body.name, officeLocationId);
      return reply.status(201).send(menu);
    } catch (err) {
      return sendServiceError(reply, err);
    }
  });

  // POST /api/menus/import — import menu JSON payload (all-or-nothing)
  app.post<{ Body: ImportMenuRequest }>('/api/menus/import', async (req, reply) => {
    try {
      const officeLocationId = await resolveOfficeLocationIdFromCookie(
        req.headers.cookie,
        readRequestedOfficeLocationId(req.query),
      );
      const result = await menuService.importMenuFromJson(req.body.payload, officeLocationId);
      return reply.send(result);
    } catch (err) {
      return sendServiceError(reply, err);
    }
  });

  // POST /api/menus/import/preview — validate payload and return change summary
  app.post<{ Body: ImportMenuRequest }>(
    '/api/menus/import/preview',
    async (req, reply) => {
      try {
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const result = await menuService.previewMenuImportFromJson(req.body.payload, officeLocationId);
        return reply.send(result);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  // PUT /api/menus/:id — rename menu
  app.put<{ Params: { id: string }; Body: UpdateMenuRequest }>(
    '/api/menus/:id',
    async (req, reply) => {
      try {
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const menu = await menuService.updateMenu(req.params.id, req.body, officeLocationId);
        return reply.send(menu);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  // DELETE /api/menus/:id — delete menu
  app.delete<{ Params: { id: string } }>('/api/menus/:id', async (req, reply) => {
    try {
      const officeLocationId = await resolveOfficeLocationIdFromCookie(
        req.headers.cookie,
        readRequestedOfficeLocationId(req.query),
      );
      await menuService.deleteMenu(req.params.id, officeLocationId);
      return reply.status(204).send();
    } catch (err) {
      return sendServiceError(reply, err);
    }
  });

  // POST /api/menus/:menuId/items — add item
  app.post<{ Params: { menuId: string }; Body: CreateMenuItemRequest }>(
    '/api/menus/:menuId/items',
    async (req, reply) => {
      try {
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const item = await menuService.createItem(
          req.params.menuId,
          req.body.name,
          req.body.description,
          req.body.itemNumber,
          req.body.price,
          officeLocationId,
        );
        return reply.status(201).send(item);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  // PUT /api/menus/:menuId/items/:id — edit item
  app.put<{ Params: { menuId: string; id: string }; Body: UpdateMenuItemRequest }>(
    '/api/menus/:menuId/items/:id',
    async (req, reply) => {
      try {
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        const item = await menuService.updateItem(
          req.params.id,
          req.body.name,
          req.body.description,
          req.body.itemNumber,
          req.body.price,
          officeLocationId,
        );
        return reply.send(item);
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );

  // DELETE /api/menus/:menuId/items/:id — delete item
  app.delete<{ Params: { menuId: string; id: string } }>(
    '/api/menus/:menuId/items/:id',
    async (req, reply) => {
      try {
        const officeLocationId = await resolveOfficeLocationIdFromCookie(
          req.headers.cookie,
          readRequestedOfficeLocationId(req.query),
        );
        await menuService.deleteItem(req.params.id, officeLocationId);
        return reply.status(204).send();
      } catch (err) {
        return sendServiceError(reply, err);
      }
    },
  );
}
