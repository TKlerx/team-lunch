import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../../src/server/db.js';
import * as officeService from '../../src/server/services/officeLocation.js';
import {
  buildOrderingPolicyException, evaluateOrderingPolicy, validateOrderingPolicyJustification,
  type OrderingPolicyEvaluation,
} from '../../src/server/services/orderingPolicy.js';
import type { OrderingIntervalWeeks } from '../../src/lib/types.js';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';

const NOW = new Date('2026-10-01T10:00:00Z');
const originalFindFirst = prisma.foodSelection.findFirst;
let officeCount = 0;
const ACTOR = { actorKey: 'local:alice@example.com', actorEmail: 'alice@example.com', displayNameSnapshot: 'Alice' };

async function createOffice(intervalWeeks: OrderingIntervalWeeks = 1, timeZone = 'UTC', anchorDate = '2026-09-28') {
  const office = await officeService.createOfficeLocation(`Policy Office ${++officeCount}`);
  await prisma.officeLocation.update({
    where: { id: office.id },
    data: { orderingIntervalWeeks: intervalWeeks, timeZone, orderingAnchorDate: new Date(`${anchorDate}T00:00:00Z`) },
  });
  return office.id;
}

async function createSelection(
  officeLocationId: string,
  completedAt: string | null,
  status = 'completed',
  orderPlacedAt: string | null = '2026-09-27T12:00:00Z',
  exception?: ReturnType<typeof buildOrderingPolicyException>,
) {
  const poll = await prisma.poll.create({
    data: {
      officeLocationId, description: 'Retained lunch', status: 'finished',
      startedAt: new Date('2026-09-27T10:00:00Z'), endsAt: new Date('2026-09-27T11:00:00Z'),
      ...(exception ? { orderingPolicyException: { ...exception } } : {}),
    },
  });
  return prisma.foodSelection.create({
    data: {
      officeLocationId, pollId: poll.id, menuName: 'Retained menu', status,
      startedAt: poll.startedAt, endsAt: poll.endsAt,
      completedAt: completedAt ? new Date(completedAt) : null,
      orderPlacedAt: orderPlacedAt ? new Date(orderPlacedAt) : null,
    },
  });
}

beforeEach(cleanDatabase);
afterEach(() => {
  vi.restoreAllMocks();
  // Prisma proxy methods need explicit call-through and restoration for spies.
  prisma.foodSelection.findFirst = originalFindFirst;
});
afterAll(async () => {
  await cleanDatabase();
  await disconnectDatabase();
});

describe('ordering policy modes and expired opportunities', () => {

  it.each<OrderingIntervalWeeks>([0, 1, 2, 3, 4])('evaluates the %i-week mode', async interval => {
    const officeId = await createOffice(interval);
    const { availability } = await evaluateOrderingPolicy(officeId, NOW);
    const endDates = ['', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'];
    expect(availability).toEqual({
      officeLocationId: officeId, evaluatedAt: NOW.toISOString(), intervalWeeks: interval,
      timeZone: 'UTC', anchorDate: '2026-09-28',
      status: interval === 0 ? 'unrestricted' : 'eligible',
      blockStart: interval === 0 ? null : '2026-09-28T00:00:00.000Z',
      blockEnd: interval === 0 ? null : `${endDates[interval]}T00:00:00.000Z`,
      nextEligibleAt: null,
    });
  });

  it('short-circuits unrestricted without evaluating the saved anchor/zone or completions', async () => {
    const officeId = await createOffice(0, 'Invalid/Zone', '2026-10-05');
    await createSelection(officeId, '2026-10-01T09:00:00Z');
    const query = vi.spyOn(prisma.foodSelection, 'findFirst').mockImplementation(originalFindFirst);
    expect((await evaluateOrderingPolicy(officeId, NOW)).availability.status).toBe('unrestricted');
    expect(query).not.toHaveBeenCalled();
  });

  it('allows Friday-to-next-Wednesday within fewer than seven elapsed days', async () => {
    const officeId = await createOffice();
    await createSelection(officeId, '2026-10-02T12:00:00Z');
    expect((await evaluateOrderingPolicy(officeId, new Date('2026-10-02T13:00:00Z'))).availability.status).toBe('period_used');
    const result = await evaluateOrderingPolicy(officeId, new Date('2026-10-07T12:00:00Z'));
    expect(result.availability).toMatchObject({ status: 'eligible', blockStart: '2026-10-05T00:00:00.000Z' });
    expect(result.previousCompletedSelectionId).toBeNull();
  });

  it.each<OrderingIntervalWeeks>([1, 2, 3, 4])('has no accumulated credit in %i-week blocks', async interval => {
    const officeId = await createOffice(interval);
    const later = new Date('2027-02-15T12:00:00Z');
    expect((await evaluateOrderingPolicy(officeId, later)).availability.status).toBe('eligible');
    await createSelection(officeId, later.toISOString());
    expect((await evaluateOrderingPolicy(officeId, later)).availability.status).toBe('period_used');
  });

});

describe('ordering policy completion matching', () => {
  it('counts completion, not placement, and queries only one office-scoped evidence row', async () => {
    const officeId = await createOffice();
    const completed = await createSelection(officeId, '2026-09-28T00:00:00Z');
    const query = vi.spyOn(prisma.foodSelection, 'findFirst').mockImplementation(originalFindFirst);
    const result = await evaluateOrderingPolicy(officeId, NOW);
    expect(result.previousCompletedSelectionId).toBe(completed.id);
    expect(result.previousCompletedAt).toBe('2026-09-28T00:00:00.000Z');
    expect(result.availability).toMatchObject({ status: 'period_used', nextEligibleAt: '2026-10-05T00:00:00.000Z' });
    expect(query).toHaveBeenCalledExactlyOnceWith({
      where: { officeLocationId: officeId, status: 'completed', completedAt: {
        gte: new Date('2026-09-28T00:00:00Z'), lt: new Date('2026-10-05T00:00:00Z'),
      } },
      select: { id: true, completedAt: true },
      orderBy: [{ completedAt: 'desc' }, { id: 'asc' }],
    });
    await prisma.foodSelection.update({ where: { id: completed.id }, data: {
      orderPlacedAt: new Date('2026-09-29T12:00:00Z'), completedAt: new Date('2026-09-27T23:59:59.999Z'),
    } });
    expect((await evaluateOrderingPolicy(officeId, NOW)).availability.status).toBe('eligible');
  });

  it.each([
    ['active', null], ['overtime', null], ['ordered', null], ['completed', null],
    ['ordered', '2026-09-29T12:00:00Z'], ['aborted', '2026-09-29T12:00:00Z'],
  ])('does not count %s selections with completion %s', async (status, completedAt) => {
    const officeId = await createOffice();
    await createSelection(officeId, completedAt, status, '2026-09-29T10:00:00Z');
    expect((await evaluateOrderingPolicy(officeId, NOW)).availability.status).toBe('eligible');
  });

  it('uses half-open boundaries and puts exact Monday completion in the new period', async () => {
    const officeId = await createOffice();
    const selection = await createSelection(officeId, '2026-10-05T00:00:00Z');
    expect((await evaluateOrderingPolicy(officeId, new Date('2026-10-04T23:59:59.999Z'))).availability.status).toBe('eligible');
    const result = await evaluateOrderingPolicy(officeId, new Date('2026-10-05T00:00:00Z'));
    expect(result.availability).toMatchObject({ status: 'period_used', blockStart: '2026-10-05T00:00:00.000Z' });
    expect(result.previousCompletedSelectionId).toBe(selection.id);
  });

});

describe('ordering policy calendar boundaries', () => {
  it('waits for a future office-local anchor without querying completion history', async () => {
    const officeId = await createOffice(2, 'Asia/Kathmandu', '2026-10-05');
    const query = vi.spyOn(prisma.foodSelection, 'findFirst').mockImplementation(originalFindFirst);
    const result = await evaluateOrderingPolicy(officeId, NOW);
    expect(result.availability).toMatchObject({
      status: 'not_started', blockStart: null, blockEnd: null, nextEligibleAt: '2026-10-04T18:15:00.000Z',
    });
    expect(result.previousCompletedSelectionId).toBeNull();
    expect(query).not.toHaveBeenCalled();
    expect((await evaluateOrderingPolicy(officeId, new Date('2026-10-04T18:15:00Z'))).availability.status).toBe('eligible');
  });

  it.each([
    ['2026-03-23', '2026-03-29T12:00:00Z', '2026-03-22T23:00:00.000Z', '2026-03-29T22:00:00.000Z'],
    ['2026-10-19', '2026-10-25T12:00:00Z', '2026-10-18T22:00:00.000Z', '2026-10-25T23:00:00.000Z'],
    ['2026-12-28', '2027-01-01T12:00:00Z', '2026-12-27T23:00:00.000Z', '2027-01-03T23:00:00.000Z'],
    ['2024-02-26', '2024-02-29T12:00:00Z', '2024-02-25T23:00:00.000Z', '2024-03-03T23:00:00.000Z'],
  ])('keeps calendar boundaries through DST/year/leap rollover from %s', async (anchor, now, start, end) => {
    const officeId = await createOffice(1, 'Europe/Vienna', anchor);
    expect((await evaluateOrderingPolicy(officeId, new Date(now))).availability)
      .toMatchObject({ blockStart: start, blockEnd: end, status: 'eligible' });
  });

  it('uses the office Monday even while UTC is still Sunday', async () => {
    const officeId = await createOffice(1, 'Europe/Vienna');
    await createSelection(officeId, '2026-10-04T22:00:00Z');
    const result = await evaluateOrderingPolicy(officeId, new Date('2026-10-04T22:30:00Z'));
    expect(result.availability).toMatchObject({ status: 'period_used', blockStart: '2026-10-04T22:00:00.000Z' });
  });

  it('isolates completions and policy settings by office', async () => {
    const officeId = await createOffice();
    const otherId = await createOffice(2, 'Europe/Vienna');
    await createSelection(otherId, '2026-09-29T12:00:00Z');
    expect((await evaluateOrderingPolicy(officeId, NOW)).availability.status).toBe('eligible');
    expect((await evaluateOrderingPolicy(otherId, NOW)).availability).toMatchObject({
      status: 'period_used', intervalWeeks: 2, nextEligibleAt: '2026-10-11T22:00:00.000Z',
    });
  });

});

describe('ordering policy exception history', () => {
  it('counts completed exceptions without moving the anchor or adding future debt', async () => {
    const officeId = await createOffice();
    await createSelection(officeId, '2026-09-29T12:00:00Z');
    const used = await evaluateOrderingPolicy(officeId, NOW);
    const exception = buildOrderingPolicyException(used, ACTOR, 'Team celebration');
    await createSelection(officeId, '2026-10-01T12:00:00Z', 'completed', null, exception);
    expect((await evaluateOrderingPolicy(officeId, new Date('2026-10-02T12:00:00Z'))).availability)
      .toMatchObject({ status: 'period_used', anchorDate: '2026-09-28', nextEligibleAt: '2026-10-05T00:00:00.000Z' });
    expect((await evaluateOrderingPolicy(officeId, new Date('2026-10-05T12:00:00Z'))).availability.status).toBe('eligible');
  });

  it('re-evaluates retained completions when settings change but preserves snapshot values', async () => {
    const officeId = await createOffice();
    await createSelection(officeId, '2026-09-29T12:00:00Z');
    const snapshot = buildOrderingPolicyException(await evaluateOrderingPolicy(officeId, NOW), ACTOR, 'Original reason');
    const selection = await createSelection(officeId, '2026-10-01T12:00:00Z', 'completed', null, snapshot);
    const nextWeek = new Date('2026-10-07T12:00:00Z');
    expect((await evaluateOrderingPolicy(officeId, nextWeek)).availability.status).toBe('eligible');
    await prisma.officeLocation.update({ where: { id: officeId }, data: { orderingIntervalWeeks: 2 } });
    expect((await evaluateOrderingPolicy(officeId, nextWeek)).availability.status).toBe('period_used');
    const poll = await prisma.poll.findUniqueOrThrow({ where: { id: selection.pollId } });
    expect(poll.orderingPolicyException).toEqual(snapshot);
  });

});

describe('ordering policy evaluation failures', () => {
  it('fails safely on unavailable offices, invalid zones, invalid clock or DB failure', async () => {
    const officeId = await createOffice(1, 'Invalid/Zone');
    await expect(evaluateOrderingPolicy(officeId, NOW)).rejects.toThrow(RangeError);
    await prisma.officeLocation.update({ where: { id: officeId }, data: { timeZone: 'UTC' } });
    await expect(evaluateOrderingPolicy(officeId, new Date(NaN))).rejects.toThrow(RangeError);
    vi.spyOn(prisma.foodSelection, 'findFirst').mockRejectedValueOnce(new Error('Database offline'));
    await expect(evaluateOrderingPolicy(officeId, NOW)).rejects.toThrow('Database offline');
    await prisma.officeLocation.update({ where: { id: officeId }, data: { isActive: false } });
    await expect(evaluateOrderingPolicy(officeId, NOW)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects corrupt stored intervals and non-Monday anchors instead of permitting starts', async () => {
    const officeId = await createOffice();
    const office = await officeService.validateOfficeLocationId(officeId);
    const read = vi.spyOn(officeService, 'validateOfficeLocationId');
    read.mockResolvedValueOnce({ ...office, orderingIntervalWeeks: 5 as OrderingIntervalWeeks });
    await expect(evaluateOrderingPolicy(officeId, NOW)).rejects.toMatchObject({ statusCode: 500 });
    read.mockResolvedValueOnce({ ...office, orderingAnchorDate: '2026-09-29' });
    await expect(evaluateOrderingPolicy(officeId, NOW)).rejects.toThrow('Monday');
  });
});

function usedEvaluation(): OrderingPolicyEvaluation {
  return {
    availability: {
      officeLocationId: 'office-id', evaluatedAt: NOW.toISOString(), intervalWeeks: 1,
      timeZone: 'UTC', anchorDate: '2026-09-28', status: 'period_used',
      blockStart: '2026-09-28T00:00:00.000Z', blockEnd: '2026-10-05T00:00:00.000Z',
      nextEligibleAt: '2026-10-05T00:00:00.000Z',
    },
    previousCompletedSelectionId: 'selection-id', previousCompletedAt: '2026-09-29T12:00:00.000Z',
  };
}

describe('ordering policy justification and exception snapshots', () => {
  it('trims valid reasons and accepts exactly 500 characters after trimming', () => {
    expect(validateOrderingPolicyJustification('  Celebration \n')).toBe('Celebration');
    expect(validateOrderingPolicyJustification(` ${'x'.repeat(500)} `)).toHaveLength(500);
    expect(validateOrderingPolicyJustification(undefined)).toBeUndefined();
  });

  it.each(['', ' \n\t ', 'x'.repeat(501), null, 42, false, {}, []])('rejects malformed reason %j', reason => {
    expect(() => validateOrderingPolicyJustification(reason)).toThrow(expect.objectContaining({ statusCode: 400 }));
    expect(() => buildOrderingPolicyException(usedEvaluation(), ACTOR, reason))
      .toThrow(expect.objectContaining({ statusCode: 400 }));
  });

  it('returns a typed warning rather than inventing an override for a missing reason', () => {
    const evaluation = usedEvaluation();
    expect(() => buildOrderingPolicyException(evaluation, ACTOR, undefined)).toThrow(expect.objectContaining({
      statusCode: 409, code: 'ORDERING_POLICY_WARNING', orderingPolicy: evaluation.availability,
    }));
  });

  it.each(['eligible', 'unrestricted'] as const)('does not record a stale override when %s', status => {
    const evaluation = usedEvaluation();
    evaluation.availability.status = status;
    expect(buildOrderingPolicyException(evaluation, ACTOR, 'Stale browser warning')).toBeNull();
    expect(buildOrderingPolicyException(evaluation, ACTOR, undefined)).toBeNull();
  });

});

describe('ordering policy exception snapshots', () => {
  it('captures independent actor and policy snapshots, including completion evidence', () => {
    const evaluation = usedEvaluation();
    const actor = { ...ACTOR };
    const result = buildOrderingPolicyException(evaluation, actor, '  Celebration  ');
    expect(result).toEqual({
      reason: 'Celebration', ...ACTOR, decidedAt: NOW.toISOString(),
      intervalWeeks: 1, timeZone: 'UTC', anchorDate: '2026-09-28',
      blockStart: '2026-09-28T00:00:00.000Z', blockEnd: '2026-10-05T00:00:00.000Z',
      nextEligibleAt: '2026-10-05T00:00:00.000Z', violation: 'period_used',
      previousCompletedSelectionId: 'selection-id', previousCompletedAt: '2026-09-29T12:00:00.000Z',
    });
    actor.displayNameSnapshot = 'Renamed';
    evaluation.availability.timeZone = 'Europe/Vienna';
    expect(result).toMatchObject({ displayNameSnapshot: 'Alice', timeZone: 'UTC' });
  });

  it('captures before-anchor exceptions without invented blocks or completion evidence', () => {
    const evaluation = usedEvaluation();
    Object.assign(evaluation.availability, { status: 'not_started', blockStart: null, blockEnd: null });
    evaluation.previousCompletedAt = null;
    evaluation.previousCompletedSelectionId = null;
    expect(buildOrderingPolicyException(evaluation, ACTOR, 'Early launch')).toMatchObject({
      violation: 'not_started', blockStart: null, blockEnd: null,
      previousCompletedAt: null, previousCompletedSelectionId: null,
    });
    expect(() => buildOrderingPolicyException(evaluation, ACTOR, undefined)).toThrow('not started');
  });

  it('requires complete signed actor attribution and a restricted next boundary', () => {
    for (const key of ['actorKey', 'actorEmail', 'displayNameSnapshot'] as const) {
      expect(() => buildOrderingPolicyException(usedEvaluation(), { ...ACTOR, [key]: ' ' }, 'Reason'))
        .toThrow(expect.objectContaining({ statusCode: 401 }));
    }
    const evaluation = usedEvaluation();
    evaluation.availability.nextEligibleAt = null;
    expect(() => buildOrderingPolicyException(evaluation, ACTOR, 'Reason'))
      .toThrow(expect.objectContaining({ statusCode: 500 }));
    evaluation.availability.intervalWeeks = 0;
    evaluation.availability.nextEligibleAt = '2026-10-05T00:00:00.000Z';
    expect(() => buildOrderingPolicyException(evaluation, ACTOR, 'Reason'))
      .toThrow(expect.objectContaining({ statusCode: 500 }));
  });
});
