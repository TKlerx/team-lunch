import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/index.js';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';
import * as menuService from '../../src/server/services/menu.js';

let app: FastifyInstance;

describe('User preferences routes (integration)', () => {
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

  it('returns empty preferences for a new nickname', async () => {
    const res = await supertest(app.server)
      .get('/api/user/preferences')
      .query({ nickname: 'alice@example.com' })
      .expect(200);

    expect(res.body.userKey).toBe('alice@example.com');
    expect(res.body.allergies).toEqual([]);
    expect(res.body.dislikes).toEqual([]);
  });

  it('saves and returns preferences for nickname fallback', async () => {
    const save = await supertest(app.server)
      .put('/api/user/preferences')
      .send({
        nickname: 'alice@example.com',
        allergies: ['peanuts', 'shrimp', 'peanuts'],
        dislikes: ['onions'],
      })
      .expect(200);

    expect(save.body.userKey).toBe('alice@example.com');
    expect(save.body.allergies).toEqual(['peanuts', 'shrimp']);
    expect(save.body.dislikes).toEqual(['onions']);

    const fetch = await supertest(app.server)
      .get('/api/user/preferences')
      .query({ nickname: 'alice@example.com' })
      .expect(200);

    expect(fetch.body.allergies).toEqual(['peanuts', 'shrimp']);
    expect(fetch.body.dislikes).toEqual(['onions']);
  });

  it('rejects invalid payload types', async () => {
    const res = await supertest(app.server)
      .put('/api/user/preferences')
      .send({
        nickname: 'alice@example.com',
        allergies: 'peanuts',
        dislikes: [],
      })
      .expect(400);

    expect(res.body.error).toContain('allergies must be an array');
  });

  it('returns empty menu-default preferences for a new nickname', async () => {
    const res = await supertest(app.server)
      .get('/api/user/menu-defaults')
      .query({ nickname: 'alice@example.com' })
      .expect(200);

    expect(res.body).toEqual([]);
  });

  it('saves and returns menu-default preferences for nickname fallback', async () => {
    const menu = await menuService.createMenu('Italian');
    const item = await menuService.createItem(menu.id, 'Margherita', 'Classic', '12', 9.5);

    const save = await supertest(app.server)
      .put(`/api/user/menu-defaults/${menu.id}`)
      .send({
        nickname: 'alice@example.com',
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
      .query({ nickname: 'alice@example.com' })
      .expect(200);

    expect(fetch.body).toHaveLength(1);
    expect(fetch.body[0].menuId).toBe(menu.id);
    expect(fetch.body[0].itemId).toBe(item.id);
    expect(fetch.body[0].defaultComment).toBe('Extra cheese');
  });

  it('rejects enabling organizer fallback without a default meal', async () => {
    const menu = await menuService.createMenu('Italian');

    const res = await supertest(app.server)
      .put(`/api/user/menu-defaults/${menu.id}`)
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
    const menu = await menuService.createMenu('Italian');
    const item = await menuService.createItem(menu.id, 'Margherita', 'Classic', '12', 9.5);

    const res = await supertest(app.server)
      .put(`/api/user/menu-defaults/${menu.id}`)
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
