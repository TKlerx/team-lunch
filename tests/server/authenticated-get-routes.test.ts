import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/index.js';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';

let app: FastifyInstance;

describe('Authenticated GET route guards', () => {
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

  const guardedGets = [
    '/api/events',
    '/api/menus',
    '/api/polls/active',
    '/api/polls/00000000-0000-0000-0000-000000000000',
    '/api/food-selections/active',
    '/api/food-selections/history',
    '/api/food-selections/00000000-0000-0000-0000-000000000000/fallback-candidates',
    '/api/shopping-list',
  ];

  it.each(guardedGets)('rejects unauthenticated GET %s', async (path) => {
    const res = await supertest(app.server).get(path).expect(401);

    expect(res.body).toEqual({ error: 'Authentication required' });
  });
});
