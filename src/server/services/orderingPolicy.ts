import prisma from '../db.js';
import { serviceError } from '../routes/routeUtils.js';
import type { AuthenticatedActor } from '../routes/authIdentity.js';
import type { OrderingPolicyAvailability, OrderingPolicyException } from '../../lib/types.js';
import { validateOfficeLocationId } from './officeLocation.js';
import {
  addCalendarDays, calendarDaysBetween, getOfficeDateTime,
  officeMidnightToUtc, validateMondayDate,
} from './officeTime.js';

export interface OrderingPolicyEvaluation {
  availability: OrderingPolicyAvailability;
  previousCompletedSelectionId: string | null;
  previousCompletedAt: string | null;
}

export async function evaluateOrderingPolicy(
  officeLocationId: string,
  now = new Date(),
): Promise<OrderingPolicyEvaluation> {
  const office = await validateOfficeLocationId(officeLocationId);
  if (![0, 1, 2, 3, 4].includes(office.orderingIntervalWeeks)) {
    throw serviceError('Invalid stored ordering interval', 500);
  }
  const availability: OrderingPolicyAvailability = {
    officeLocationId: office.id,
    evaluatedAt: now.toISOString(),
    intervalWeeks: office.orderingIntervalWeeks,
    timeZone: office.timeZone,
    anchorDate: office.orderingAnchorDate,
    status: 'unrestricted',
    blockStart: null,
    blockEnd: null,
    nextEligibleAt: null,
  };
  const evaluation: OrderingPolicyEvaluation = {
    availability, previousCompletedSelectionId: null, previousCompletedAt: null,
  };
  if (office.orderingIntervalWeeks === 0) return evaluation;

  validateMondayDate(office.orderingAnchorDate);
  const localDate = getOfficeDateTime(now, office.timeZone).date;
  const daysFromAnchor = calendarDaysBetween(office.orderingAnchorDate, localDate);
  if (daysFromAnchor < 0) {
    availability.status = 'not_started';
    availability.nextEligibleAt = officeMidnightToUtc(office.orderingAnchorDate, office.timeZone).toISOString();
    return evaluation;
  }

  const blockDays = 7 * office.orderingIntervalWeeks;
  const startDate = addCalendarDays(office.orderingAnchorDate, Math.floor(daysFromAnchor / blockDays) * blockDays);
  const endDate = addCalendarDays(startDate, blockDays);
  const start = officeMidnightToUtc(startDate, office.timeZone);
  const end = officeMidnightToUtc(endDate, office.timeZone);
  const completed = await prisma.foodSelection.findFirst({
    where: { officeLocationId: office.id, status: 'completed', completedAt: { gte: start, lt: end } },
    select: { id: true, completedAt: true },
    orderBy: [{ completedAt: 'desc' }, { id: 'asc' }],
  });
  availability.blockStart = start.toISOString();
  availability.blockEnd = end.toISOString();
  availability.status = 'eligible';
  if (completed) {
    if (!completed.completedAt) throw serviceError('Completion evidence is missing its timestamp', 500);
    availability.status = 'period_used';
    availability.nextEligibleAt = availability.blockEnd;
    evaluation.previousCompletedSelectionId = completed.id;
    evaluation.previousCompletedAt = completed.completedAt.toISOString();
  }
  return evaluation;
}

export function validateOrderingPolicyJustification(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 500) {
    throw serviceError('Ordering policy justification must be 1–500 characters of text', 400);
  }
  return value.trim();
}

export function buildOrderingPolicyException(
  evaluation: OrderingPolicyEvaluation,
  actor: Pick<AuthenticatedActor, 'actorKey' | 'actorEmail' | 'displayNameSnapshot'>,
  justification: unknown,
): OrderingPolicyException | null {
  const reason = validateOrderingPolicyJustification(justification);
  const policy = evaluation.availability;
  if (policy.status === 'eligible' || policy.status === 'unrestricted') return null;
  if (!reason) {
    throw Object.assign(serviceError(
      policy.status === 'not_started'
        ? 'This office ordering policy has not started yet.'
        : 'This office has already completed a lunch in the current policy period.',
      409,
    ), { code: 'ORDERING_POLICY_WARNING', orderingPolicy: policy });
  }
  if (!actor || ![actor.actorKey, actor.actorEmail, actor.displayNameSnapshot]
    .every(value => typeof value === 'string' && value.trim().length > 0)) {
    throw serviceError('Authenticated actor is required for an ordering policy exception', 401);
  }
  if (policy.intervalWeeks === 0 || !policy.nextEligibleAt) {
    throw serviceError('Invalid ordering policy exception context', 500);
  }
  return {
    reason,
    actorKey: actor.actorKey,
    actorEmail: actor.actorEmail,
    displayNameSnapshot: actor.displayNameSnapshot,
    decidedAt: policy.evaluatedAt,
    intervalWeeks: policy.intervalWeeks,
    timeZone: policy.timeZone,
    anchorDate: policy.anchorDate,
    blockStart: policy.blockStart,
    blockEnd: policy.blockEnd,
    nextEligibleAt: policy.nextEligibleAt,
    violation: policy.status,
    previousCompletedSelectionId: evaluation.previousCompletedSelectionId,
    previousCompletedAt: evaluation.previousCompletedAt,
  };
}
