import type { ServerResponse } from 'node:http';
import prisma from './db.js';
import type { InitialStatePayload, Poll, PollVote, FoodSelection, FoodOrder } from '../lib/types.js';
import { getOfficeDefaultFoodSelectionDurationMinutes } from './services/officeLocation.js';

const clients = new Map<ServerResponse, string>();

/** Register a new SSE client connection */
export function register(res: ServerResponse, officeLocationId: string): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  // Send a comment to establish the connection
  res.write(':ok\n\n');

  clients.set(res, officeLocationId);

  res.on('close', () => {
    clients.delete(res);
  });
}

/** Broadcast a named event to all connected SSE clients */
export function broadcast(eventName: string, payload: unknown, officeLocationId?: string): void {
  const data = JSON.stringify(payload);
  const message = `event: ${eventName}\ndata: ${data}\n\n`;

  for (const [client, clientOfficeLocationId] of clients) {
    if (officeLocationId && clientOfficeLocationId !== officeLocationId) {
      continue;
    }
    if (!client.writableEnded) {
      client.write(message);
    } else {
      clients.delete(client);
    }
  }
}

/** Get number of connected clients (useful for testing) */
export function getClientCount(): number {
  return clients.size;
}

// ─── Helpers to format DB models into API shapes ───────────

function formatPoll(poll: {
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
        nickname: v.nickname,
        castAt: v.castAt.toISOString(),
      }),
    ),
    voteCounts,
  };
}

function formatFoodSelection(fs: {
  id: string;
  createdBy: string | null;
  pollId: string;
  menuId: string | null;
  menuName: string;
  status: string;
  startedAt: Date;
  endsAt: Date;
  orderPlacedAt: Date | null;
  orderPlacedBy: string | null;
  completedAt: Date | null;
  etaMinutes: number | null;
  etaSetAt: Date | null;
  deliveryDueAt: Date | null;
  createdAt: Date;
  orders: Array<{
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
  }>;
}): FoodSelection {
  return {
    id: fs.id,
    createdBy: fs.createdBy,
    pollId: fs.pollId,
    menuId: fs.menuId,
    menuName: fs.menuName,
    status: fs.status as FoodSelection['status'],
    startedAt: fs.startedAt.toISOString(),
    endsAt: fs.endsAt.toISOString(),
    orderPlacedAt: fs.orderPlacedAt ? fs.orderPlacedAt.toISOString() : null,
    orderPlacedBy: fs.orderPlacedBy,
    completedAt: fs.completedAt ? fs.completedAt.toISOString() : null,
    etaMinutes: fs.etaMinutes,
    etaSetAt: fs.etaSetAt ? fs.etaSetAt.toISOString() : null,
    deliveryDueAt: fs.deliveryDueAt ? fs.deliveryDueAt.toISOString() : null,
    createdAt: fs.createdAt.toISOString(),
    orders: fs.orders.map(
      (o): FoodOrder => ({
        id: o.id,
        selectionId: o.selectionId,
        nickname: o.nickname,
        itemId: o.itemId,
        itemName: o.itemName,
        notes: o.notes,
        feedbackComment: o.feedbackComment,
        processed: o.processed,
        processedAt: o.processedAt ? o.processedAt.toISOString() : null,
        delivered: o.delivered,
        deliveredAt: o.deliveredAt ? o.deliveredAt.toISOString() : null,
        rating: o.rating,
        ratedAt: o.ratedAt ? o.ratedAt.toISOString() : null,
        orderedAt: o.orderedAt.toISOString(),
      }),
    ),
  };
}

/** Send initial_state event to a single newly-connected client */
export async function sendInitialState(res: ServerResponse, officeLocationId: string): Promise<void> {
  try {
    // Query active/tied poll
    const activePollRaw = await prisma.poll.findFirst({
      where: { officeLocationId, status: { in: ['active', 'tied'] } },
      include: { votes: true, excludedMenus: true },
      orderBy: { createdAt: 'desc' },
    });

    // Query active/overtime food selection
    const activeFoodSelectionRaw = await prisma.foodSelection.findFirst({
      where: {
        officeLocationId,
        status: { in: ['active', 'overtime', 'ordering', 'delivering', 'delivery_due'] },
      },
      include: { orders: true },
      orderBy: { createdAt: 'desc' },
    });

    // Latest completed poll
    const latestCompletedPollRaw = await prisma.poll.findFirst({
      where: { officeLocationId, status: 'finished' },
      include: { votes: true, excludedMenus: true },
      orderBy: { createdAt: 'desc' },
    });

    // Latest completed food selection
    const latestCompletedFoodSelectionRaw = await prisma.foodSelection.findFirst({
      where: { officeLocationId, status: 'completed' },
      include: { orders: true },
      orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
    });

    const completedFoodSelectionsHistoryRaw = await prisma.foodSelection.findMany({
      where: { officeLocationId, status: 'completed' },
      include: { orders: true },
      orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
    });
    const defaultFoodSelectionDurationMinutes =
      await getOfficeDefaultFoodSelectionDurationMinutes(officeLocationId);

    const payload: InitialStatePayload = {
      activePoll: activePollRaw ? formatPoll(activePollRaw) : null,
      activeFoodSelection: activeFoodSelectionRaw ? formatFoodSelection(activeFoodSelectionRaw) : null,
      latestCompletedPoll: latestCompletedPollRaw ? formatPoll(latestCompletedPollRaw) : null,
      latestCompletedFoodSelection: latestCompletedFoodSelectionRaw
        ? formatFoodSelection(latestCompletedFoodSelectionRaw)
        : null,
      completedFoodSelectionsHistory: completedFoodSelectionsHistoryRaw.map(formatFoodSelection),
      defaultFoodSelectionDurationMinutes,
    };

    const data = JSON.stringify(payload);
    res.write(`event: initial_state\ndata: ${data}\n\n`);
  } catch {
    const fallbackPayload: InitialStatePayload = {
      activePoll: null,
      activeFoodSelection: null,
      latestCompletedPoll: null,
      latestCompletedFoodSelection: null,
      completedFoodSelectionsHistory: [],
      defaultFoodSelectionDurationMinutes: 30,
    };

    res.write(`event: initial_state\ndata: ${JSON.stringify(fallbackPayload)}\n\n`);
  }
}

// Export formatters for reuse in services
export { formatPoll, formatFoodSelection };
