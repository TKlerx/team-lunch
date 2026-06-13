import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/index.js';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';
import { createOfficeLocation } from '../../src/server/services/officeLocation.js';
import { createSessionCookieValue } from '../../src/server/services/authSession.js';
import prisma from '../../src/server/db.js';

vi.mock('../../src/server/sse.js', () => ({
  broadcast: vi.fn(),
  register: vi.fn(),
  sendInitialState: vi.fn(),
  formatPoll: vi.fn(),
  formatFoodSelection: vi.fn(),
}));

let app: FastifyInstance;

function authCookie(email: string): string {
  return `team_lunch_auth_session=${createSessionCookieValue({
    username: email,
    method: 'entra',
    iat: Math.floor(Date.now() / 1000),
  })}`;
}

describe('shopping list routes', () => {
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    await cleanDatabase();
    const office = await createOfficeLocation('Default');
    await prisma.authAccessUser.createMany({
      data: [
        { email: 'alice@example.com', approved: true, blocked: false, isAdmin: false, officeLocationId: office.id },
        { email: 'bob@example.com', approved: true, blocked: false, isAdmin: false, officeLocationId: office.id },
      ],
    });
  });

  afterAll(async () => {
    await cleanDatabase();
    await app.close();
    await disconnectDatabase();
  });

  it('creates and lists shopping list items', async () => {
    const cookie = authCookie('alice@example.com');

    const created = await supertest(app.server)
      .post('/api/shopping-list')
      .set('Cookie', cookie)
      .send({ name: 'Printer paper' })
      .expect(201);

    expect(created.body.name).toBe('Printer paper');
    expect(created.body.requestedBy).toBe('alice@example.com');

    const listed = await supertest(app.server).get('/api/shopping-list').set('Cookie', cookie).expect(200);
    expect(listed.body).toEqual([
      expect.objectContaining({
        id: created.body.id,
        name: 'Printer paper',
      }),
    ]);
  });

  it('marks a shopping list item as bought', async () => {
    const aliceCookie = authCookie('alice@example.com');
    const bobCookie = authCookie('bob@example.com');

    const created = await supertest(app.server)
      .post('/api/shopping-list')
      .set('Cookie', aliceCookie)
      .send({ name: 'Tea bags' })
      .expect(201);

    const updated = await supertest(app.server)
      .post(`/api/shopping-list/${created.body.id}/bought`)
      .set('Cookie', bobCookie)
      .send({})
      .expect(200);

    expect(updated.body.bought).toBe(true);
    expect(updated.body.boughtBy).toBe('bob@example.com');
  });

  it('lists shopping list items only for the signed-in user office', async () => {
    const berlin = await createOfficeLocation('Berlin');
    const munich = await createOfficeLocation('Munich');
    await prisma.authAccessUser.createMany({
      data: [
        { email: 'berlin@company.com', approved: true, blocked: false, isAdmin: false, officeLocationId: berlin.id },
        { email: 'munich@company.com', approved: true, blocked: false, isAdmin: false, officeLocationId: munich.id },
      ],
    });

    const berlinCookie = authCookie('berlin@company.com');
    const munichCookie = authCookie('munich@company.com');

    await supertest(app.server).post('/api/shopping-list').set('Cookie', berlinCookie).send({ name: 'Berlin coffee' }).expect(201);
    await supertest(app.server).post('/api/shopping-list').set('Cookie', munichCookie).send({ name: 'Munich tea' }).expect(201);

    const berlinList = await supertest(app.server).get('/api/shopping-list').set('Cookie', berlinCookie).expect(200);
    const munichList = await supertest(app.server).get('/api/shopping-list').set('Cookie', munichCookie).expect(200);

    expect(berlinList.body).toHaveLength(1);
    expect(berlinList.body[0].name).toBe('Berlin coffee');
    expect(munichList.body).toHaveLength(1);
    expect(munichList.body[0].name).toBe('Munich tea');
  });
});
