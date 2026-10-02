import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/server/index.js';
import prisma from '../../src/server/db.js';
import { broadcast } from '../../src/server/sse.js';
import { sendEmail } from '../../src/server/services/notificationEmail.js';
import { createSessionCookieValue } from '../../src/server/services/authSession.js';
import { createOfficeLocation } from '../../src/server/services/officeLocation.js';
import { evaluateOrderingPolicy } from '../../src/server/services/orderingPolicy.js';
import * as pollService from '../../src/server/services/poll.js';
import * as foodSelectionService from '../../src/server/services/foodSelection.js';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';

vi.mock('../../src/server/sse.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/server/sse.js')>(),
  broadcast: vi.fn(),
}));
vi.mock('../../src/server/services/notificationEmail.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/server/services/notificationEmail.js')>(),
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

const NOW = new Date('2026-10-01T10:00:00Z');
const EMAIL = 'starter@example.com';
const ACTOR = { actorKey: EMAIL, actorEmail: EMAIL, displayNameSnapshot: 'Signed Starter' };
const REASON = 'One-off team celebration';
const INVALID_REASONS = [null, 42, false, {}, [], '', ' \n\t ', 'x'.repeat(501)].map(reason => ({ reason }));
const originalPollCreate = prisma.poll.create;
const originalEnv = {
  AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
  AUTH_ADMIN_EMAIL: process.env.AUTH_ADMIN_EMAIL,
};
const paths = [
  { name: 'normal poll', url: '/api/polls', quick: false },
  { name: 'quick start', url: '/api/food-selections/quick-start', quick: true },
] as const;
type EntryPath = typeof paths[number];
let app: FastifyInstance;
let officeId: string;
let menu: { id: string; name: string };

function cookie(email = EMAIL) {
  return `team_lunch_auth_session=${createSessionCookieValue({
    username: email, method: 'entra', iat: Math.floor(Date.now() / 1000),
  })}`;
}

function start(path: EntryPath, extra: Record<string, unknown> = {}, auth: string | null = cookie()) {
  return app.inject({
    method: 'POST', url: `${path.url}?officeLocationId=${officeId}`,
    headers: auth === null ? {} : { cookie: auth },
    payload: { description: 'Team lunch', durationMinutes: 10, ...extra },
  });
}

async function setPolicy(orderingIntervalWeeks = 1, orderingAnchorDate = '2026-09-28') {
  await prisma.officeLocation.update({
    where: { id: officeId },
    data: { orderingIntervalWeeks, orderingAnchorDate: new Date(`${orderingAnchorDate}T00:00:00Z`), timeZone: 'UTC' },
  });
}

async function retainedSelection(status = 'completed', completedAt: Date | null = new Date('2026-09-29T12:00:00Z')) {
  const poll = await prisma.poll.create({
    data: { officeLocationId: officeId, description: 'Retained lunch', status: 'finished', startedAt: NOW, endsAt: NOW },
  });
  return prisma.foodSelection.create({
    data: {
      officeLocationId: officeId, pollId: poll.id, menuName: menu.name, status,
      startedAt: NOW, endsAt: NOW, completedAt,
    },
  });
}

async function effects() {
  const [polls, selections, exclusions, votes, orders, audits] = await Promise.all([
    prisma.poll.findMany({ orderBy: { id: 'asc' } }),
    prisma.foodSelection.findMany({ orderBy: { id: 'asc' } }),
    prisma.pollExcludedMenu.count(), prisma.pollVote.count(), prisma.foodOrder.count(), prisma.auditLog.count(),
  ]);
  return {
    polls, selections, exclusions, votes, orders, audits,
    pollTimers: [...pollService.getActiveTimers().entries()],
    selectionTimers: [...foodSelectionService.getActiveTimers().entries()],
  };
}

function resetNotifications() {
  vi.mocked(broadcast).mockClear();
  vi.mocked(sendEmail).mockClear();
}

async function expectNoEffects(before: Awaited<ReturnType<typeof effects>>) {
  expect(await effects()).toEqual(before);
  expect(broadcast).not.toHaveBeenCalled();
  expect(sendEmail).not.toHaveBeenCalled();
}

async function expectWarning(path: EntryPath, status: 'period_used' | 'not_started', extra: Record<string, unknown> = {}) {
  const expected = (await evaluateOrderingPolicy(officeId)).availability;
  const before = await effects();
  resetNotifications();
  const res = await start(path, extra);
  expect(res.statusCode).toBe(409);
  expect(res.json()).toEqual({ error: expect.any(String), code: 'ORDERING_POLICY_WARNING', orderingPolicy: expected });
  expect(res.json().orderingPolicy.status).toBe(status);
  await expectNoEffects(before);
  return res;
}

async function createdPoll(path: EntryPath, response: { id: string; pollId?: string }) {
  return prisma.poll.findUniqueOrThrow({ where: { id: path.quick ? response.pollId : response.id } });
}

beforeAll(async () => {
  process.env.AUTH_SESSION_SECRET = '12345678901234567890123456789012';
  process.env.AUTH_ADMIN_EMAIL = 'admin@example.com';
  app = await buildApp();
  await app.ready();
});
beforeEach(async () => {
  pollService.clearAllTimers();
  foodSelectionService.clearAllTimers();
  await cleanDatabase();
  // Fake Date only: Prisma I/O, pool timeouts and lifecycle timers remain real.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  officeId = (await createOfficeLocation('Policy start office')).id;
  await setPolicy();
  await prisma.authAccessUser.create({
    data: {
      email: EMAIL, approved: true, blocked: false, isAdmin: false,
      officeLocationId: officeId, displayName: ACTOR.displayNameSnapshot, displayNameSource: 'local',
    },
  });
  menu = await prisma.menu.create({ data: { name: 'Only menu', officeLocationId: officeId } });
  await prisma.menuItem.create({ data: { menuId: menu.id, name: 'Lunch meal' } });
  resetNotifications();
});
afterEach(() => {
  pollService.clearAllTimers();
  foodSelectionService.clearAllTimers();
  vi.restoreAllMocks();
  // Prisma delegate proxies require explicit restoration, even after mockRestore.
  prisma.poll.create = originalPollCreate;
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

describe('food-selection transitions cannot reuse a completed lunch poll', () => {
  function startSelection(pollId: string) {
    return app.inject({
      method: 'POST', url: `/api/food-selections?officeLocationId=${officeId}`,
      headers: { cookie: cookie() }, payload: { pollId, durationMinutes: 10 },
    });
  }

  it.each([1, 0])('rejects a consumed poll without side effects for interval %s', async interval => {
    await setPolicy(interval);
    const previous = await retainedSelection();
    await prisma.poll.update({
      where: { id: previous.pollId },
      data: { winnerMenuId: menu.id, winnerMenuName: menu.name },
    });
    const before = await effects();
    resetNotifications();
    const response = await startSelection(previous.pollId);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'This poll has already been used for a completed lunch' });
    await expectNoEffects(before);
  });

  it('allows an existing poll to continue when policy settings change before food selection', async () => {
    const poll = await pollService.createAutoFinishedPoll(menu.id, menu.name, officeId);
    await setPolicy(1, '2026-10-05');
    expect((await evaluateOrderingPolicy(officeId)).availability.status).toBe('not_started');
    expect((await startSelection(poll.id)).statusCode).toBe(201);
  });

  it('allows retrying an aborted selection from the same poll', async () => {
    const previous = await retainedSelection('aborted', null);
    await prisma.poll.update({
      where: { id: previous.pollId },
      data: { winnerMenuId: menu.id, winnerMenuName: menu.name },
    });
    expect((await startSelection(previous.pollId)).statusCode).toBe(201);
  });
});

for (const path of paths) {
  describe(`ordering policy manual ${path.name}`, () => {
    it('rejects a used period with the full typed warning and no side effects', async () => {
      await retainedSelection();
      await expectWarning(path, 'period_used');
    });

    it('rejects a future anchor with null blocks and its exact next boundary', async () => {
      await setPolicy(2, '2026-10-05');
      const res = await expectWarning(path, 'not_started');
      expect(res.json().orderingPolicy).toMatchObject({
        blockStart: null, blockEnd: null, nextEligibleAt: '2026-10-05T00:00:00.000Z',
      });
    });

    it.each(['eligible', 'unrestricted'] as const)('creates when %s without inventing an exception', async (status) => {
      if (status === 'unrestricted') {
        await setPolicy(0, '2026-10-05');
        await retainedSelection();
      }
      const before = await prisma.poll.count();
      const res = await start(path);
      expect(res.statusCode).toBe(201);
      expect((await createdPoll(path, res.json())).orderingPolicyException).toBeNull();
      expect(await prisma.poll.count()).toBe(before + 1);
      expect(await prisma.foodSelection.count({ where: { status: 'active' } })).toBe(path.quick ? 1 : 0);
    });

    it.each(['eligible', 'unrestricted'] as const)('ignores a valid stale justification when %s', async (status) => {
      if (status === 'unrestricted') await setPolicy(0);
      const res = await start(path, { orderingPolicyJustification: REASON });
      expect(res.statusCode).toBe(201);
      expect((await createdPoll(path, res.json())).orderingPolicyException).toBeNull();
    });

  });

  describe(`ordering policy ${path.name} justification and persistence`, () => {
    it.each(['period_used', 'not_started'] as const)('persists a trimmed 500-character %s override with signed attribution', async (violation) => {
      if (violation === 'period_used') await retainedSelection();
      if (violation === 'not_started') await setPolicy(1, '2026-10-05');
      const evaluation = await evaluateOrderingPolicy(officeId);
      const before = await prisma.poll.count();
      const reason = 'x'.repeat(500);
      const res = await start(path, { orderingPolicyJustification: ` \n${reason}\t ` });
      expect(res.statusCode).toBe(201);
      const poll = await createdPoll(path, res.json());
      expect(poll.orderingPolicyException).toEqual({
        reason, ...ACTOR, decidedAt: NOW.toISOString(), violation,
        intervalWeeks: evaluation.availability.intervalWeeks,
        timeZone: 'UTC', anchorDate: evaluation.availability.anchorDate,
        blockStart: evaluation.availability.blockStart, blockEnd: evaluation.availability.blockEnd,
        nextEligibleAt: evaluation.availability.nextEligibleAt,
        previousCompletedSelectionId: evaluation.previousCompletedSelectionId,
        previousCompletedAt: evaluation.previousCompletedAt,
      });
      expect(await prisma.poll.count()).toBe(before + 1);
      expect(poll.status).toBe(path.quick ? 'finished' : 'active');
      expect(res.json()).not.toHaveProperty('orderingPolicyException');
      expect(JSON.stringify(vi.mocked(broadcast).mock.calls)).not.toContain(reason);
      expect(pollService.getActiveTimers().size).toBe(path.quick ? 0 : 1);
      expect(foodSelectionService.getActiveTimers().size).toBe(path.quick ? 1 : 0);
    });

    for (const status of ['period_used', 'eligible', 'unrestricted'] as const) {
      it.each(INVALID_REASONS)(`rejects supplied malformed reason $reason even when ${status}`, async ({ reason }) => {
        if (status === 'period_used') await retainedSelection();
        if (status === 'unrestricted') await setPolicy(0);
        const before = await effects();
        resetNotifications();
        const res = await start(path, { orderingPolicyJustification: reason });
        expect(res.statusCode).toBe(400);
        expect(res.json()).toEqual({ error: expect.any(String) });
        await expectNoEffects(before);
      });
    }

  });

  describe(`ordering policy ${path.name} stale preflight`, () => {
    it('rechecks settings changed after an eligible preflight', async () => {
      expect((await evaluateOrderingPolicy(officeId)).availability.status).toBe('eligible');
      await setPolicy(2, '2026-10-05');
      await expectWarning(path, 'not_started');
    });

    it('rechecks a completion recorded after an eligible preflight', async () => {
      expect((await evaluateOrderingPolicy(officeId)).availability.status).toBe('eligible');
      await retainedSelection();
      await expectWarning(path, 'period_used');
    });

    it('does not persist a stale warning after policy settings become unrestricted', async () => {
      await retainedSelection();
      await expectWarning(path, 'period_used');
      await setPolicy(0);
      const res = await start(path, { orderingPolicyJustification: REASON });
      expect(res.statusCode).toBe(201);
      expect((await createdPoll(path, res.json())).orderingPolicyException).toBeNull();
    });

    it('rechecks the exact boundary and omits a stale exception in the new period', async () => {
      await retainedSelection();
      await expectWarning(path, 'period_used');
      vi.setSystemTime(new Date('2026-10-05T00:00:00Z'));
      const res = await start(path, { orderingPolicyJustification: REASON });
      expect(res.statusCode).toBe(201);
      expect((await createdPoll(path, res.json())).orderingPolicyException).toBeNull();
    });

    it('rejects newly completed evidence at the exact boundary after old-period preflight', async () => {
      vi.setSystemTime(new Date('2026-10-04T23:59:59Z'));
      expect((await evaluateOrderingPolicy(officeId)).availability.status).toBe('eligible');
      vi.setSystemTime(new Date('2026-10-05T00:00:00Z'));
      await retainedSelection('completed', new Date('2026-10-05T00:00:00Z'));
      const res = await expectWarning(path, 'period_used');
      expect(res.json().orderingPolicy.blockStart).toBe('2026-10-05T00:00:00.000Z');
    });

  });

  describe(`ordering policy ${path.name} forged payloads`, () => {
    it('does not accept forged source, actor, creator or exception JSON as a bypass', async () => {
      await retainedSelection();
      await expectWarning(path, 'period_used', {
        source: 'scheduled', actor: ACTOR, createdBy: 'forged@example.com',
        policyStart: { source: 'manual', actor: ACTOR, justification: REASON },
        orderingPolicyException: { reason: REASON, violation: 'eligible' },
        justification: REASON,
      });
    });

    it('ignores forged snapshot and actor fields when a legitimate override is supplied', async () => {
      await retainedSelection();
      const res = await start(path, {
        orderingPolicyJustification: REASON, source: 'scheduled',
        actor: { actorKey: 'forged', actorEmail: 'forged@example.com', displayNameSnapshot: 'Forged' },
        actorKey: 'forged', actorEmail: 'forged@example.com', displayNameSnapshot: 'Forged',
        orderingPolicyException: { reason: 'Forged', decidedAt: '2000-01-01', intervalWeeks: 0 },
      });
      expect(res.statusCode).toBe(201);
      expect((await createdPoll(path, res.json())).orderingPolicyException).toMatchObject({
        ...ACTOR, reason: REASON, decidedAt: NOW.toISOString(), intervalWeeks: 1, violation: 'period_used',
      });
    });

  });

  describe(`ordering policy ${path.name} non-overridable conflicts`, () => {
    it.each(['active', 'tied'])('cannot override an existing %s poll', async (status) => {
      await retainedSelection();
      await prisma.poll.create({ data: { officeLocationId: officeId, description: 'Existing poll', status, startedAt: NOW, endsAt: NOW } });
      const before = await effects();
      resetNotifications();
      const res = await start(path, { orderingPolicyJustification: REASON });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toEqual({ error: 'A poll is already in progress' });
      await expectNoEffects(before);
    });

    it.each(['ordering', 'delivering', 'delivery_due'])('cannot override an ongoing %s selection', async (status) => {
      await retainedSelection(status, null);
      const before = await effects();
      resetNotifications();
      const res = await start(path, { orderingPolicyJustification: REASON });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toEqual({ error: 'Cannot start a new team lunch while an order is ongoing' });
      await expectNoEffects(before);
    });

    if (path.quick) {
      it.each(['active', 'overtime'])('cannot override an existing %s food selection or leave an orphan poll', async status => {
        await retainedSelection(status, null);
        const before = await effects();
        resetNotifications();
        const res = await start(path, { orderingPolicyJustification: REASON });
        expect(res.statusCode).toBe(409);
        expect(res.json()).toEqual({ error: 'A food selection is already in progress' });
        await expectNoEffects(before);
      });
    }

    it.each(['anonymous', 'invalid-cookie', 'unapproved', 'blocked', 'revoked'] as const)('cannot override %s authentication/access rejection', async (state) => {
      await retainedSelection();
      if (state === 'unapproved' || state === 'blocked' || state === 'revoked') {
        await prisma.authAccessUser.update({
          where: { email: EMAIL },
          data: { approved: state !== 'unapproved', blocked: state === 'blocked', sessionVersion: state === 'revoked' ? 1 : 0 },
        });
      }
      const before = await effects();
      resetNotifications();
      const auth = state === 'anonymous' ? null : state === 'invalid-cookie' ? 'team_lunch_auth_session=forged' : cookie();
      const res = await start(path, { orderingPolicyJustification: REASON, actor: ACTOR }, auth);
      expect(res.statusCode).toBe(state === 'unapproved' || state === 'blocked' ? 403 : 401);
      expect(res.json()).not.toHaveProperty('code');
      await expectNoEffects(before);
    });

  });

  describe(`ordering policy ${path.name} atomic write failure`, () => {
    it('writes poll and exception in one create and leaves no state if that write fails', async () => {
      await retainedSelection();
      const before = await effects();
      resetNotifications();
      const failure = vi.spyOn(prisma.poll, 'create').mockRejectedValue(new Error('Injected atomic poll write failure'));
      const res = await start(path, { orderingPolicyJustification: REASON });
      expect(res.statusCode).toBe(500);
      expect(failure).toHaveBeenCalledTimes(1);
      expect(failure.mock.calls[0][0].data.orderingPolicyException).toMatchObject({
        ...ACTOR, reason: REASON, violation: 'period_used',
      });
      failure.mockRestore();
      prisma.poll.create = originalPollCreate;
      await expectNoEffects(before);
    });
  });
}

for (const api of ['startPoll', 'createAutoFinishedPoll'] as const) {
  describe(`ordering policy scheduled ${api}`, () => {
    function scheduled(context?: { source: 'scheduled'; justification?: unknown }) {
      return api === 'startPoll'
        ? pollService.startPoll('Scheduled lunch', 10, undefined, officeId, context)
        : pollService.createAutoFinishedPoll(menu.id, menu.name, officeId, context);
    }

    it.each(['period_used', 'not_started'] as const)('cannot override %s with an omitted context or valid supplied reason', async (status) => {
      if (status === 'period_used') await retainedSelection();
      else await setPolicy(1, '2026-10-05');
      const availability = (await evaluateOrderingPolicy(officeId)).availability;
      const before = await effects();
      resetNotifications();
      for (const context of [undefined, { source: 'scheduled' as const }, { source: 'scheduled' as const, justification: REASON }]) {
        await expect(scheduled(context)).rejects.toMatchObject({
          statusCode: 409, code: 'ORDERING_POLICY_WARNING', orderingPolicy: availability,
        });
        await expectNoEffects(before);
      }
    });

    for (const status of ['period_used', 'eligible', 'unrestricted'] as const) {
      it.each(INVALID_REASONS)(`validates scheduled reason $reason even when ${status}`, async ({ reason }) => {
        if (status === 'period_used') await retainedSelection();
        if (status === 'unrestricted') await setPolicy(0);
        const before = await effects();
        resetNotifications();
        await expect(scheduled({ source: 'scheduled', justification: reason })).rejects.toMatchObject({ statusCode: 400 });
        await expectNoEffects(before);
      });
    }

    it.each(['eligible', 'unrestricted'] as const)('allows compliant %s scheduling without recording a valid supplied reason', async (status) => {
      if (status === 'unrestricted') await setPolicy(0, '2026-10-05');
      const result = await scheduled({ source: 'scheduled', justification: REASON });
      expect((await prisma.poll.findUniqueOrThrow({ where: { id: result.id } })).orderingPolicyException).toBeNull();
    });
  });
}
