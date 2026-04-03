import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../../src/server/index.js';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';
import type { FastifyInstance } from 'fastify';
import { createOfficeLocation } from '../../src/server/services/officeLocation.js';
import { createSessionCookieValue } from '../../src/server/services/authSession.js';
import prisma from '../../src/server/db.js';

// Suppress SSE broadcasts during tests
vi.mock('../../src/server/sse.js', () => ({
  broadcast: vi.fn(),
  register: vi.fn(),
  sendInitialState: vi.fn(),
}));

let app: FastifyInstance;

describe('Menu routes (integration)', () => {
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await app.close();
    await disconnectDatabase();
  });

  // ─── Menu CRUD round-trip ────────────────────────────────

  it('full CRUD round-trip for menus', async () => {
    const server = app.server;

    // Create
    const createRes = await supertest(server)
      .post('/api/menus')
      .send({ name: 'Italian' })
      .expect(201);
    expect(createRes.body.name).toBe('Italian');
    const menuId = createRes.body.id;

    // List
    const listRes = await supertest(server).get('/api/menus').expect(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].name).toBe('Italian');

    // Update
    const updateRes = await supertest(server)
      .put(`/api/menus/${menuId}`)
      .send({ name: 'Mediterranean' })
      .expect(200);
    expect(updateRes.body.name).toBe('Mediterranean');

    // Delete
    await supertest(server).delete(`/api/menus/${menuId}`).expect(204);

    // Verify deleted
    const listRes2 = await supertest(server).get('/api/menus').expect(200);
    expect(listRes2.body).toHaveLength(0);
  });

  it('updates menu contact fields', async () => {
    const server = app.server;
    const createRes = await supertest(server)
      .post('/api/menus')
      .send({ name: 'Italian' })
      .expect(201);

    const updatedRes = await supertest(server)
      .put(`/api/menus/${createRes.body.id}`)
      .send({
        name: 'Italian',
        location: 'Main Street 1',
        phone: '+49 123 456',
        url: 'https://italian.example',
      })
      .expect(200);

    expect(updatedRes.body.location).toBe('Main Street 1');
    expect(updatedRes.body.phone).toBe('+49 123 456');
    expect(updatedRes.body.url).toBe('https://italian.example');
  });

  // ─── Item CRUD round-trip ────────────────────────────────

  it('full CRUD round-trip for items', async () => {
    const server = app.server;

    // Create menu first
    const menuRes = await supertest(server)
      .post('/api/menus')
      .send({ name: 'Italian' })
      .expect(201);
    const menuId = menuRes.body.id;

    // Create item
    const createRes = await supertest(server)
      .post(`/api/menus/${menuId}/items`)
      .send({ name: 'Margherita Pizza', description: 'Classic', itemNumber: '12', price: 9.5 })
      .expect(201);
    expect(createRes.body.name).toBe('Margherita Pizza');
    expect(createRes.body.description).toBe('Classic');
    expect(createRes.body.itemNumber).toBe('12');
    expect(createRes.body.price).toBe(9.5);
    const itemId = createRes.body.id;

    // Update item
    const updateRes = await supertest(server)
      .put(`/api/menus/${menuId}/items/${itemId}`)
      .send({ name: 'Neapolitan Pizza', description: 'From Naples', itemNumber: '21', price: 10.5 })
      .expect(200);
    expect(updateRes.body.name).toBe('Neapolitan Pizza');
    expect(updateRes.body.itemNumber).toBe('21');
    expect(updateRes.body.price).toBe(10.5);

    // Delete item
    await supertest(server).delete(`/api/menus/${menuId}/items/${itemId}`).expect(204);

    // Verify menu still exists with 0 items
    const listRes = await supertest(server).get('/api/menus').expect(200);
    expect(listRes.body[0].itemCount).toBe(0);
  });

  // ─── Duplicate name returns 409 ──────────────────────────

  it('duplicate menu name returns 409', async () => {
    const server = app.server;
    await supertest(server).post('/api/menus').send({ name: 'Italian' }).expect(201);

    const res = await supertest(server)
      .post('/api/menus')
      .send({ name: 'italian' })
      .expect(409);
    expect(res.body.error).toContain('already exists');
  });

  it('lists menus only for the signed-in user office', async () => {
    const berlin = await createOfficeLocation('Berlin');
    const munich = await createOfficeLocation('Munich');
    await prisma.authAccessUser.createMany({
      data: [
        { email: 'berlin@company.com', approved: true, blocked: false, isAdmin: false, officeLocationId: berlin.id },
        { email: 'munich@company.com', approved: true, blocked: false, isAdmin: false, officeLocationId: munich.id },
      ],
    });

    const berlinCookie = `team_lunch_auth_session=${createSessionCookieValue({
      username: 'berlin@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    })}`;
    const munichCookie = `team_lunch_auth_session=${createSessionCookieValue({
      username: 'munich@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    })}`;

    await supertest(app.server).post('/api/menus').set('Cookie', berlinCookie).send({ name: 'Berlin Pizza' }).expect(201);
    await supertest(app.server).post('/api/menus').set('Cookie', munichCookie).send({ name: 'Munich Sushi' }).expect(201);

    const berlinList = await supertest(app.server).get('/api/menus').set('Cookie', berlinCookie).expect(200);
    const munichList = await supertest(app.server).get('/api/menus').set('Cookie', munichCookie).expect(200);

    expect(berlinList.body).toHaveLength(1);
    expect(berlinList.body[0].name).toBe('Berlin Pizza');
    expect(munichList.body).toHaveLength(1);
    expect(munichList.body[0].name).toBe('Munich Sushi');
  });

  it('lets a global admin select another office context explicitly', async () => {
    const berlin = await createOfficeLocation('Berlin');
    const munich = await createOfficeLocation('Munich');
    await prisma.authAccessUser.create({
      data: {
        email: 'admin@company.com',
        approved: true,
        blocked: false,
        isAdmin: true,
        officeLocationId: null,
      },
    });

    const adminCookie = `team_lunch_auth_session=${createSessionCookieValue({
      username: 'admin@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    })}`;

    await supertest(app.server)
      .post(`/api/menus?officeLocationId=${berlin.id}`)
      .set('Cookie', adminCookie)
      .send({ name: 'Berlin Pizza' })
      .expect(201);
    await supertest(app.server)
      .post(`/api/menus?officeLocationId=${munich.id}`)
      .set('Cookie', adminCookie)
      .send({ name: 'Munich Sushi' })
      .expect(201);

    const berlinList = await supertest(app.server)
      .get(`/api/menus?officeLocationId=${berlin.id}`)
      .set('Cookie', adminCookie)
      .expect(200);
    const munichList = await supertest(app.server)
      .get(`/api/menus?officeLocationId=${munich.id}`)
      .set('Cookie', adminCookie)
      .expect(200);

    expect(berlinList.body).toHaveLength(1);
    expect(berlinList.body[0].name).toBe('Berlin Pizza');
    expect(munichList.body).toHaveLength(1);
    expect(munichList.body[0].name).toBe('Munich Sushi');
  });

  it('rejects explicit office context overrides outside a regular user assignment set', async () => {
    const berlin = await createOfficeLocation('Berlin');
    const munich = await createOfficeLocation('Munich');
    await prisma.authAccessUser.createMany({
      data: [
        { email: 'berlin@company.com', approved: true, blocked: false, isAdmin: false, officeLocationId: berlin.id },
        { email: 'munich@company.com', approved: true, blocked: false, isAdmin: false, officeLocationId: munich.id },
      ],
    });

    const berlinCookie = `team_lunch_auth_session=${createSessionCookieValue({
      username: 'berlin@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    })}`;
    const munichCookie = `team_lunch_auth_session=${createSessionCookieValue({
      username: 'munich@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    })}`;

    await supertest(app.server).post('/api/menus').set('Cookie', berlinCookie).send({ name: 'Berlin Pizza' }).expect(201);
    await supertest(app.server).post('/api/menus').set('Cookie', munichCookie).send({ name: 'Munich Sushi' }).expect(201);

    const attemptedOverride = await supertest(app.server)
      .get(`/api/menus?officeLocationId=${munich.id}`)
      .set('Cookie', berlinCookie)
      .expect(403);

    expect(attemptedOverride.body).toMatchObject({
      error: 'Forbidden',
      message: 'Requested office is not assigned to the user',
      statusCode: 403,
    });
  });

  it('allows explicit office context overrides within a regular user assignment set', async () => {
    const berlin = await createOfficeLocation('Berlin');
    const munich = await createOfficeLocation('Munich');
    const user = await prisma.authAccessUser.create({
      data: {
        email: 'hybrid@company.com',
        approved: true,
        blocked: false,
        isAdmin: false,
        officeLocationId: berlin.id,
      },
    });
    await prisma.authAccessUserOffice.createMany({
      data: [
        { authAccessUserId: user.id, officeLocationId: berlin.id },
        { authAccessUserId: user.id, officeLocationId: munich.id },
      ],
    });

    const hybridCookie = `team_lunch_auth_session=${createSessionCookieValue({
      username: 'hybrid@company.com',
      method: 'entra',
      iat: Math.floor(Date.now() / 1000),
    })}`;

    await supertest(app.server).post('/api/menus').set('Cookie', hybridCookie).send({ name: 'Berlin Pizza' }).expect(201);
    await supertest(app.server)
      .post(`/api/menus?officeLocationId=${munich.id}`)
      .set('Cookie', hybridCookie)
      .send({ name: 'Munich Sushi' })
      .expect(201);

    const switchedList = await supertest(app.server)
      .get(`/api/menus?officeLocationId=${munich.id}`)
      .set('Cookie', hybridCookie)
      .expect(200);

    expect(switchedList.body).toHaveLength(1);
    expect(switchedList.body[0].name).toBe('Munich Sushi');
  });

  it('duplicate item name within same menu returns 409', async () => {
    const server = app.server;
    const menuRes = await supertest(server).post('/api/menus').send({ name: 'Italian' }).expect(201);
    const menuId = menuRes.body.id;

    await supertest(server)
      .post(`/api/menus/${menuId}/items`)
      .send({ name: 'Pizza' })
      .expect(201);

    const res = await supertest(server)
      .post(`/api/menus/${menuId}/items`)
      .send({ name: 'pizza' })
      .expect(409);
    expect(res.body.error).toContain('already exists');
  });

  // ─── Invalid input returns 400 ───────────────────────────

  it('empty menu name returns 400', async () => {
    const server = app.server;
    const res = await supertest(server)
      .post('/api/menus')
      .send({ name: '' })
      .expect(400);
    expect(res.body.error).toContain('1–60 characters');
  });

  it('empty item name returns 400', async () => {
    const server = app.server;
    const menuRes = await supertest(server).post('/api/menus').send({ name: 'Italian' }).expect(201);
    const res = await supertest(server)
      .post(`/api/menus/${menuRes.body.id}/items`)
      .send({ name: '' })
      .expect(400);
    expect(res.body.error).toContain('1–80 characters');
  });

  it('rejects invalid item price on create', async () => {
    const server = app.server;
    const menuRes = await supertest(server).post('/api/menus').send({ name: 'Italian' }).expect(201);
    const res = await supertest(server)
      .post(`/api/menus/${menuRes.body.id}/items`)
      .send({ name: 'Pizza', price: -1 })
      .expect(400);
    expect(res.body.error).toContain('between 0 and 9999.99');
  });

  // ─── Not found returns 404 ──────────────────────────────

  it('updating non-existent menu returns 404', async () => {
    const server = app.server;
    await supertest(server)
      .put('/api/menus/00000000-0000-0000-0000-000000000000')
      .send({ name: 'Test' })
      .expect(404);
  });

  it('deleting non-existent menu returns 404', async () => {
    const server = app.server;
    await supertest(server)
      .delete('/api/menus/00000000-0000-0000-0000-000000000000')
      .expect(404);
  });

  // ─── Import route ───────────────────────────────────────

  it('imports menu JSON payload', async () => {
    const server = app.server;
    const payload = {
      menu: [
        {
          name: 'Pizza Pronto',
          location: 'Main Street 1',
          phone: '+49 000 111',
          url: 'https://pizza-pronto.example',
          'date-created': '2026-02-06T12:00:00Z',
        },
        {
          category: 'Pizza',
          items: [{ 'item-number': '12', name: 'Margherita', ingredients: 'Tomato, Cheese', price: 7.5 }],
        },
      ],
    };

    const res = await supertest(server)
      .post('/api/menus/import')
      .send({ payload })
      .expect(200);

    expect(res.body.created).toBe(true);
    expect(res.body.menu.name).toBe('Pizza Pronto');
    expect(res.body.menu.location).toBe('Main Street 1');
    expect(res.body.menu.url).toBe('https://pizza-pronto.example');
    expect(res.body.menu.items[0].itemNumber).toBe('12');
    expect(res.body.menu.items[0].description).toBe('Tomato, Cheese');
    expect(res.body.menu.items[0].price).toBe(7.5);
  });

  it('imports menu JSON payload with only required metadata fields', async () => {
    const server = app.server;
    const payload = {
      menu: [
        {
          name: 'Minimal Metadata Menu',
          'date-created': '2026-02-06T12:00:00Z',
        },
        {
          category: 'Pizza',
          items: [{ 'item-number': '1A', name: 'Margherita', ingredients: 'Tomato, Cheese', price: 7.5 }],
        },
      ],
    };

    const res = await supertest(server)
      .post('/api/menus/import')
      .send({ payload })
      .expect(200);

    expect(res.body.created).toBe(true);
    expect(res.body.menu.name).toBe('Minimal Metadata Menu');
    expect(res.body.menu.location).toBeNull();
    expect(res.body.menu.phone).toBeNull();
    expect(res.body.menu.url).toBeNull();
  });

  it('returns 400 with violations for invalid import payload', async () => {
    const server = app.server;
    const payload = {
      menu: [
        {
          name: '',
          location: '',
          phone: '',
          url: '',
          'date-created': 'bad-date',
        },
        {
          category: 'Pizza',
          items: [{ 'item-number': 'X'.repeat(41), name: '', ingredients: '', price: -1 }],
        },
      ],
    };

    const res = await supertest(server)
      .post('/api/menus/import')
      .send({ payload })
      .expect(400);

    expect(res.body.error).toBe('Import payload validation failed');
    expect(Array.isArray(res.body.violations)).toBe(true);
    expect(res.body.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'menu[0].name' }),
        expect.objectContaining({ path: 'menu[1].items[0].item-number' }),
        expect.objectContaining({ path: 'menu[1].items[0].price' }),
      ]),
    );

    const listRes = await supertest(server).get('/api/menus').expect(200);
    expect(listRes.body).toHaveLength(0);
  });

  it('previews import with item summary counts', async () => {
    const server = app.server;

    const menuRes = await supertest(server)
      .post('/api/menus')
      .send({ name: 'Pizza Pronto' })
      .expect(201);

    await supertest(server)
      .post(`/api/menus/${menuRes.body.id}/items`)
      .send({ name: 'Will Delete', description: 'gone' })
      .expect(201);

    const payload = {
      menu: [
        {
          name: 'pizza pronto',
          location: 'Main Street 1',
          phone: '+49 000 111',
          url: 'https://pizza-pronto.example',
          'date-created': '2026-02-06T12:00:00Z',
        },
        {
          category: 'Pizza',
          items: [{ name: 'Will Create', ingredients: 'Tomato, Cheese', price: 7.5 }],
        },
      ],
    };

    const res = await supertest(server)
      .post('/api/menus/import/preview')
      .send({ payload })
      .expect(200);

    expect(res.body.menuName).toBe('pizza pronto');
    expect(res.body.menuExists).toBe(true);
    expect(res.body.itemSummary).toEqual({ created: 1, updated: 0, deleted: 1 });

    const listRes = await supertest(server).get('/api/menus').expect(200);
    expect(listRes.body[0].items).toHaveLength(1);
    expect(listRes.body[0].items[0].name).toBe('Will Delete');
  });

  it('returns 400 with violations for invalid import preview payload', async () => {
    const server = app.server;
    const payload = {
      menu: [
        {
          name: '',
          location: '',
          phone: '',
          url: '',
          'date-created': 'bad-date',
        },
      ],
    };

    const res = await supertest(server)
      .post('/api/menus/import/preview')
      .send({ payload })
      .expect(400);

    expect(res.body.error).toBe('Import payload validation failed');
    expect(Array.isArray(res.body.violations)).toBe(true);
  });
});

