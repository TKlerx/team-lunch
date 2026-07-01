import prisma from '../db.js';
import { broadcast } from '../sse.js';
import type { Poll } from '../../lib/types.js';
import { listApprovedAccessUserEmails } from './authAccess.js';
import { sendEmail } from './notificationEmail.js';
import { getOfficeDefaultFoodSelectionDurationMinutes } from './officeLocation.js';
import {
  pollInclude,
  formatPoll,
  validateDuration,
  normalizeCreatorKey,
  resolvePollOfficeLocationId,
  ensureNoPollInProgress,
  validateAndNormalizeExcludedMenus,
  scheduleTimer,
  clearTimer,
  clearAllTimers,
  getActiveTimers,
  createPollRecord,
  registerPollExpiryHandler,
} from './pollCreation.js';

export { clearTimer, clearAllTimers, getActiveTimers, formatPoll };

// ─── Validation helpers (poll.ts-only) ────────────────────

function validateExtension(extensionMinutes: number): void {
  const allowed = [5, 10, 15, 30];
  if (!allowed.includes(extensionMinutes)) {
    throw Object.assign(
      new Error('Extension must be 5, 10, 15, or 30 minutes'),
      { statusCode: 400 },
    );
  }
}

function validateRemainingMinutes(remainingMinutes: number): void {
  if (!Number.isInteger(remainingMinutes) || remainingMinutes < 1 || remainingMinutes > 240) {
    throw Object.assign(
      new Error('Remaining minutes must be an integer between 1 and 240'),
      { statusCode: 400 },
    );
  }
}

function validateActorLabel(nickname: string): string {
  const trimmed = nickname.trim();
  if (!trimmed || trimmed.length > 255) {
    throw Object.assign(new Error('Actor label must be 1-255 characters'), { statusCode: 400 });
  }
  return trimmed;
}

type VoteActor = {
  actorKey?: string | null;
  actorEmail?: string | null;
  displayNameSnapshot?: string | null;
};

function resolveVoteIdentity(label: string, actor?: VoteActor): {
  actorKey: string;
  actorEmail: string | null;
  displayNameSnapshot: string;
} {
  const displayNameSnapshot = validateActorLabel(actor?.displayNameSnapshot ?? label);
  const actorKey = validateActorLabel(actor?.actorKey ?? label).toLowerCase();
  const actorEmail = actor?.actorEmail?.trim().toLowerCase() || null;
  return { actorKey, actorEmail, displayNameSnapshot };
}

function parseGlobalAutoStartFoodSelectionMinutesFallback(): number {
  const raw = (process.env.DEFAULT_FOOD_SELECTION_DURATION_MINUTES ?? '').trim();
  if (!raw) {
    return 30;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return 30;
  }
  return parsed;
}

async function autoStartFoodSelectionForPoll(
  poll: {
    id: string;
    officeLocationId: string;
    createdBy: string | null;
  },
): Promise<void> {
  const autoStartMinutes =
    process.env.NODE_ENV === 'test'
      ? parseGlobalAutoStartFoodSelectionMinutesFallback()
      : await getOfficeDefaultFoodSelectionDurationMinutes(poll.officeLocationId).catch(() =>
          parseGlobalAutoStartFoodSelectionMinutesFallback(),
        );
  if (autoStartMinutes <= 0) {
    return;
  }

  try {
    const foodSelectionService = await import('./foodSelection.js');
    await foodSelectionService.startFoodSelection(
      poll.id,
      autoStartMinutes,
      poll.officeLocationId,
      poll.createdBy,
    );
  } catch (error) {
    console.error('[poll] failed to auto-start food selection', error);
  }
}

// ─── Fetch helpers ─────────────────────────────────────────

type PollWithVotes = Awaited<ReturnType<typeof prisma.poll.findUniqueOrThrow>> & {
  officeLocationId: string;
  votes: Awaited<ReturnType<typeof prisma.pollVote.findMany>>;
  excludedMenus: Awaited<ReturnType<typeof prisma.pollExcludedMenu.findMany>>;
};

async function fetchPollOrThrow(pollId: string, officeLocationId?: string): Promise<PollWithVotes> {
  const resolvedOfficeLocationId = officeLocationId
    ? await resolvePollOfficeLocationId(officeLocationId)
    : null;
  const poll = await prisma.poll.findFirst({
    where: {
      id: pollId,
      ...(resolvedOfficeLocationId ? { officeLocationId: resolvedOfficeLocationId } : {}),
    },
    include: pollInclude,
  });
  if (!poll) {
    throw Object.assign(new Error('Poll not found'), { statusCode: 404 });
  }
  return poll;
}

function requireActive(poll: PollWithVotes): void {
  if (poll.status !== 'active') {
    throw Object.assign(new Error('Poll is not active'), { statusCode: 400 });
  }
  if (new Date() > poll.endsAt) {
    throw Object.assign(new Error('Poll has expired'), { statusCode: 400 });
  }
}

function countVotesPerMenu(votes: { menuId: string; menuName: string }[]): {
  voteCounts: Record<string, number>;
  menuNames: Record<string, string>;
} {
  const voteCounts: Record<string, number> = {};
  const menuNames: Record<string, string> = {};
  for (const vote of votes) {
    voteCounts[vote.menuId] = (voteCounts[vote.menuId] || 0) + 1;
    menuNames[vote.menuId] = vote.menuName;
  }
  return { voteCounts, menuNames };
}

function getTopMenus(voteCounts: Record<string, number>): [string, number][] {
  const entries = Object.entries(voteCounts);
  if (entries.length === 0) return [];
  const maxVotes = Math.max(...entries.map(([, count]) => count));
  return entries.filter(([, count]) => count === maxVotes);
}

async function writePrematureCloseAuditLog(
  pollId: string,
  actorEmail: string | null,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        event: 'poll_closed_early',
        actorEmail,
        targetType: 'poll',
        targetId: pollId,
      },
    });
  } catch {
    // Best effort only: poll completion must never fail because audit logging failed.
  }
}

async function writeKillAuditLog(pollId: string, actorEmail: string | null): Promise<void> {
  const delegate = (prisma as unknown as { auditLog?: { create?: (...args: unknown[]) => unknown } })
    .auditLog;
  if (!delegate || typeof delegate.create !== 'function') {
    return;
  }

  try {
    await prisma.auditLog.create({
      data: {
        event: 'poll_killed_by_admin',
        actorEmail,
        targetType: 'poll',
        targetId: pollId,
      },
    });
  } catch {
    // Best effort only: poll abort must never fail because audit logging failed.
  }
}

function buildPollStartNotificationText(poll: Poll): string {
  const lines = [
    `A new lunch poll has started in Team Lunch: ${poll.description}`,
    `Voting ends at: ${poll.endsAt}`,
  ];

  const publicUrl = process.env.APP_PUBLIC_URL?.trim() ?? '';
  const basePath = process.env.BASE_PATH?.trim() ?? '';
  if (publicUrl) {
    lines.push(`Open the app: ${publicUrl}${basePath}`);
  }

  return lines.join('\n');
}

async function notifyRegisteredUsersAboutPollStart(
  poll: Poll,
  officeLocationId: string,
): Promise<void> {
  const recipients = await listApprovedAccessUserEmails(officeLocationId);
  if (recipients.length === 0) {
    return;
  }

  try {
    await sendEmail({
      to: recipients,
      subject: `[Team Lunch] New lunch poll: ${poll.description}`,
      text: buildPollStartNotificationText(poll),
    });
  } catch (error) {
    console.error('[poll] failed to send poll-start notification', error);
  }
}

// ─── Register expiry handler ──────────────────────────────

registerPollExpiryHandler((pollId: string) => {
  void endPoll(pollId);
});

// ─── Poll operations ───────────────────────────────────────

export async function startPoll(
  description: string,
  durationMinutes: number,
  excludedMenuJustifications?: Array<{ menuId: string; reason: string }>,
  officeLocationId?: string,
  createdBy?: string | null,
): Promise<Poll> {
  const { poll, resolvedOfficeLocationId } = await createPollRecord(
    description,
    durationMinutes,
    excludedMenuJustifications,
    officeLocationId,
    createdBy,
  );

  broadcast('poll_started', { poll }, resolvedOfficeLocationId);
  await notifyRegisteredUsersAboutPollStart(poll, resolvedOfficeLocationId);

  return poll;
}

export async function castVote(
  pollId: string,
  menuId: string,
  nickname: string,
  officeLocationId?: string,
  actor?: VoteActor,
): Promise<Poll> {
  const identity = resolveVoteIdentity(nickname, actor);

  const poll = await fetchPollOrThrow(pollId, officeLocationId);
  requireActive(poll);

  // Verify menu exists
  const menu = await prisma.menu.findUnique({ where: { id: menuId } });
  if (!menu) {
    throw Object.assign(new Error('Menu not found'), { statusCode: 404 });
  }
  if (menu.officeLocationId !== poll.officeLocationId) {
    throw Object.assign(new Error('Menu not found'), { statusCode: 404 });
  }
  const excluded = poll.excludedMenus.find((entry: { menuId: string }) => entry.menuId === menuId);
  if (excluded) {
    throw Object.assign(
      new Error(`Menu was excluded from this poll: ${excluded.reason}`),
      { statusCode: 400 },
    );
  }

  // Check for existing vote (unique constraint: pollId + menuId + nickname)
  const existingVote = await prisma.pollVote.findUnique({
    where: {
      pollId_menuId_actorKey: { pollId, menuId, actorKey: identity.actorKey },
    },
  });
  if (existingVote) {
    throw Object.assign(new Error('You have already voted for this menu'), { statusCode: 409 });
  }

  await prisma.pollVote.create({
    data: {
      pollId,
      menuId,
      menuName: menu.name,
      nickname: identity.displayNameSnapshot,
      actorKey: identity.actorKey,
      actorEmail: identity.actorEmail,
      displayNameSnapshot: identity.displayNameSnapshot,
    },
  });

  // Re-fetch poll to get updated vote counts
  const updated = await prisma.poll.findUniqueOrThrow({
    where: { id: pollId },
    include: pollInclude,
  });

  const formatted = formatPoll(updated);
  broadcast('vote_cast', { poll: formatted }, poll.officeLocationId);

  return formatted;
}

export async function withdrawVote(
  pollId: string,
  menuId: string,
  nickname: string,
  officeLocationId?: string,
  actor?: VoteActor,
): Promise<Poll> {
  const identity = resolveVoteIdentity(nickname, actor);

  const poll = await fetchPollOrThrow(pollId, officeLocationId);
  requireActive(poll);

  // Find the vote
  const vote = await prisma.pollVote.findUnique({
    where: {
      pollId_menuId_actorKey: { pollId, menuId, actorKey: identity.actorKey },
    },
  });
  if (!vote) {
    throw Object.assign(new Error('Vote not found'), { statusCode: 404 });
  }

  await prisma.pollVote.delete({ where: { id: vote.id } });

  // Re-fetch to get updated counts
  const updated = await prisma.poll.findUniqueOrThrow({
    where: { id: pollId },
    include: pollInclude,
  });

  const formatted = formatPoll(updated);
  broadcast('vote_withdrawn', { poll: formatted }, poll.officeLocationId);

  return formatted;
}

export async function withdrawAllVotes(
  pollId: string,
  nickname: string,
  officeLocationId?: string,
  actor?: VoteActor,
): Promise<Poll> {
  const identity = resolveVoteIdentity(nickname, actor);

  const poll = await fetchPollOrThrow(pollId, officeLocationId);
  requireActive(poll);

  const deleted = await prisma.pollVote.deleteMany({
    where: { pollId, actorKey: identity.actorKey },
  });
  if (deleted.count === 0) {
    throw Object.assign(new Error('No votes found for this user'), { statusCode: 404 });
  }

  const updated = await prisma.poll.findUniqueOrThrow({
    where: { id: pollId },
    include: pollInclude,
  });

  const formatted = formatPoll(updated);
  broadcast('vote_withdrawn', { poll: formatted }, poll.officeLocationId);

  return formatted;
}

export async function endPoll(
  pollId: string,
  options: { allowPremature?: boolean; actorEmail?: string } = {},
  officeLocationId?: string,
): Promise<Poll> {
  const allowPremature = options.allowPremature ?? true;
  const actorEmail = options.actorEmail?.trim().toLowerCase() || null;
  const poll = await fetchPollOrThrow(pollId, officeLocationId);
  if (poll.status === 'finished' || poll.status === 'aborted') {
    throw Object.assign(new Error('Poll is already finished'), { statusCode: 400 });
  }

  if (poll.status === 'active' && !allowPremature && Date.now() < poll.endsAt.getTime()) {
    throw Object.assign(new Error('Poll cannot be completed before timer expires'), {
      statusCode: 400,
    });
  }

  const endedPrematurely =
    allowPremature && poll.status === 'active' && Date.now() < poll.endsAt.getTime();

  // Cancel any running timer
  clearTimer(pollId);

  // Count votes per menu
  const { voteCounts, menuNames } = countVotesPerMenu(poll.votes);
  const topMenus = getTopMenus(voteCounts);

  if (topMenus.length === 0) {
    // No votes — finish with no winner
    const updated = await prisma.poll.update({
      where: { id: pollId },
      data: {
        status: 'finished',
        endedPrematurely,
      },
      include: pollInclude,
    });
    if (endedPrematurely) {
      await writePrematureCloseAuditLog(pollId, actorEmail);
    }
    const formatted = formatPoll(updated);
    broadcast('poll_ended', {
      pollId,
      status: 'finished' as const,
      endedPrematurely,
    }, poll.officeLocationId);
    return formatted;
  }

  if (topMenus.length === 1) {
    // Single winner
    const [winnerMenuId] = topMenus[0];
    const winnerMenuName = menuNames[winnerMenuId];

    const updated = await prisma.poll.update({
      where: { id: pollId },
      data: {
        status: 'finished',
        endedPrematurely,
        winnerMenuId,
        winnerMenuName,
      },
      include: pollInclude,
    });
    if (endedPrematurely) {
      await writePrematureCloseAuditLog(pollId, actorEmail);
    }
    const formatted = formatPoll(updated);
    broadcast('poll_ended', {
      pollId,
      status: 'finished' as const,
      endedPrematurely,
      winner: {
        menuId: winnerMenuId,
        menuName: winnerMenuName,
        selectedRandomly: false,
      },
    }, poll.officeLocationId);
    await autoStartFoodSelectionForPoll(updated);
    return formatted;
  }

  // Tie
  const updated = await prisma.poll.update({
    where: { id: pollId },
    data: { status: 'tied' },
    include: pollInclude,
  });
  const formatted = formatPoll(updated);
  broadcast('poll_ended', { pollId, status: 'tied' as const }, poll.officeLocationId);
  return formatted;
}

export async function extendPoll(
  pollId: string,
  extensionMinutes: number,
  officeLocationId?: string,
): Promise<Poll> {
  validateExtension(extensionMinutes);

  const poll = await fetchPollOrThrow(pollId, officeLocationId);
  if (poll.status !== 'tied') {
    throw Object.assign(new Error('Only tied polls can be extended'), { statusCode: 400 });
  }

  const now = new Date();
  const newEndsAt = new Date(now.getTime() + extensionMinutes * 60 * 1000);

  const updated = await prisma.poll.update({
    where: { id: pollId },
    data: {
      status: 'active',
      endsAt: newEndsAt,
    },
    include: pollInclude,
  });

  const formatted = formatPoll(updated);
  broadcast('poll_extended', { pollId, newEndsAt: newEndsAt.toISOString() }, poll.officeLocationId);

  // Schedule new timer
  scheduleTimer(pollId, newEndsAt);

  return formatted;
}

export async function updateActivePollTimer(
  pollId: string,
  remainingMinutes: number,
  officeLocationId?: string,
): Promise<Poll> {
  validateRemainingMinutes(remainingMinutes);

  const poll = await fetchPollOrThrow(pollId, officeLocationId);
  if (poll.status !== 'active') {
    throw Object.assign(new Error('Only active polls can update timer'), { statusCode: 400 });
  }

  const now = new Date();
  const newEndsAt = new Date(now.getTime() + remainingMinutes * 60 * 1000);

  const updated = await prisma.poll.update({
    where: { id: pollId },
    data: { endsAt: newEndsAt },
    include: pollInclude,
  });

  scheduleTimer(pollId, newEndsAt);

  const formatted = formatPoll(updated);
  broadcast('poll_extended', { pollId, newEndsAt: newEndsAt.toISOString() }, poll.officeLocationId);

  return formatted;
}

export async function randomWinner(pollId: string, officeLocationId?: string): Promise<Poll> {
  const poll = await fetchPollOrThrow(pollId, officeLocationId);
  if (poll.status !== 'tied') {
    throw Object.assign(new Error('Only tied polls can use random selection'), { statusCode: 400 });
  }

  // Cancel any running timer
  clearTimer(pollId);

  // Count votes per menu
  const { voteCounts, menuNames } = countVotesPerMenu(poll.votes);
  const topMenus = getTopMenus(voteCounts);

  // Pick random from tied top candidates
  const randomIndex = Math.floor(Math.random() * topMenus.length);
  const [winnerMenuId] = topMenus[randomIndex];
  const winnerMenuName = menuNames[winnerMenuId];

  const updated = await prisma.poll.update({
    where: { id: pollId },
    data: {
      status: 'finished',
        endedPrematurely: false,
      winnerMenuId,
      winnerMenuName,
      winnerSelectedRandomly: true,
    },
    include: pollInclude,
  });

  const formatted = formatPoll(updated);
  broadcast('poll_ended', {
    pollId,
    status: 'finished' as const,
    endedPrematurely: false,
    winner: {
      menuId: winnerMenuId,
      menuName: winnerMenuName,
      selectedRandomly: true,
    },
  }, poll.officeLocationId);
  await autoStartFoodSelectionForPoll(updated);
  return formatted;
}

export async function getActivePoll(officeLocationId?: string): Promise<Poll | null> {
  const resolvedOfficeLocationId = await resolvePollOfficeLocationId(officeLocationId);
  const poll = await prisma.poll.findFirst({
    where: {
      officeLocationId: resolvedOfficeLocationId,
      status: { in: ['active', 'tied'] },
    },
    include: pollInclude,
    orderBy: { createdAt: 'desc' },
  });
  return poll ? formatPoll(poll) : null;
}

export async function getPoll(pollId: string, officeLocationId?: string): Promise<Poll> {
  const poll = await fetchPollOrThrow(pollId, officeLocationId);
  return formatPoll(poll);
}

export async function getLatestCompletedPoll(officeLocationId?: string): Promise<Poll | null> {
  const resolvedOfficeLocationId = await resolvePollOfficeLocationId(officeLocationId);
  const poll = await prisma.poll.findFirst({
    where: { officeLocationId: resolvedOfficeLocationId, status: 'finished' },
    include: pollInclude,
    orderBy: { createdAt: 'desc' },
  });
  return poll ? formatPoll(poll) : null;
}

/**
 * Creates an instantly-finished poll for a single menu, skipping the voting phase.
 * Used when there is only one menu with items — no broadcast, caller handles SSE.
 */
export async function createAutoFinishedPoll(
  menuId: string,
  menuName: string,
  officeLocationId?: string,
): Promise<Poll> {
  const resolvedOfficeLocationId = await resolvePollOfficeLocationId(officeLocationId);
  await ensureNoPollInProgress(resolvedOfficeLocationId);

  const now = new Date();

  const poll = await prisma.poll.create({
    data: {
      officeLocationId: resolvedOfficeLocationId,
      description: `Auto-selected: ${menuName}`,
      status: 'finished',
      startedAt: now,
      endsAt: now,
      winnerMenuId: menuId,
      winnerMenuName: menuName,
    },
    include: pollInclude,
  });


  return formatPoll(poll);
}

export async function abortPoll(
  pollId: string,
  options: { actorEmail?: string } = {},
  officeLocationId?: string,
): Promise<Poll> {
  const actorEmail = options.actorEmail?.trim().toLowerCase() || null;
  const poll = await fetchPollOrThrow(pollId, officeLocationId);
  if (poll.status !== 'active' && poll.status !== 'tied') {
    throw Object.assign(new Error('Only active or tied polls can be aborted'), { statusCode: 400 });
  }

  // Cancel any running timer
  clearTimer(pollId);

  const updated = await prisma.poll.update({
    where: { id: pollId },
    data: { status: 'aborted' },
    include: pollInclude,
  });
  await writeKillAuditLog(pollId, actorEmail);

  const formatted = formatPoll(updated);
  broadcast('poll_ended', { pollId, status: 'aborted' as const }, poll.officeLocationId);
  return formatted;
}
