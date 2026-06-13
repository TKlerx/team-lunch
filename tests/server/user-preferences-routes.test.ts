import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/index.js';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';
import { createSessionCookieValue } from '../../src/server/services/authSession.js';
import { upsertLocalAuthUser } from '../../src/server/services/localAuth.js';
import prisma from '../../src/server/db.js';

let app: FastifyInstance;

describe('User preferences routes (integration)', () => {
  const originalSecret = process.env.AUTH_SESSION_SECRET;
  const originalAdminEmail = process.env.AUTH_ADMIN_EMAIL;

  beforeAll(async () => {
    process.env.AUTH_SESSION_SECRET = '12345678901234567890123456789012';
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    delete process.env.AUTH_ADMIN_EMAIL;
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await app.close();
    await disconnectDatabase();
    if (originalSecret === undefined) {
      delete process.env.AUTH_SESSION_SECRET;
    } else {
      process.env.AUTH_SESSION_SECRET = originalSecret;
    }
    if (originalAdminEmail === undefined) {
      delete process.env.AUTH_ADMIN_EMAIL;
    } else {
      process.env.AUTH_ADMIN_EMAIL = originalAdminEmail;
    }
  });

  async function authCookie(email = 'alice@example.com'): Promise<string> {
    await upsertLocalAuthUser(email, 'Secret#1234');
    const session = createSessionCookieValue({
      username: email,
      method: 'local',
      iat: Math.floor(Date.now() / 1000),
    });
    return `team_lunch_auth_session=${session}`;
  }

  async function createMenuFixture(name = 'Italian') {
    const id = randomUUID().slice(0, 8);
    const office = await prisma.officeLocation.create({
      data: { key: `office-${id}`, name: `Office ${id}` },
    });
    return prisma.menu.create({
      data: { name, officeLocationId: office.id },
    });
  }

  it('rejects unauthenticated preference access', async () => {
    const res = await supertest(app.server)
      .get('/api/user/preferences')
      .query({ nickname: 'alice@example.com' })
      .expect(401);

    expect(res.body.error).toBe('Authentication required');
  });

  it('returns empty preferences for the signed-in user', async () => {
    const cookie = await authCookie();
    const res = await supertest(app.server)
      .get('/api/user/preferences')
      .set('Cookie', cookie)
      .query({ nickname: 'alice@example.com' })
      .expect(200);

    expect(res.body.userKey).toBe('alice@example.com');
    expect(res.body.allergies).toEqual([]);
    expect(res.body.dislikes).toEqual([]);
  });

  it('saves and returns preferences for the signed-in user', async () => {
    const cookie = await authCookie();
    const save = await supertest(app.server)
      .put('/api/user/preferences')
      .set('Cookie', cookie)
      .send({
        nickname: 'ignored@example.com',
        allergies: ['peanuts', 'shrimp', 'peanuts'],
        dislikes: ['onions'],
      })
      .expect(200);

    expect(save.body.userKey).toBe('alice@example.com');
    expect(save.body.allergies).toEqual(['peanuts', 'shrimp']);
    expect(save.body.dislikes).toEqual(['onions']);

    const fetch = await supertest(app.server)
      .get('/api/user/preferences')
      .set('Cookie', cookie)
      .query({ nickname: 'ignored@example.com' })
      .expect(200);

    expect(fetch.body.allergies).toEqual(['peanuts', 'shrimp']);
    expect(fetch.body.dislikes).toEqual(['onions']);
  });

  it('rejects invalid payload types', async () => {
    const cookie = await authCookie();
    const res = await supertest(app.server)
      .put('/api/user/preferences')
      .set('Cookie', cookie)
      .send({
        nickname: 'alice@example.com',
        allergies: 'peanuts',
        dislikes: [],
      })
      .expect(400);

    expect(res.body.error).toContain('allergies must be an array');
  });

  it('returns empty menu-default preferences for the signed-in user', async () => {
    const cookie = await authCookie();
    const res = await supertest(app.server)
      .get('/api/user/menu-defaults')
      .set('Cookie', cookie)
      .query({ nickname: 'alice@example.com' })
      .expect(200);

    expect(res.body).toEqual([]);
  });

  it('saves and returns menu-default preferences for the signed-in user', async () => {
    const cookie = await authCookie();
    const menu = await createMenuFixture('Italian');
    const item = await prisma.menuItem.create({
      data: {
        menuId: menu.id,
        name: 'Margherita',
        description: 'Classic',
        itemNumber: '12',
        price: 9.5,
      },
    });

    const save = await supertest(app.server)
      .put(`/api/user/menu-defaults/${menu.id}`)
      .set('Cookie', cookie)
      .send({
        nickname: 'ignored@example.com',
        itemId: item.id,
        defaultComment: 'Extra cheese',
        allowOrganizerFallback: true,
      })
      .expect(200);

    expect(save.body.userKey).toBe('alice@example.com');
    expect(save.body.menuId).toBe(menu.id);
    expect(save.body.itemId).toBe(item.id);
    expect(save.body.defaultComment).toBe('Extra cheese');
    expect(save.body.allowOrganizerFallback).toBe(true);

    const fetch = await supertest(app.server)
      .get('/api/user/menu-defaults')
      .set('Cookie', cookie)
      .query({ nickname: 'ignored@example.com' })
      .expect(200);

    expect(fetch.body).toHaveLength(1);
    expect(fetch.body[0].menuId).toBe(menu.id);
    expect(fetch.body[0].itemId).toBe(item.id);
    expect(fetch.body[0].defaultComment).toBe('Extra cheese');
  });

  it('rejects enabling organizer fallback without a default meal', async () => {
    const cookie = await authCookie();
    const menu = await createMenuFixture('Italian');

    const res = await supertest(app.server)
      .put(`/api/user/menu-defaults/${menu.id}`)
      .set('Cookie', cookie)
      .send({
        nickname: 'alice@example.com',
        itemId: null,
        defaultComment: null,
        allowOrganizerFallback: true,
      })
      .expect(400);

    expect(res.body.error).toContain(
      'Default meal is required before organizer fallback can be enabled',
    );
  });

  it('rejects a too-long default meal comment', async () => {
    const cookie = await authCookie();
    const menu = await createMenuFixture('Italian');
    const item = await prisma.menuItem.create({
      data: {
        menuId: menu.id,
        name: 'Margherita',
        description: 'Classic',
        itemNumber: '12',
        price: 9.5,
      },
    });

    const res = await supertest(app.server)
      .put(`/api/user/menu-defaults/${menu.id}`)
      .set('Cookie', cookie)
      .send({
        nickname: 'alice@example.com',
        itemId: item.id,
        defaultComment: 'x'.repeat(201),
        allowOrganizerFallback: false,
      })
      .expect(400);

    expect(res.body.error).toContain('Default meal comment must be 200 characters or fewer');
  });
});
