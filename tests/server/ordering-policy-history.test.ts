import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/server/index.js';
import prisma from '../../src/server/db.js';
import { formatFoodSelection, formatPoll, register, sendInitialState } from '../../src/server/sse.js';
import { createSessionCookieValue } from '../../src/server/services/authSession.js';
import { createOfficeLocation, updateOfficeLocationSettings } from '../../src/server/services/officeLocation.js';
import * as pollService from '../../src/server/services/poll.js';
import * as foodSelectionService from '../../src/server/services/foodSelection.js';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';

vi.mock('../../src/server/services/notificationEmail.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/server/services/notificationEmail.js')>(),
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

const NOW = new Date('2026-10-01T10:00:00Z');
const ADMIN = 'admin@example.com';
const USER = 'starter@example.com';
const REASON = 'Private celebration justification';
const settings = {
  autoStartPollEnabled: false, autoStartPollWeekdays: [], autoStartPollFinishTime: null,
  defaultFoodSelectionDurationMinutes: 10,
};
const originalEnv = { AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET, AUTH_ADMIN_EMAIL: process.env.AUTH_ADMIN_EMAIL };
let app: FastifyInstance;
let officeId: string;
let otherOfficeId: string;
let stream: ServerResponse;
let writes: string[];

function cookie(email: string) {
  return `team_lunch_auth_session=${createSessionCookieValue({
    username: email, method: 'entra', iat: Math.floor(Date.now() / 1000),
  })}`;
}

function get(path: string, email = ADMIN, office = officeId) {
  return app.inject({ method: 'GET', url: `${path}?officeLocationId=${office}`, headers: { cookie: cookie(email) } });
}

function expectPublic(value: unknown) {
  const json = JSON.stringify(value);
  expect(json).not.toContain('orderingPolicyException');
  expect(json).not.toContain(REASON);
  expect(json).not.toContain('decidedAt');
  expect(json).not.toContain('previousCompletedSelectionId');
}

async function start(quick: boolean, email = ADMIN, justification: string | undefined = REASON) {
  const response = await app.inject({
    method: 'POST',
    url: `${quick ? '/api/food-selections/quick-start' : '/api/polls'}?officeLocationId=${officeId}`,
    headers: { cookie: cookie(email) },
    payload: { description: 'Lunch', durationMinutes: 10, orderingPolicyJustification: justification },
  });
  expect(response.statusCode).toBe(201);
  expectPublic(response.json());
  const pollId = quick ? response.json().pollId : response.json().id;
  if (!quick) {
    expectPublic((await get('/api/polls/active')).json());
    await sendInitialState(stream, officeId);
    await pollService.castVote(pollId, (await prisma.menu.findFirstOrThrow({ where: { officeLocationId: officeId } })).id, 'Starter', officeId);
    await pollService.endPoll(pollId, { allowPremature: true }, officeId);
  }
  const selection = quick ? response.json() : await foodSelectionService.startFoodSelection(pollId, 10, officeId);
  return { pollId, selectionId: selection.id };
}

beforeAll(async () => {
  process.env.AUTH_SESSION_SECRET = '12345678901234567890123456789012';
  process.env.AUTH_ADMIN_EMAIL = ADMIN;
  app = await buildApp();
  await app.ready();
});
beforeEach(async () => {
  await cleanDatabase();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  officeId = (await createOfficeLocation('History office')).id;
  otherOfficeId = (await createOfficeLocation('Other office')).id;
  await updateOfficeLocationSettings(officeId, { ...settings, orderingAnchorDate: '2026-10-05' });
  await prisma.authAccessUser.create({
    data: { email: USER, approved: true, officeLocationId: officeId, displayName: 'Original Starter', displayNameSource: 'local' },
  });
  const menu = await prisma.menu.create({ data: { name: 'Only menu', officeLocationId: officeId } });
  await prisma.menuItem.create({ data: { menuId: menu.id, name: 'Lunch meal' } });
  writes = [];
  stream = Object.assign(new EventEmitter(), {
    writeHead: vi.fn(), write: (message: string) => { writes.push(message); return true; }, writableEnded: false,
  }) as unknown as ServerResponse;
  register(stream, officeId);
});
afterEach(() => {
  stream?.emit('close');
  pollService.clearAllTimers();
  foodSelectionService.clearAllTimers();
  vi.useRealTimers();
});
afterAll(async () => {
  await cleanDatabase();
  await app.close();
  await disconnectDatabase();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

for (const quick of [false, true]) {
  describe(`ordering policy history (${quick ? 'quick' : 'normal'} start)`, () => {
    it('projects only the stored snapshot to admins and retains it after policy/profile edits', async () => {
      const { pollId, selectionId } = await start(quick, USER);
      const original = (await prisma.poll.findUniqueOrThrow({ where: { id: pollId } })).orderingPolicyException;
      expect(original).toMatchObject({ reason: REASON, actorEmail: USER, displayNameSnapshot: 'Original Starter' });
      await updateOfficeLocationSettings(officeId, { ...settings, orderingIntervalWeeks: 0, timeZone: 'Europe/Vienna' });
      await prisma.authAccessUser.update({ where: { email: USER }, data: { displayName: 'Edited Starter' } });
      await prisma.foodSelection.update({ where: { id: selectionId }, data: { status: 'completed', completedAt: NOW } });
      for (const path of [`/api/polls/${pollId}`, `/api/food-selections/${selectionId}`, '/api/food-selections/history']) {
        const admin = await get(path);
        expect(admin.statusCode).toBe(200);
        const body = path.endsWith('history') ? admin.json()[0] : admin.json();
        expect(body.orderingPolicyException).toEqual(original);
        const ordinary = await get(path, USER);
        expect(ordinary.statusCode).toBe(200);
        expectPublic(ordinary.json());
        const unauthenticated = await app.inject({ method: 'GET', url: `${path}?officeLocationId=${officeId}` });
        expect(unauthenticated.statusCode).toBe(401);
        expectPublic(unauthenticated.json());
      }
      expect((await prisma.poll.findUniqueOrThrow({ where: { id: pollId } })).orderingPolicyException).toEqual(original);
    });

    it('keeps details/history isolated to the resolved office, including for admins', async () => {
      const { pollId, selectionId } = await start(quick);
      await prisma.foodSelection.update({ where: { id: selectionId }, data: { status: 'completed', completedAt: NOW } });
      for (const path of [`/api/polls/${pollId}`, `/api/food-selections/${selectionId}`]) {
        expect((await get(path, ADMIN, otherOfficeId)).statusCode).toBe(404);
        expect((await get(path, USER, otherOfficeId)).statusCode).toBe(403);
      }
      expect((await get('/api/food-selections/history', ADMIN, otherOfficeId)).json()).toEqual([]);
      expect((await get('/api/food-selections/history', USER, otherOfficeId)).statusCode).toBe(403);
    });

    it('never leaks exceptions through public formatters, start/active responses or initial/live SSE', async () => {
      const { pollId, selectionId } = await start(quick);
      const poll = await prisma.poll.findUniqueOrThrow({ where: { id: pollId }, include: { votes: true, excludedMenus: true } });
      const selection = await prisma.foodSelection.findUniqueOrThrow({ where: { id: selectionId }, include: { orders: true, poll: true } });
      expect(poll.orderingPolicyException).not.toBeNull();
      expectPublic(formatPoll(poll));
      expectPublic(formatFoodSelection(selection));
      expectPublic((await get('/api/food-selections/active')).json());
      await sendInitialState(stream, officeId);
      expect(writes.join('')).toContain('event: initial_state');
      expect(writes.join('')).toContain('event: food_selection_started');
      if (!quick) expect(writes.join('')).toContain('event: poll_started');
      for (const write of writes) expectPublic(write);
      await prisma.foodSelection.update({ where: { id: selectionId }, data: { status: 'delivery_due' } });
      expectPublic(await foodSelectionService.confirmFoodArrival(selectionId, officeId));
      expect(writes.join('')).toContain('event: food_selection_completed');
      await sendInitialState(stream, officeId);
      for (const write of writes) expectPublic(write);
    });
  });
}

it('retains used-period completion evidence after the evidence and policy change', async () => {
  await updateOfficeLocationSettings(officeId, { ...settings, orderingAnchorDate: '2026-09-28' });
  const previousPoll = await prisma.poll.create({
    data: { officeLocationId: officeId, description: 'Previous lunch', status: 'finished', startedAt: NOW, endsAt: NOW },
  });
  const previous = await prisma.foodSelection.create({
    data: { officeLocationId: officeId, pollId: previousPoll.id, menuName: 'Old menu', status: 'completed', startedAt: NOW, endsAt: NOW, completedAt: NOW },
  });
  const { pollId, selectionId } = await start(true, USER);
  const original = (await prisma.poll.findUniqueOrThrow({ where: { id: pollId } })).orderingPolicyException;
  expect(original).toMatchObject({ violation: 'period_used', previousCompletedSelectionId: previous.id, previousCompletedAt: NOW.toISOString() });
  await prisma.foodSelection.update({ where: { id: previous.id }, data: { completedAt: new Date('2026-09-01T10:00:00Z') } });
  await updateOfficeLocationSettings(officeId, { ...settings, orderingIntervalWeeks: 4, timeZone: 'Europe/Vienna', orderingAnchorDate: '2026-10-05' });
  expect((await get(`/api/polls/${pollId}`)).json().orderingPolicyException).toEqual(original);
  expect((await get(`/api/food-selections/${selectionId}`)).json().orderingPolicyException).toEqual(original);
});

it('preserves lunches without exceptions without inventing historical metadata', async () => {
  await updateOfficeLocationSettings(officeId, { ...settings, orderingIntervalWeeks: 0 });
  const { pollId, selectionId } = await start(true, ADMIN, undefined);
  await prisma.foodSelection.update({ where: { id: selectionId }, data: { status: 'completed', completedAt: NOW } });
  for (const path of [`/api/polls/${pollId}`, `/api/food-selections/${selectionId}`, '/api/food-selections/history']) {
    const response = await get(path);
    expect(response.statusCode).toBe(200);
    const body = path.endsWith('history') ? response.json()[0] : response.json();
    expect(body.orderingPolicyException).toBeNull();
    expectPublic((await get(path, USER)).json());
  }
});
