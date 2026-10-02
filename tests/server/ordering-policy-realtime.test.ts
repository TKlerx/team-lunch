import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import prisma from '../../src/server/db.js';
import type { InitialStatePayload, UpdateOfficeLocationSettingsRequest } from '../../src/lib/types.js';
import { register, sendInitialState } from '../../src/server/sse.js';
import { createOfficeLocation, updateOfficeLocationSettings } from '../../src/server/services/officeLocation.js';
import { confirmFoodArrival } from '../../src/server/services/foodSelection.js';
import { buildOrderingPolicyException, evaluateOrderingPolicy } from '../../src/server/services/orderingPolicy.js';
import * as policyService from '../../src/server/services/orderingPolicy.js';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';

const NOW = new Date('2026-10-01T10:00:00Z');
const settings = {
  autoStartPollEnabled: false, autoStartPollWeekdays: [], autoStartPollFinishTime: null,
  defaultFoodSelectionDurationMinutes: 10,
};
const REASON = 'Private exception reason';
let officeId: string;
let otherOfficeId: string;
const streams: Array<{ res: ServerResponse; writes: string[] }> = [];

function connect(office = officeId) {
  const writes: string[] = [];
  const res = Object.assign(new EventEmitter(), {
    writeHead: vi.fn(), writableEnded: false,
    write: (message: string) => { writes.push(message); return true; },
  }) as unknown as ServerResponse;
  register(res, office);
  const stream = { res, writes };
  streams.push(stream);
  return stream;
}

function events(stream: typeof streams[number], name: string): unknown[] {
  return stream.writes.filter(write => write.startsWith(`event: ${name}\n`))
    .map(write => JSON.parse(write.split('\ndata: ')[1]));
}

async function hydrate(stream: typeof streams[number], office = officeId) {
  await sendInitialState(stream.res, office);
  return events(stream, 'initial_state').at(-1) as InitialStatePayload;
}

function save(fields: Partial<UpdateOfficeLocationSettingsRequest>, office = officeId) {
  return updateOfficeLocationSettings(office, { ...settings, ...fields });
}

async function selection(status = 'delivering', office = officeId, exception = false) {
  const snapshot = exception ? buildOrderingPolicyException(
    await evaluateOrderingPolicy(office),
    { actorKey: 'entra:private@example.com', actorEmail: 'private@example.com', displayNameSnapshot: 'Private actor' },
    REASON,
  ) : undefined;
  const poll = await prisma.poll.create({
    data: { officeLocationId: office, description: 'Lunch', status: 'finished', startedAt: NOW, endsAt: NOW,
      ...(snapshot ? { orderingPolicyException: { ...snapshot } } : {}) },
  });
  const food = await prisma.foodSelection.create({
    data: { officeLocationId: office, pollId: poll.id, menuName: 'Menu', status, startedAt: NOW, endsAt: NOW,
      completedAt: status === 'completed' ? NOW : null },
  });
  return { food, poll, snapshot };
}

function expectPublic(stream: typeof streams[number]) {
  const text = stream.writes.join('');
  for (const secret of ['orderingPolicyException', REASON, 'private@example.com', 'Private actor',
    'previousCompletedSelectionId', 'previousCompletedAt', 'decidedAt', 'actorKey']) {
    expect(text).not.toContain(secret);
  }
}

beforeEach(async () => {
  await cleanDatabase();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  officeId = (await createOfficeLocation('Realtime office')).id;
  otherOfficeId = (await createOfficeLocation('Other office')).id;
});
afterEach(() => {
  for (const stream of streams.splice(0)) stream.res.emit('close');
  vi.restoreAllMocks();
  vi.useRealTimers();
});
afterAll(async () => {
  await cleanDatabase();
  await disconnectDatabase();
});

it('hydrates scoped availability and recomputes it on reconnect without exposing completion evidence', async () => {
  await selection('completed');
  const first = connect();
  expect((await hydrate(first)).orderingPolicy).toEqual((await evaluateOrderingPolicy(officeId)).availability);
  expect((await hydrate(first)).orderingPolicy?.status).toBe('period_used');
  const other = connect(otherOfficeId);
  expect((await hydrate(other, otherOfficeId)).orderingPolicy).toMatchObject({ officeLocationId: otherOfficeId, status: 'eligible' });
  first.res.emit('close');
  vi.setSystemTime(new Date('2026-10-05T00:00:00Z'));
  const reconnect = connect();
  expect((await hydrate(reconnect)).orderingPolicy?.status).toBe('eligible');
  for (const stream of [first, other, reconnect]) expectPublic(stream);
});

it('sends only public scoped invalidation after completion and preserves existing completion events and snapshots', async () => {
  await save({ orderingAnchorDate: '2026-10-05' });
  const { food, poll, snapshot } = await selection('delivery_due', officeId, true);
  await save({ orderingAnchorDate: '2026-09-28' });
  const same = [connect(), connect()];
  const other = connect(otherOfficeId);
  await expect(confirmFoodArrival(food.id, otherOfficeId)).rejects.toMatchObject({ statusCode: 404 });
  expect(events(same[0], 'ordering_policy_changed')).toEqual([]);
  const completed = await confirmFoodArrival(food.id, officeId);
  expect(completed.status).toBe('completed');
  expect(completed.completedAt).toBe(NOW.toISOString());
  for (const stream of same) {
    expect(events(stream, 'ordering_policy_changed')).toEqual([{ officeLocationId: officeId }]);
    expect(events(stream, 'food_selection_completed')).toEqual([{ foodSelection: completed }]);
    expect((await hydrate(stream)).orderingPolicy?.status).toBe('period_used');
    expectPublic(stream);
  }
  expect(events(other, 'ordering_policy_changed')).toEqual([]);
  expect(events(other, 'food_selection_completed')).toEqual([]);
  await expect(confirmFoodArrival(food.id, officeId)).rejects.toMatchObject({ statusCode: 400 });
  expect(events(same[0], 'ordering_policy_changed')).toHaveLength(1);
  expect((await prisma.poll.findUniqueOrThrow({ where: { id: poll.id } })).orderingPolicyException).toEqual(snapshot);
});

it.each(['delivering', 'delivery_due'])('invalidates only after successful %s completion, including unrestricted offices', async status => {
  await save({ orderingIntervalWeeks: 0 });
  const { food } = await selection(status);
  const stream = connect();
  await confirmFoodArrival(food.id, officeId);
  expect(events(stream, 'ordering_policy_changed')).toEqual([{ officeLocationId: officeId }]);
  expect((await hydrate(stream)).orderingPolicy).toMatchObject({ status: 'unrestricted', nextEligibleAt: null });
});

it('does not invalidate on invalid completion or a failed completion write', async () => {
  const { food } = await selection('active');
  const stream = connect();
  await expect(confirmFoodArrival(food.id, officeId)).rejects.toMatchObject({ statusCode: 400 });
  await prisma.foodSelection.update({ where: { id: food.id }, data: { status: 'delivering' } });
  const original = prisma.foodSelection.update;
  const spy = vi.spyOn(prisma.foodSelection, 'update').mockRejectedValueOnce(new Error('write failed'));
  try {
    await expect(confirmFoodArrival(food.id, officeId)).rejects.toThrow('write failed');
  } finally {
    spy.mockRestore();
    prisma.foodSelection.update = original;
  }
  expect(events(stream, 'ordering_policy_changed')).toEqual([]);
  expect(events(stream, 'food_selection_completed')).toEqual([]);
  expect((await prisma.foodSelection.findUniqueOrThrow({ where: { id: food.id } })).status).toBe('delivering');
});

it('invalidates only effective timezone/interval/anchor saves for the addressed office', async () => {
  const same = [connect(), connect()];
  const other = connect(otherOfficeId);
  for (const fields of [
    { timeZone: 'Europe/Vienna' }, { orderingIntervalWeeks: 2 as const },
    { orderingAnchorDate: '2026-10-05' }, { orderingIntervalWeeks: 0 as const },
    { timeZone: 'Europe/Berlin' },
  ]) await save(fields);
  for (const stream of same) {
    expect(events(stream, 'ordering_policy_changed')).toEqual(Array.from({ length: 5 }, () => ({ officeLocationId: officeId })));
    expectPublic(stream);
  }
  expect(events(other, 'ordering_policy_changed')).toEqual([]);
  expect((await hydrate(same[0])).orderingPolicy).toMatchObject({ status: 'unrestricted', anchorDate: '2026-10-05' });
});

it('reinterprets retained completions on settings saves and hydrates future anchors', async () => {
  await selection('completed');
  const stream = connect();
  expect((await hydrate(stream)).orderingPolicy?.status).toBe('period_used');
  await save({ orderingAnchorDate: '2026-10-05', timeZone: 'Europe/Vienna' });
  expect((await hydrate(stream)).orderingPolicy).toMatchObject({
    status: 'not_started', blockStart: null, blockEnd: null, nextEligibleAt: '2026-10-04T22:00:00.000Z',
  });
  expect(events(stream, 'ordering_policy_changed')).toEqual([{ officeLocationId: officeId }]);
});

it('does not invalidate unchanged, omitted, unrelated or unrestricted ignored-anchor saves', async () => {
  const stream = connect();
  await save({ orderingIntervalWeeks: 1, timeZone: 'Europe/Berlin', orderingAnchorDate: '2026-09-28' });
  expect(events(stream, 'ordering_policy_changed')).toEqual([]);
  await save({ orderingIntervalWeeks: 0 });
  stream.writes.length = 0;
  await save({});
  await save({ orderingIntervalWeeks: 0, timeZone: 'Europe/Berlin', orderingAnchorDate: 'invalid ignored anchor' });
  await save({ defaultFoodSelectionDurationMinutes: 20, autoStartPollEnabled: true,
    autoStartPollWeekdays: ['monday'], autoStartPollFinishTime: '12:00' });
  expect(events(stream, 'ordering_policy_changed')).toEqual([]);
});

it.each([
  { orderingIntervalWeeks: 5 }, { timeZone: 'Invalid/Zone' }, { orderingAnchorDate: '2026-10-06' },
  { timeZone: 'Europe/Vienna', defaultFoodSelectionDurationMinutes: 2 },
])('rejects atomic invalid saves without invalidation: %j', async fields => {
  const before = await prisma.officeLocation.findUniqueOrThrow({ where: { id: officeId } });
  const stream = connect();
  await expect(save(fields as Partial<UpdateOfficeLocationSettingsRequest>)).rejects.toMatchObject({ statusCode: 400 });
  expect(await prisma.officeLocation.findUniqueOrThrow({ where: { id: officeId } })).toEqual(before);
  expect(events(stream, 'ordering_policy_changed')).toEqual([]);
});

it('does not invalidate a failed settings write', async () => {
  const stream = connect();
  const original = prisma.officeLocation.update;
  const spy = vi.spyOn(prisma.officeLocation, 'update').mockRejectedValueOnce(new Error('write failed'));
  try {
    await expect(save({ orderingIntervalWeeks: 2 })).rejects.toThrow('write failed');
  } finally {
    spy.mockRestore();
    prisma.officeLocation.update = original;
  }
  expect(events(stream, 'ordering_policy_changed')).toEqual([]);
});

it('returns null, never synthetic eligibility, on evaluator failure while preserving compatible hydration', async () => {
  const { food } = await selection();
  const stream = connect();
  vi.spyOn(policyService, 'evaluateOrderingPolicy').mockRejectedValueOnce(new Error('private failure details'));
  const payload = await hydrate(stream);
  expect(payload.orderingPolicy).toBeNull();
  expect(payload.activeFoodSelection?.id).toBe(food.id);
  expect(payload.defaultFoodSelectionDurationMinutes).toBe(30);
  expect(stream.writes.join('')).not.toContain('private failure details');
  expectPublic(stream);
  expect((await hydrate(stream)).orderingPolicy?.status).toBe('eligible');
});

it('includes unavailable policy in the existing whole-hydration fallback', async () => {
  const stream = connect();
  const original = prisma.poll.findFirst;
  const spy = vi.spyOn(prisma.poll, 'findFirst').mockRejectedValueOnce(new Error('DB unavailable'));
  try {
    expect(await hydrate(stream)).toEqual({ orderingPolicy: null, activePoll: null, activeFoodSelection: null,
      latestCompletedPoll: null, latestCompletedFoodSelection: null, completedFoodSelectionsHistory: [],
      defaultFoodSelectionDurationMinutes: 30 });
  } finally {
    spy.mockRestore();
    prisma.poll.findFirst = original;
  }
});
