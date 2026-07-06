import prisma from '../db.js';
import type { Poll, PollVote } from '../../lib/types.js';
import {
  ensureDefaultOfficeLocation,
  validateOfficeLocationId,
} from './officeLocation.js';

export const pollInclude = { votes: true, excludedMenus: true } as const;

// ponytail: late-bound callback so timer management stays in this low-layer module
let onPollExpired: (pollId: string) => void = () => {};
let onPollStarted: (poll: Poll, officeLocationId: string) => void | Promise<void> = () => {};

export function registerPollExpiryHandler(handler: (pollId: string) => void): void {
  onPollExpired = handler;
}

export function registerPollStartedHandler(
  handler: (poll: Poll, officeLocationId: string) => void | Promise<void>,
): void {
  onPollStarted = handler;
}

export async function announcePollStarted(poll: Poll, officeLocationId: string): Promise<void> {
  await onPollStarted(poll, officeLocationId);
}

// ─── Timer management ──────────────────────────────────────

const activeTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function getActiveTimers(): Map<string, ReturnType<typeof setTimeout>> {
  return activeTimers;
}

export function scheduleTimer(pollId: string, endsAt: Date): void {
  clearTimer(pollId);
  const delay = endsAt.getTime() - Date.now();
  if (delay <= 0) {
    onPollExpired(pollId);
    return;
  }
  const timer = setTimeout(() => {
    activeTimers.delete(pollId);
    onPollExpired(pollId);
  }, delay);
  if (typeof timer === 'object' && 'unref' in timer) {
    timer.unref();
  }
  activeTimers.set(pollId, timer);
}

export function clearTimer(pollId: string): void {
  const existing = activeTimers.get(pollId);
  if (existing) {
    clearTimeout(existing);
    activeTimers.delete(pollId);
  }
}

export function clearAllTimers(): void {
  for (const [, timer] of activeTimers) {
    clearTimeout(timer);
  }
  activeTimers.clear();
}

// ─── Validation helpers ────────────────────────────────────

export function validateDuration(durationMinutes: number): void {
  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 5 ||
    durationMinutes > 720 ||
    durationMinutes % 5 !== 0
  ) {
    throw Object.assign(
      new Error('Duration must be a multiple of 5 between 5 and 720 minutes'),
      { statusCode: 400 },
    );
  }
}

export function normalizeCreatorKey(createdBy?: string | null): string | null {
  const normalized = createdBy?.trim().toLowerCase() ?? '';
  return normalized.length > 0 ? normalized : null;
}

export async function resolvePollOfficeLocationId(officeLocationId?: string): Promise<string> {
  if (officeLocationId?.trim()) {
    return (await validateOfficeLocationId(officeLocationId)).id;
  }
  return (await ensureDefaultOfficeLocation()).id;
}

export async function ensureNoPollInProgress(officeLocationId?: string): Promise<void> {
  const resolvedOfficeLocationId = await resolvePollOfficeLocationId(officeLocationId);
  const existing = await prisma.poll.findFirst({
    where: {
      officeLocationId: resolvedOfficeLocationId,
      status: { in: ['active', 'tied'] },
    },
  });
  if (existing) {
    throw Object.assign(new Error('A poll is already in progress'), { statusCode: 409 });
  }

  const ongoingDelivery = await prisma.foodSelection.findFirst({
    where: {
      officeLocationId: resolvedOfficeLocationId,
      status: { in: ['ordering', 'delivering', 'delivery_due'] },
    },
  });
  if (ongoingDelivery) {
    throw Object.assign(new Error('Cannot start a new team lunch while an order is ongoing'), {
      statusCode: 409,
    });
  }
}

type ExcludedMenuInput = Array<{ menuId: string; reason: string }> | undefined;

export async function validateAndNormalizeExcludedMenus(
  excludedMenuJustifications: ExcludedMenuInput,
  officeLocationId?: string,
): Promise<Array<{ menuId: string; menuName: string; reason: string }>> {
  const resolvedOfficeLocationId = await resolvePollOfficeLocationId(officeLocationId);
  const availableMenus = await prisma.menu.findMany({
    where: { officeLocationId: resolvedOfficeLocationId },
    select: { id: true, name: true },
  });

  const byId = new Map(
    availableMenus.map((menu: { id: string; name: string }) => [menu.id, menu.name]),
  );
  const rows = excludedMenuJustifications ?? [];
  const seen = new Set<string>();
  const normalized: Array<{ menuId: string; menuName: string; reason: string }> = [];

  for (const row of rows) {
    const menuId = row.menuId;
    const reason = row.reason.trim();

    if (!menuId || !byId.has(menuId)) {
      throw Object.assign(new Error('Excluded menu must be a valid poll option'), { statusCode: 400 });
    }
    if (seen.has(menuId)) {
      throw Object.assign(new Error('Duplicate excluded menu is not allowed'), { statusCode: 400 });
    }
    if (!reason || reason.length > 240) {
      throw Object.assign(
        new Error('A justification of 1-240 characters is required for each excluded menu'),
        { statusCode: 400 },
      );
    }

    seen.add(menuId);
    normalized.push({ menuId, menuName: byId.get(menuId) as string, reason });
  }

  if (availableMenus.length > 0 && normalized.length >= availableMenus.length) {
    throw Object.assign(new Error('At least one menu option must remain in the poll'), {
      statusCode: 400,
    });
  }

  return normalized;
}

// ─── Format helper ────────────────────────────────────────

export function formatPoll(poll: {
  id: string;
  createdBy: string | null;
  description: string;
  status: string;
  startedAt: Date;
  endsAt: Date;
  endedPrematurely: boolean;
  winnerMenuId: string | null;
  winnerMenuName: string | null;
  winnerSelectedRandomly: boolean;
  createdAt: Date;
  excludedMenus?: Array<{
    menuId: string;
    menuName: string;
    reason: string;
  }>;
  votes: Array<{
    id: string;
    pollId: string;
    menuId: string;
    menuName: string;
    nickname: string;
    actorKey?: string | null;
    actorEmail?: string | null;
    displayNameSnapshot?: string | null;
    castAt: Date;
  }>;
}): Poll {
  const voteCounts: Record<string, number> = {};
  for (const vote of poll.votes) {
    voteCounts[vote.menuId] = (voteCounts[vote.menuId] || 0) + 1;
  }

  return {
    id: poll.id,
    createdBy: poll.createdBy,
    description: poll.description,
    status: poll.status as Poll['status'],
    startedAt: poll.startedAt.toISOString(),
    endsAt: poll.endsAt.toISOString(),
    endedPrematurely: poll.endedPrematurely,
    winnerMenuId: poll.winnerMenuId,
    winnerMenuName: poll.winnerMenuName,
    winnerSelectedRandomly: poll.winnerSelectedRandomly,
    createdAt: poll.createdAt.toISOString(),
    excludedMenuJustifications: (poll.excludedMenus ?? []).map((entry) => ({
      menuId: entry.menuId,
      menuName: entry.menuName,
      reason: entry.reason,
    })),
    votes: poll.votes.map(
      (v): PollVote => ({
        id: v.id,
        pollId: v.pollId,
        menuId: v.menuId,
        menuName: v.menuName,
        nickname: v.displayNameSnapshot ?? v.nickname,
        actorKey: v.actorKey ?? null,
        actorEmail: v.actorEmail ?? null,
        displayNameSnapshot: v.displayNameSnapshot ?? v.nickname,
        castAt: v.castAt.toISOString(),
      }),
    ),
    voteCounts,
  };
}

// ─── Poll creation (no SSE, no auth, no email) ───────────

export async function createPollRecord(
  description: string,
  durationMinutes: number,
  excludedMenuJustifications?: Array<{ menuId: string; reason: string }>,
  officeLocationId?: string,
  createdBy?: string | null,
): Promise<{ poll: Poll; resolvedOfficeLocationId: string }> {
  const trimmed = description.trim();
  if (!trimmed || trimmed.length > 120) {
    throw Object.assign(new Error('Description must be 1–120 characters'), { statusCode: 400 });
  }

  validateDuration(durationMinutes);
  const resolvedOfficeLocationId = await resolvePollOfficeLocationId(officeLocationId);
  await ensureNoPollInProgress(resolvedOfficeLocationId);
  const normalizedExclusions = await validateAndNormalizeExcludedMenus(
    excludedMenuJustifications,
    resolvedOfficeLocationId,
  );

  const now = new Date();
  const endsAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

  const poll = await prisma.poll.create({
    data: {
      officeLocationId: resolvedOfficeLocationId,
      createdBy: normalizeCreatorKey(createdBy),
      description: trimmed,
      status: 'active',
      startedAt: now,
      endsAt,
      excludedMenus: {
        create: normalizedExclusions.map((entry) => ({
          menuId: entry.menuId,
          menuName: entry.menuName,
          reason: entry.reason,
        })),
      },
    },
    include: pollInclude,
  });

  scheduleTimer(poll.id, endsAt);

  return { poll: formatPoll(poll), resolvedOfficeLocationId };
}
