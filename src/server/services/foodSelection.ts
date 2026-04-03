import prisma from '../db.js';
import { broadcast, formatFoodSelection } from '../sse.js';
import type {
  FoodSelection,
  FoodOrder,
  FoodSelectionFallbackCandidate,
  PingFallbackCandidateResponse,
} from '../../lib/types.js';
import { isLikelyEmail, sendEmail } from './notificationEmail.js';
import ExcelJS from 'exceljs';
import { ensureDefaultOfficeLocation, validateOfficeLocationId } from './officeLocation.js';

// ─── Timer management ──────────────────────────────────────

const activeTimers = new Map<string, ReturnType<typeof setTimeout>>();
const deliveryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const reminderTimers = new Map<string, ReturnType<typeof setTimeout>>();
const ORGANIZER_FALLBACK_NOTE_PREFIX = 'Default meal placed by organizer';
const MAX_FOOD_ORDER_NOTES_LENGTH = 200;

export function getActiveTimers(): Map<string, ReturnType<typeof setTimeout>> {
  return activeTimers;
}

function scheduleTimer(selectionId: string, endsAt: Date): void {
  clearTimer(selectionId);
  scheduleMissingOrderReminder(selectionId, endsAt);
  const delay = endsAt.getTime() - Date.now();
  if (delay <= 0) {
    void expireFoodSelection(selectionId);
    return;
  }
  const timer = setTimeout(() => {
    activeTimers.delete(selectionId);
    void expireFoodSelection(selectionId);
  }, delay);
  if (typeof timer === 'object' && 'unref' in timer) {
    timer.unref();
  }
  activeTimers.set(selectionId, timer);
}

function scheduleDeliveryTimer(selectionId: string, dueAt: Date): void {
  clearDeliveryTimer(selectionId);
  const delay = dueAt.getTime() - Date.now();
  if (delay <= 0) {
    void markDeliveryDue(selectionId);
    return;
  }
  const timer = setTimeout(() => {
    deliveryTimers.delete(selectionId);
    void markDeliveryDue(selectionId);
  }, delay);
  if (typeof timer === 'object' && 'unref' in timer) {
    timer.unref();
  }
  deliveryTimers.set(selectionId, timer);
}

export function clearTimer(selectionId: string): void {
  const existing = activeTimers.get(selectionId);
  if (existing) {
    clearTimeout(existing);
    activeTimers.delete(selectionId);
  }
  clearReminderTimer(selectionId);
}

export function clearDeliveryTimer(selectionId: string): void {
  const existing = deliveryTimers.get(selectionId);
  if (existing) {
    clearTimeout(existing);
    deliveryTimers.delete(selectionId);
  }
}

export function clearAllTimers(): void {
  for (const [, timer] of activeTimers) {
    clearTimeout(timer);
  }
  activeTimers.clear();
  for (const [, timer] of reminderTimers) {
    clearTimeout(timer);
  }
  reminderTimers.clear();
  for (const [, timer] of deliveryTimers) {
    clearTimeout(timer);
  }
  deliveryTimers.clear();
}

function formatFoodOrderRecord(order: {
  id: string;
  selectionId: string;
  nickname: string;
  itemId: string | null;
  itemName: string;
  notes: string | null;
  feedbackComment: string | null;
  processed: boolean;
  processedAt: Date | null;
  delivered: boolean;
  deliveredAt: Date | null;
  rating: number | null;
  ratedAt: Date | null;
  orderedAt: Date;
}): FoodOrder {
  return {
    id: order.id,
    selectionId: order.selectionId,
    nickname: order.nickname,
    itemId: order.itemId,
    itemName: order.itemName,
    notes: order.notes,
    feedbackComment: order.feedbackComment,
    processed: order.processed,
    processedAt: order.processedAt ? order.processedAt.toISOString() : null,
    delivered: order.delivered,
    deliveredAt: order.deliveredAt ? order.deliveredAt.toISOString() : null,
    rating: order.rating,
    ratedAt: order.ratedAt ? order.ratedAt.toISOString() : null,
    orderedAt: order.orderedAt.toISOString(),
  };
}

function parseReminderLeadMinutes(): number {
  const raw = (process.env.FOOD_SELECTION_REMINDER_MINUTES_BEFORE ?? '').trim();
  if (!raw) return 5;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 120) {
    return 5;
  }
  return parsed;
}

function clearReminderTimer(selectionId: string): void {
  const existing = reminderTimers.get(selectionId);
  if (existing) {
    clearTimeout(existing);
    reminderTimers.delete(selectionId);
  }
}

async function sendMissingOrderReminder(selectionId: string): Promise<number> {
  const selection: ReminderSelection | null = await prisma.foodSelection.findUnique({
    where: { id: selectionId },
    include: {
      orders: true,
      poll: { include: { votes: true } },
    },
  });

  if (!selection || selection.status !== 'active') {
    return 0;
  }

  const orderedBy = new Set(
    selection.orders.map((order: { nickname: string }) => order.nickname.trim().toLowerCase()),
  );
  const voterNicknames: string[] = selection.poll.votes.map((vote: { nickname: string }) =>
    vote.nickname.trim().toLowerCase(),
  );
  const recipients = Array.from(new Set<string>(voterNicknames))
    .filter((nickname) => isLikelyEmail(nickname))
    .filter((nickname) => !orderedBy.has(nickname));

  if (recipients.length === 0) {
    return 0;
  }

  const remainingMinutes = Math.max(1, Math.ceil((selection.endsAt.getTime() - Date.now()) / 60000));
  await Promise.allSettled(
    recipients.map((recipient) =>
      sendEmail({
        to: recipient,
        subject: '[Team Lunch] Meal selection closes soon',
        text: `You voted in the menu poll but have not selected a meal yet. Meal selection for "${selection.menuName}" closes in about ${remainingMinutes} minute(s).`,
      }),
    ),
  );

  return recipients.length;
}

type FallbackEligibleTarget = {
  menuName: string;
  officeLocationId: string;
  preference: {
    itemId: string;
    defaultComment: string | null;
    allowOrganizerFallback: boolean;
    item: {
      id: string;
      name: string;
      itemNumber: string | null;
      menuId: string;
    };
  };
  trimmedTargetNickname: string;
};

export async function sendMissingOrderReminderNow(
  selectionId: string,
  officeLocationId?: string,
): Promise<number> {
  if (officeLocationId) {
    await fetchSelectionOrThrow(selectionId, officeLocationId);
  }
  return sendMissingOrderReminder(selectionId);
}

function scheduleMissingOrderReminder(selectionId: string, endsAt: Date): void {
  clearReminderTimer(selectionId);
  const leadMinutes = parseReminderLeadMinutes();
  const reminderAt = endsAt.getTime() - leadMinutes * 60 * 1000;
  const delay = reminderAt - Date.now();
  if (delay <= 0) {
    return;
  }

  const timer = setTimeout(() => {
    reminderTimers.delete(selectionId);
    void sendMissingOrderReminder(selectionId);
  }, delay);

  if (typeof timer === 'object' && 'unref' in timer) {
    timer.unref();
  }

  reminderTimers.set(selectionId, timer);
}

// ─── Validation helpers ────────────────────────────────────

function validateDuration(durationMinutes: number): void {
  const isValid = durationMinutes === 1 || (
    Number.isInteger(durationMinutes) &&
    durationMinutes >= 5 &&
    durationMinutes <= 30 &&
    durationMinutes % 5 === 0
  );

  if (!isValid) {
    throw Object.assign(
      new Error('Duration must be 1 minute or a multiple of 5 between 5 and 30 minutes'),
      { statusCode: 400 },
    );
  }
}

function validateExtension(extensionMinutes: number): void {
  const allowed = [5, 10, 15];
  if (!allowed.includes(extensionMinutes)) {
    throw Object.assign(
      new Error('Extension must be 5, 10, or 15 minutes'),
      { statusCode: 400 },
    );
  }
}

function validateEtaMinutes(etaMinutes: number): number {
  if (!Number.isInteger(etaMinutes) || etaMinutes < 1 || etaMinutes > 240) {
    throw Object.assign(new Error('ETA must be an integer between 1 and 240 minutes'), {
      statusCode: 400,
    });
  }
  return etaMinutes;
}

function validateRemainingMinutes(remainingMinutes: number): number {
  if (!Number.isInteger(remainingMinutes) || remainingMinutes < 1 || remainingMinutes > 240) {
    throw Object.assign(new Error('Remaining minutes must be an integer between 1 and 240'), {
      statusCode: 400,
    });
  }
  return remainingMinutes;
}

function validateNickname(nickname: string): string {
  const trimmed = nickname.trim();
  if (!trimmed || trimmed.length > 30) {
    throw Object.assign(new Error('Nickname must be 1–30 characters'), { statusCode: 400 });
  }
  return trimmed;
}

function validateOrderPlacedBy(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 255) {
    throw Object.assign(new Error('Order placed by must be 1–255 characters'), { statusCode: 400 });
  }
  return trimmed;
}

function normalizeCreatorKey(createdBy?: string | null): string | null {
  const normalized = createdBy?.trim().toLowerCase() ?? '';
  return normalized.length > 0 ? normalized : null;
}

function buildFallbackOrderNote(
  savedComment: string | null,
  actingNickname: string,
  targetNickname: string,
): string {
  const auditNote =
    actingNickname === targetNickname
      ? ORGANIZER_FALLBACK_NOTE_PREFIX
      : `${ORGANIZER_FALLBACK_NOTE_PREFIX} (${actingNickname})`;

  if (!savedComment) {
    return auditNote;
  }

  const delimiter = ' | ';
  const maxCommentLength = MAX_FOOD_ORDER_NOTES_LENGTH - auditNote.length - delimiter.length;
  if (maxCommentLength <= 0) {
    return auditNote.slice(0, MAX_FOOD_ORDER_NOTES_LENGTH);
  }

  return `${savedComment.slice(0, maxCommentLength)}${delimiter}${auditNote}`;
}

// ─── Fetch helpers ─────────────────────────────────────────

type SelectionWithOrders = NonNullable<
  Awaited<ReturnType<typeof prisma.foodSelection.findUnique>>
> & {
  officeLocationId: string;
  orders: Awaited<ReturnType<typeof prisma.foodOrder.findMany>>;
};

type ReminderSelection = NonNullable<Awaited<ReturnType<typeof prisma.foodSelection.findUnique>>> & {
  orders: Awaited<ReturnType<typeof prisma.foodOrder.findMany>>;
  poll: {
    votes: Awaited<ReturnType<typeof prisma.pollVote.findMany>>;
  };
};

type PreferenceWithItem = NonNullable<
  Awaited<ReturnType<typeof prisma.userMenuDefaultPreference.findUnique>>
> & {
  item: NonNullable<Awaited<ReturnType<typeof prisma.menuItem.findUnique>>>;
};

async function resolveFoodSelectionOfficeLocationId(officeLocationId?: string): Promise<string> {
  if (officeLocationId?.trim()) {
    return (await validateOfficeLocationId(officeLocationId)).id;
  }
  return (await ensureDefaultOfficeLocation()).id;
}

async function fetchSelectionOrThrow(
  selectionId: string,
  officeLocationId?: string,
): Promise<SelectionWithOrders> {
  const resolvedOfficeLocationId = officeLocationId
    ? await resolveFoodSelectionOfficeLocationId(officeLocationId)
    : null;
  const selection = await prisma.foodSelection.findFirst({
    where: {
      id: selectionId,
      ...(resolvedOfficeLocationId ? { officeLocationId: resolvedOfficeLocationId } : {}),
    },
    include: { orders: true },
  });
  if (!selection) {
    throw Object.assign(new Error('Food selection not found'), { statusCode: 404 });
  }
  return selection;
}

function getWinnerVoterNicknames(
  pollVotes: Array<{ menuId: string; nickname: string }>,
  menuId: string | null,
): string[] {
  if (!menuId) {
    return [];
  }

  return [...new Set(
    pollVotes
      .filter((vote) => vote.menuId === menuId)
      .map((vote) => vote.nickname.trim())
      .filter((nickname) => nickname.length > 0),
  )];
}

async function transitionToOrdering(selectionId: string): Promise<FoodSelection> {
  clearTimer(selectionId);
  clearDeliveryTimer(selectionId);

  const updated = await prisma.foodSelection.update({
    where: { id: selectionId },
    data: {
      status: 'ordering',
      orderPlacedAt: null,
      orderPlacedBy: null,
      completedAt: null,
      etaMinutes: null,
      etaSetAt: null,
      deliveryDueAt: null,
    },
    include: { orders: true },
  });

  const formatted = formatFoodSelection(updated);
  broadcast('food_selection_ordering_started', { foodSelection: formatted }, updated.officeLocationId);

  return formatted;
}

function validateRating(rating: number): number {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw Object.assign(new Error('Rating must be an integer between 1 and 5'), {
      statusCode: 400,
    });
  }
  return rating;
}

function normalizeFeedbackComment(input: string | null | undefined): string | null {
  if (input == null) {
    return null;
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > 300) {
    throw Object.assign(new Error('Feedback comment must be 300 characters or fewer'), {
      statusCode: 400,
    });
  }
  return trimmed;
}

async function markDeliveryDue(selectionId: string): Promise<void> {
  const selection = await prisma.foodSelection.findUnique({ where: { id: selectionId } });
  if (!selection) return;
  if (selection.status !== 'delivering') return;

  await prisma.foodSelection.update({
    where: { id: selectionId },
    data: { status: 'delivery_due' },
  });

  broadcast('food_selection_delivery_due', { foodSelectionId: selectionId }, selection.officeLocationId);
}

// ─── Food selection operations ─────────────────────────────

export async function startFoodSelection(
  pollId: string,
  durationMinutes: number,
  officeLocationId?: string,
  createdBy?: string | null,
): Promise<FoodSelection> {
  validateDuration(durationMinutes);
  const resolvedOfficeLocationId = await resolveFoodSelectionOfficeLocationId(officeLocationId);

  // Validate that the poll exists and is finished
  const poll = await prisma.poll.findFirst({
    where: { id: pollId, officeLocationId: resolvedOfficeLocationId },
  });
  if (!poll) {
    throw Object.assign(new Error('Poll not found'), { statusCode: 404 });
  }
  if (poll.status !== 'finished') {
    throw Object.assign(
      new Error('Poll must be finished before starting food selection'),
      { statusCode: 400 },
    );
  }
  if (!poll.winnerMenuId || !poll.winnerMenuName) {
    throw Object.assign(
      new Error('Poll has no winner'),
      { statusCode: 400 },
    );
  }

  // Check for existing non-final food selection
  const existing = await prisma.foodSelection.findFirst({
    where: {
      officeLocationId: resolvedOfficeLocationId,
      status: { in: ['active', 'overtime', 'ordering', 'delivering', 'delivery_due'] },
    },
  });
  if (existing) {
    throw Object.assign(
      new Error('A food selection is already in progress'),
      { statusCode: 409 },
    );
  }

  const now = new Date();
  const endsAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

  const selection = await prisma.foodSelection.create({
    data: {
      officeLocationId: resolvedOfficeLocationId,
      createdBy: normalizeCreatorKey(createdBy ?? poll.createdBy),
      pollId,
      menuId: poll.winnerMenuId,
      menuName: poll.winnerMenuName,
      status: 'active',
      startedAt: now,
      endsAt,
    },
    include: { orders: true },
  });

  const formatted = formatFoodSelection(selection);
  broadcast('food_selection_started', { foodSelection: formatted }, resolvedOfficeLocationId);

  scheduleTimer(selection.id, endsAt);

  return formatted;
}

export async function placeOrder(
  selectionId: string,
  nickname: string,
  itemId: string,
  notes?: string,
  officeLocationId?: string,
): Promise<FoodOrder> {
  const trimmedNick = validateNickname(nickname);

  if (notes !== undefined && notes !== null && notes.length > 200) {
    throw Object.assign(new Error('Notes must be 200 characters or fewer'), { statusCode: 400 });
  }

  const selection = await prisma.foodSelection.findUnique({
    where: { id: selectionId },
  });
  if (!selection) {
    throw Object.assign(new Error('Food selection not found'), { statusCode: 404 });
  }
  if (officeLocationId) {
    const resolvedOfficeLocationId = await resolveFoodSelectionOfficeLocationId(officeLocationId);
    if (selection.officeLocationId !== resolvedOfficeLocationId) {
      throw Object.assign(new Error('Food selection not found'), { statusCode: 404 });
    }
  }
  if (selection.status !== 'active') {
    throw Object.assign(new Error('Food selection is not active'), { statusCode: 400 });
  }
  if (new Date() > selection.endsAt) {
    throw Object.assign(new Error('Food selection has expired'), { statusCode: 400 });
  }

  // Verify item exists and belongs to the winning menu
  const item = await prisma.menuItem.findUnique({ where: { id: itemId } });
  if (!item) {
    throw Object.assign(new Error('Menu item not found'), { statusCode: 404 });
  }
  if (item.menuId !== selection.menuId) {
    throw Object.assign(
      new Error('Item does not belong to the winning menu'),
      { statusCode: 400 },
    );
  }

  const order = await prisma.foodOrder.create({
    data: {
      selectionId,
      nickname: trimmedNick,
      itemId,
      itemName: item.name,
      notes: notes ?? null,
      processed: false,
      processedAt: null,
      delivered: false,
      deliveredAt: null,
    },
  });

  const formatted = formatFoodOrderRecord(order);
  broadcast('order_placed', { order: formatted }, selection.officeLocationId);

  return formatted;
}

export async function withdrawOrder(
  selectionId: string,
  nickname: string,
  orderId?: string,
  officeLocationId?: string,
): Promise<void> {
  const trimmedNick = validateNickname(nickname);

  const selection = await prisma.foodSelection.findUnique({
    where: { id: selectionId },
  });
  if (!selection) {
    throw Object.assign(new Error('Food selection not found'), { statusCode: 404 });
  }
  if (officeLocationId) {
    const resolvedOfficeLocationId = await resolveFoodSelectionOfficeLocationId(officeLocationId);
    if (selection.officeLocationId !== resolvedOfficeLocationId) {
      throw Object.assign(new Error('Food selection not found'), { statusCode: 404 });
    }
  }
  if (selection.status !== 'active') {
    throw Object.assign(new Error('Food selection is not active'), { statusCode: 400 });
  }
  if (new Date() > selection.endsAt) {
    throw Object.assign(new Error('Food selection has expired'), { statusCode: 400 });
  }

  if (orderId) {
    const order = await prisma.foodOrder.findFirst({
      where: { id: orderId, selectionId, nickname: trimmedNick },
    });
    if (!order) {
      throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    }

    await prisma.foodOrder.delete({ where: { id: order.id } });
    broadcast('order_withdrawn', { nickname: trimmedNick, selectionId, orderId }, selection.officeLocationId);
    return;
  }

  const deleted = await prisma.foodOrder.deleteMany({
    where: { selectionId, nickname: trimmedNick },
  });
  if (deleted.count === 0) {
    throw Object.assign(new Error('Order not found'), { statusCode: 404 });
  }

  broadcast('order_withdrawn', { nickname: trimmedNick, selectionId }, selection.officeLocationId);
}

export async function expireFoodSelection(
  selectionId: string,
  officeLocationId?: string,
): Promise<FoodSelection> {
  const selection = await fetchSelectionOrThrow(selectionId, officeLocationId);
  if (selection.status !== 'active') {
    throw Object.assign(new Error('Only active food selections can expire'), { statusCode: 400 });
  }

  clearTimer(selectionId);

  const updated = await prisma.foodSelection.update({
    where: { id: selectionId },
    data: { status: 'overtime' },
    include: { orders: true },
  });

  const formatted = formatFoodSelection(updated);
  broadcast('food_selection_overtime', { foodSelectionId: selectionId }, selection.officeLocationId);

  return formatted;
}

export async function extendFoodSelection(
  selectionId: string,
  extensionMinutes: number,
  officeLocationId?: string,
): Promise<FoodSelection> {
  validateExtension(extensionMinutes);

  const selection = await fetchSelectionOrThrow(selectionId, officeLocationId);
  if (selection.status !== 'overtime') {
    throw Object.assign(
      new Error('Only overtime food selections can be extended'),
      { statusCode: 400 },
    );
  }

  const now = new Date();
  const newEndsAt = new Date(now.getTime() + extensionMinutes * 60 * 1000);

  const updated = await prisma.foodSelection.update({
    where: { id: selectionId },
    data: {
      status: 'active',
      endsAt: newEndsAt,
    },
    include: { orders: true },
  });

  const formatted = formatFoodSelection(updated);
  broadcast('food_selection_extended', {
    foodSelectionId: selectionId,
    newEndsAt: newEndsAt.toISOString(),
  }, selection.officeLocationId);

  scheduleTimer(selectionId, newEndsAt);

  return formatted;
}

export async function updateActiveFoodSelectionTimer(
  selectionId: string,
  remainingMinutes: number,
  officeLocationId?: string,
): Promise<FoodSelection> {
  const validatedRemainingMinutes = validateRemainingMinutes(remainingMinutes);

  const selection = await fetchSelectionOrThrow(selectionId, officeLocationId);
  if (selection.status !== 'active') {
    throw Object.assign(new Error('Only active food selections can update timer'), {
      statusCode: 400,
    });
  }

  const now = new Date();
  const newEndsAt = new Date(now.getTime() + validatedRemainingMinutes * 60 * 1000);

  const updated = await prisma.foodSelection.update({
    where: { id: selectionId },
    data: { endsAt: newEndsAt },
    include: { orders: true },
  });

  scheduleTimer(selectionId, newEndsAt);

  const formatted = formatFoodSelection(updated);
  broadcast('food_selection_extended', {
    foodSelectionId: selectionId,
    newEndsAt: newEndsAt.toISOString(),
  }, selection.officeLocationId);

  return formatted;
}

export async function completeFoodSelection(
  selectionId: string,
  officeLocationId?: string,
): Promise<FoodSelection> {
  const selection = await fetchSelectionOrThrow(selectionId, officeLocationId);
  if (selection.status !== 'overtime') {
    throw Object.assign(
      new Error('Only overtime food selections can be completed'),
      { statusCode: 400 },
    );
  }

  return transitionToOrdering(selectionId);
}

export async function rateOrder(
  selectionId: string,
  orderId: string,
  nickname: string,
  rating: number,
  feedbackComment?: string | null,
  officeLocationId?: string,
): Promise<FoodOrder> {
  const trimmedNick = validateNickname(nickname);
  const validatedRating = validateRating(rating);
  const normalizedFeedbackComment = normalizeFeedbackComment(feedbackComment);

  const selection = await prisma.foodSelection.findUnique({
    where: { id: selectionId },
  });
  if (!selection) {
    throw Object.assign(new Error('Food selection not found'), { statusCode: 404 });
  }
  if (selection.status !== 'completed') {
    throw Object.assign(new Error('Meals can be rated only after delivery confirmation'), {
      statusCode: 400,
    });
  }

  const existingOrder = await prisma.foodOrder.findUnique({
    where: { id: orderId },
  });
  if (!existingOrder || existingOrder.selectionId !== selectionId) {
    throw Object.assign(new Error('Order not found'), { statusCode: 404 });
  }
  if (existingOrder.nickname !== trimmedNick) {
    throw Object.assign(new Error('You can only rate your own meal'), { statusCode: 403 });
  }

  const updated = await prisma.foodOrder.update({
    where: { id: orderId },
    data: {
      rating: validatedRating,
      feedbackComment: normalizedFeedbackComment,
      ratedAt: new Date(),
    },
  });

  const formatted = formatFoodOrderRecord(updated);
  broadcast('order_updated', { order: formatted }, selection.officeLocationId);
  return formatted;
}

export async function setOrderProcessed(
  selectionId: string,
  orderId: string,
  processed: boolean,
  officeLocationId?: string,
): Promise<FoodOrder> {
  if (typeof processed !== 'boolean') {
    throw Object.assign(new Error('Processed flag must be boolean'), { statusCode: 400 });
  }

  const selection = await prisma.foodSelection.findUnique({
    where: { id: selectionId },
  });
  if (!selection) {
    throw Object.assign(new Error('Food selection not found'), { statusCode: 404 });
  }
  if (selection.status !== 'ordering') {
    throw Object.assign(new Error('Orders can be processed only during ordering phase'), {
      statusCode: 400,
    });
  }

  const existingOrder = await prisma.foodOrder.findUnique({ where: { id: orderId } });
  if (!existingOrder || existingOrder.selectionId !== selectionId) {
    throw Object.assign(new Error('Order not found'), { statusCode: 404 });
  }

  const updated = await prisma.foodOrder.update({
    where: { id: orderId },
    data: {
      processed,
      processedAt: processed ? new Date() : null,
    },
  });

  const formatted = formatFoodOrderRecord(updated);
  broadcast('order_updated', { order: formatted }, selection.officeLocationId);
  return formatted;
}

export async function listFallbackOrderCandidates(
  selectionId: string,
  officeLocationId?: string,
): Promise<FoodSelectionFallbackCandidate[]> {
  const resolvedOfficeLocationId = officeLocationId
    ? await resolveFoodSelectionOfficeLocationId(officeLocationId)
    : null;
  const selection = await prisma.foodSelection.findFirst({
    where: {
      id: selectionId,
      ...(resolvedOfficeLocationId ? { officeLocationId: resolvedOfficeLocationId } : {}),
    },
    include: {
      orders: true,
      poll: { include: { votes: true } },
    },
  });
  if (!selection) {
    throw Object.assign(new Error('Food selection not found'), { statusCode: 404 });
  }
  if (officeLocationId) {
    const resolvedOfficeLocationId = await resolveFoodSelectionOfficeLocationId(officeLocationId);
    if (selection.officeLocationId !== resolvedOfficeLocationId) {
      throw Object.assign(new Error('Food selection not found'), { statusCode: 404 });
    }
  }
  if (officeLocationId) {
    const resolvedOfficeLocationId = await resolveFoodSelectionOfficeLocationId(officeLocationId);
    if (selection.officeLocationId !== resolvedOfficeLocationId) {
      throw Object.assign(new Error('Food selection not found'), { statusCode: 404 });
    }
  }
  if (selection.status !== 'ordering') {
    throw Object.assign(new Error('Fallback ordering is available only during ordering phase'), {
      statusCode: 400,
    });
  }
  if (!selection.menuId) {
    return [];
  }

  const votedNicknames = getWinnerVoterNicknames(selection.poll.votes, selection.menuId);
  const orderedNicknames = new Set(
    selection.orders
      .map((order: { nickname: string }) => order.nickname.trim())
      .filter((nickname: string) => nickname.length > 0),
  );

  const preferences: PreferenceWithItem[] = await prisma.userMenuDefaultPreference.findMany({
    where: {
      menuId: selection.menuId,
      userKey: { in: votedNicknames },
      allowOrganizerFallback: true,
    },
    include: {
      item: true,
    },
  });

  return preferences
    .filter((preference: PreferenceWithItem) => !orderedNicknames.has(preference.userKey))
    .filter((preference: PreferenceWithItem) => preference.item.menuId === selection.menuId)
    .map((preference: PreferenceWithItem) => ({
      nickname: preference.userKey,
      itemId: preference.itemId,
      itemName: preference.item.name,
      itemNumber: preference.item.itemNumber,
      defaultComment: preference.defaultComment,
    }))
    .sort(
      (left: FoodSelectionFallbackCandidate, right: FoodSelectionFallbackCandidate) =>
        left.nickname.localeCompare(right.nickname),
    );
}

async function getFallbackEligibleTarget(
  selectionId: string,
  targetNickname: string,
  officeLocationId?: string,
): Promise<FallbackEligibleTarget> {
  const trimmedTargetNickname = validateNickname(targetNickname);
  const resolvedOfficeLocationId = officeLocationId
    ? await resolveFoodSelectionOfficeLocationId(officeLocationId)
    : null;
  const selection = await prisma.foodSelection.findFirst({
    where: {
      id: selectionId,
      ...(resolvedOfficeLocationId ? { officeLocationId: resolvedOfficeLocationId } : {}),
    },
    include: {
      orders: true,
      poll: { include: { votes: true } },
    },
  });
  if (!selection) {
    throw Object.assign(new Error('Food selection not found'), { statusCode: 404 });
  }
  if (selection.status !== 'ordering') {
    throw Object.assign(new Error('Fallback ordering is available only during ordering phase'), {
      statusCode: 400,
    });
  }
  if (!selection.menuId) {
    throw Object.assign(new Error('Food selection has no winning menu'), { statusCode: 400 });
  }

  const votedNicknames = new Set(getWinnerVoterNicknames(selection.poll.votes, selection.menuId));
  if (!votedNicknames.has(trimmedTargetNickname)) {
    throw Object.assign(new Error('User did not vote for the winning menu'), { statusCode: 400 });
  }

  const existingOrder = selection.orders.find(
    (order: { nickname: string }) => order.nickname === trimmedTargetNickname,
  );
  if (existingOrder) {
    throw Object.assign(new Error('User already has an order'), { statusCode: 409 });
  }

  const preference = await prisma.userMenuDefaultPreference.findUnique({
    where: {
      userKey_menuId: {
        userKey: trimmedTargetNickname,
        menuId: selection.menuId,
      },
    },
    include: {
      item: true,
    },
  });
  if (!preference || !preference.allowOrganizerFallback) {
    throw Object.assign(new Error('User has not enabled fallback ordering for this menu'), {
      statusCode: 400,
    });
  }
  if (preference.item.menuId !== selection.menuId) {
    throw Object.assign(new Error('Configured default meal does not belong to the winning menu'), {
      statusCode: 400,
    });
  }

  return {
    menuName: selection.menuName,
    officeLocationId: selection.officeLocationId,
    preference,
    trimmedTargetNickname,
  };
}

export async function placeFallbackOrder(
  selectionId: string,
  targetNickname: string,
  actingNickname: string,
  officeLocationId?: string,
): Promise<FoodOrder> {
  const trimmedActingNickname = validateNickname(actingNickname);
  const { preference, trimmedTargetNickname, officeLocationId: fallbackOfficeLocationId } = await getFallbackEligibleTarget(
    selectionId,
    targetNickname,
    officeLocationId,
  );

  const note = buildFallbackOrderNote(
    preference.defaultComment,
    trimmedActingNickname,
    trimmedTargetNickname,
  );

  const order = await prisma.foodOrder.create({
    data: {
      selectionId,
      nickname: trimmedTargetNickname,
      itemId: preference.itemId,
      itemName: preference.item.name,
      notes: note,
      processed: false,
      processedAt: null,
      delivered: false,
      deliveredAt: null,
    },
  });

  const formatted = formatFoodOrderRecord(order);
  broadcast('order_placed', { order: formatted }, fallbackOfficeLocationId);
  return formatted;
}

export async function sendFallbackCandidateReminder(
  selectionId: string,
  targetNickname: string,
  actingNickname: string,
  officeLocationId?: string,
): Promise<PingFallbackCandidateResponse> {
  const trimmedActingNickname = validateNickname(actingNickname);
  const { preference, trimmedTargetNickname, menuName, officeLocationId: fallbackOfficeLocationId } = await getFallbackEligibleTarget(
    selectionId,
    targetNickname,
    officeLocationId,
  );

  await sendEmail({
    to: trimmedTargetNickname,
    subject: '[Team Lunch] Team lunch is waiting for your order',
    text:
      `${trimmedActingNickname} is waiting for your meal selection for "${menuName}". ` +
      `If you are too busy, they can place your saved default meal ` +
      `${preference.item.itemNumber ? `${preference.item.itemNumber} ` : ''}${preference.item.name} for you.`,
  }).catch(() => false);

  broadcast('food_selection_fallback_pinged', {
    foodSelectionId: selectionId,
    menuName,
    targetNickname: trimmedTargetNickname,
    actorNickname: trimmedActingNickname,
    itemName: preference.item.name,
    itemNumber: preference.item.itemNumber,
  }, fallbackOfficeLocationId);

  return {
    targetNickname: trimmedTargetNickname,
  };
}

export async function setOrderDelivered(
  selectionId: string,
  orderId: string,
  delivered: boolean,
  officeLocationId?: string,
): Promise<FoodOrder> {
  if (typeof delivered !== 'boolean') {
    throw Object.assign(new Error('Delivered flag must be boolean'), { statusCode: 400 });
  }

  const selection = await prisma.foodSelection.findUnique({
    where: { id: selectionId },
  });
  if (!selection) {
    throw Object.assign(new Error('Food selection not found'), { statusCode: 404 });
  }
  if (officeLocationId) {
    const resolvedOfficeLocationId = await resolveFoodSelectionOfficeLocationId(officeLocationId);
    if (selection.officeLocationId !== resolvedOfficeLocationId) {
      throw Object.assign(new Error('Food selection not found'), { statusCode: 404 });
    }
  }
  if (selection.status !== 'delivering' && selection.status !== 'delivery_due') {
    throw Object.assign(new Error('Orders can be checked as delivered only in delivery phase'), {
      statusCode: 400,
    });
  }

  const existingOrder = await prisma.foodOrder.findUnique({ where: { id: orderId } });
  if (!existingOrder || existingOrder.selectionId !== selectionId) {
    throw Object.assign(new Error('Order not found'), { statusCode: 404 });
  }

  const updated = await prisma.foodOrder.update({
    where: { id: orderId },
    data: {
      delivered,
      deliveredAt: delivered ? new Date() : null,
    },
  });

  const formatted = formatFoodOrderRecord(updated);
  broadcast('order_updated', { order: formatted }, selection.officeLocationId);
  return formatted;
}

export async function exportOrdersForUserXlsx(nickname: string): Promise<Buffer> {
  const trimmedNick = validateNickname(nickname);

  const orders = await prisma.foodOrder.findMany({
    where: { nickname: trimmedNick },
    include: {
      selection: true,
      item: true,
    },
    orderBy: [{ orderedAt: 'desc' }],
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Orders');
  sheet.columns = [
    { header: 'Completed Date', key: 'completedDate', width: 20 },
    { header: 'Ordered At', key: 'orderedAt', width: 20 },
    { header: 'Menu', key: 'menuName', width: 24 },
    { header: 'Item Number', key: 'itemNumber', width: 14 },
    { header: 'Meal', key: 'itemName', width: 28 },
    { header: 'Comment', key: 'notes', width: 30 },
    { header: 'Rating', key: 'rating', width: 10 },
    { header: 'Feedback', key: 'feedbackComment', width: 40 },
  ];

  for (const order of orders) {
    sheet.addRow({
      completedDate: order.selection.completedAt ? order.selection.completedAt.toISOString() : '',
      orderedAt: order.orderedAt.toISOString(),
      menuName: order.selection.menuName,
      itemNumber: order.item?.itemNumber ?? '',
      itemName: order.itemName,
      notes: order.notes ?? '',
      rating: order.rating ?? '',
      feedbackComment: order.feedbackComment ?? '',
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function completeFoodSelectionNow(
  selectionId: string,
  officeLocationId?: string,
): Promise<FoodSelection> {
  const selection = await fetchSelectionOrThrow(selectionId, officeLocationId);
  if (selection.status !== 'active') {
    throw Object.assign(
      new Error('Only active food selections can be finished now'),
      { statusCode: 400 },
    );
  }

  return transitionToOrdering(selectionId);
}

export async function claimOrderingResponsibility(
  selectionId: string,
  claimedBy: string,
  officeLocationId?: string,
): Promise<FoodSelection> {
  const validatedClaimedBy = validateOrderPlacedBy(claimedBy);
  const selection = await fetchSelectionOrThrow(selectionId, officeLocationId);

  if (selection.status !== 'ordering') {
    throw Object.assign(new Error('Only ordering food selections can be claimed'), {
      statusCode: 400,
    });
  }

  if (selection.orderPlacedBy && selection.orderPlacedBy !== validatedClaimedBy) {
    throw Object.assign(
      new Error(`Order is already being placed by ${selection.orderPlacedBy}`),
      { statusCode: 409 },
    );
  }

  const updated = await prisma.foodSelection.update({
    where: { id: selectionId },
    data: {
      orderPlacedBy: validatedClaimedBy,
    },
    include: { orders: true },
  });

  const formatted = formatFoodSelection(updated);
  broadcast('food_selection_ordering_claimed', { foodSelection: formatted }, selection.officeLocationId);

  return formatted;
}

export async function placeDeliveryOrder(
  selectionId: string,
  etaMinutes: number,
  placedBy: string,
  officeLocationId?: string,
): Promise<FoodSelection> {
  const validatedEtaMinutes = validateEtaMinutes(etaMinutes);
  const validatedPlacedBy = validateOrderPlacedBy(placedBy);
  const existing = await fetchSelectionOrThrow(selectionId, officeLocationId);

  if (existing.status !== 'ordering') {
    throw Object.assign(new Error('Delivery order can only be placed from ordering phase'), {
      statusCode: 400,
    });
  }
  if (existing.orderPlacedBy && existing.orderPlacedBy !== validatedPlacedBy) {
    throw Object.assign(
      new Error(`Order is already being placed by ${existing.orderPlacedBy}`),
      { statusCode: 409 },
    );
  }

  const now = new Date();
  const dueAt = new Date(now.getTime() + validatedEtaMinutes * 60 * 1000);
  const updateResult = await prisma.foodSelection.updateMany({
    where: { id: selectionId, status: 'ordering' },
    data: {
      status: 'delivering',
      orderPlacedAt: now,
      orderPlacedBy: validatedPlacedBy,
      etaMinutes: validatedEtaMinutes,
      etaSetAt: now,
      deliveryDueAt: dueAt,
    },
  });
  if (updateResult.count === 0) {
    const current = await fetchSelectionOrThrow(selectionId, officeLocationId);
    if (current.status !== 'ordering') {
      throw Object.assign(new Error('Order was already placed by another user'), { statusCode: 409 });
    }
    throw Object.assign(new Error('Could not place delivery order'), { statusCode: 400 });
  }
  const updated = await fetchSelectionOrThrow(selectionId, officeLocationId);

  scheduleDeliveryTimer(selectionId, dueAt);

  const formatted = formatFoodSelection(updated);
  broadcast('food_selection_delivery_started', { foodSelection: formatted }, existing.officeLocationId);

  return formatted;
}

export async function abortFoodSelection(
  selectionId: string,
  officeLocationId?: string,
): Promise<FoodSelection> {
  const selection = await fetchSelectionOrThrow(selectionId, officeLocationId);
  if (
    selection.status !== 'active' &&
    selection.status !== 'overtime' &&
    selection.status !== 'ordering' &&
    selection.status !== 'delivering' &&
    selection.status !== 'delivery_due'
  ) {
    throw Object.assign(
      new Error('Only in-progress food selections can be aborted'),
      { statusCode: 400 },
    );
  }

  clearTimer(selectionId);
  clearDeliveryTimer(selectionId);

  await prisma.$transaction([
    prisma.foodSelection.delete({
      where: { id: selectionId },
    }),
    prisma.poll.update({
      where: { id: selection.pollId },
      data: {
        status: 'aborted',
        winnerMenuId: null,
        winnerMenuName: null,
        winnerSelectedRandomly: false,
      },
    }),
  ]);

  const formatted = formatFoodSelection({
    ...selection,
    status: 'aborted',
    orders: [],
  });
  broadcast('food_selection_aborted', { foodSelectionId: selectionId }, selection.officeLocationId);
  broadcast('poll_ended', { pollId: selection.pollId, status: 'aborted' }, selection.officeLocationId);

  return formatted;
}

export async function getActiveFoodSelection(officeLocationId?: string): Promise<FoodSelection | null> {
  const resolvedOfficeLocationId = await resolveFoodSelectionOfficeLocationId(officeLocationId);
  const selection = await prisma.foodSelection.findFirst({
    where: {
      officeLocationId: resolvedOfficeLocationId,
      status: { in: ['active', 'overtime', 'ordering', 'delivering', 'delivery_due'] },
    },
    include: { orders: true },
    orderBy: { createdAt: 'desc' },
  });
  return selection ? formatFoodSelection(selection) : null;
}

export async function getLatestCompletedFoodSelection(
  officeLocationId?: string,
): Promise<FoodSelection | null> {
  const resolvedOfficeLocationId = await resolveFoodSelectionOfficeLocationId(officeLocationId);
  const selection = await prisma.foodSelection.findFirst({
    where: { officeLocationId: resolvedOfficeLocationId, status: 'completed' },
    include: { orders: true },
    orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
  });
  return selection ? formatFoodSelection(selection) : null;
}

export async function getCompletedFoodSelectionsHistory(
  limit = 5,
  officeLocationId?: string,
): Promise<FoodSelection[]> {
  const resolvedOfficeLocationId = await resolveFoodSelectionOfficeLocationId(officeLocationId);
  const selections = await prisma.foodSelection.findMany({
    where: { officeLocationId: resolvedOfficeLocationId, status: 'completed' },
    include: { orders: true },
    orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  });
  return selections.map(formatFoodSelection);
}

export async function updateCompletedFoodSelectionEta(
  selectionId: string,
  etaMinutes: number,
  officeLocationId?: string,
): Promise<FoodSelection> {
  const validatedEtaMinutes = validateEtaMinutes(etaMinutes);

  const selection = await fetchSelectionOrThrow(selectionId, officeLocationId);

  if (selection.status !== 'delivering' && selection.status !== 'delivery_due') {
    throw Object.assign(
      new Error('ETA can only be updated for ongoing delivery phase'),
      { statusCode: 400 },
    );
  }

  const now = new Date();
  const dueAt = new Date(now.getTime() + validatedEtaMinutes * 60 * 1000);

  const updated = await prisma.foodSelection.update({
    where: { id: selectionId },
    data: {
      status: 'delivering',
      etaMinutes: validatedEtaMinutes,
      etaSetAt: now,
      deliveryDueAt: dueAt,
    },
    include: { orders: true },
  });

  scheduleDeliveryTimer(selectionId, dueAt);

  const formatted = formatFoodSelection(updated);
  broadcast('food_selection_eta_updated', {
    foodSelectionId: selectionId,
    etaMinutes: validatedEtaMinutes,
    etaSetAt: now.toISOString(),
    deliveryDueAt: dueAt.toISOString(),
  }, selection.officeLocationId);

  return formatted;
}

export async function confirmFoodArrival(
  selectionId: string,
  officeLocationId?: string,
): Promise<FoodSelection> {
  const selection = await fetchSelectionOrThrow(selectionId, officeLocationId);

  if (selection.status !== 'delivering' && selection.status !== 'delivery_due') {
    throw Object.assign(
      new Error('Only ongoing delivery phase can be confirmed as arrived'),
      { statusCode: 400 },
    );
  }

  clearDeliveryTimer(selectionId);

  const updated = await prisma.foodSelection.update({
    where: { id: selectionId },
    data: {
      status: 'completed',
      completedAt: new Date(),
    },
    include: { orders: true },
  });

  const formatted = formatFoodSelection(updated);
  broadcast('food_selection_completed', { foodSelection: formatted }, selection.officeLocationId);


  return formatted;
}

