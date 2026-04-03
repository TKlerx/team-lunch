import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';
import * as foodSelectionService from '../../src/server/services/foodSelection.js';
import * as pollService from '../../src/server/services/poll.js';
import * as menuService from '../../src/server/services/menu.js';
import * as userMenuDefaultsService from '../../src/server/services/userMenuDefaults.js';
import { createOfficeLocation } from '../../src/server/services/officeLocation.js';
import prisma from '../../src/server/db.js';

// Suppress SSE broadcasts during tests
vi.mock('../../src/server/sse.js', () => ({
  broadcast: vi.fn(),
  formatPoll: vi.fn((poll) => {
    const voteCounts: Record<string, number> = {};
    for (const vote of poll.votes) {
      voteCounts[vote.menuId] = (voteCounts[vote.menuId] || 0) + 1;
    }
    return {
      id: poll.id,
      description: poll.description,
      status: poll.status,
      startedAt: poll.startedAt.toISOString(),
      endsAt: poll.endsAt.toISOString(),
      endedPrematurely: poll.endedPrematurely,
      winnerMenuId: poll.winnerMenuId,
      winnerMenuName: poll.winnerMenuName,
      winnerSelectedRandomly: poll.winnerSelectedRandomly,
      createdBy: poll.createdBy ?? null,
      createdAt: poll.createdAt.toISOString(),
      excludedMenuJustifications: (poll.excludedMenus ?? []).map((entry: { menuId: string; menuName: string; reason: string }) => ({ menuId: entry.menuId, menuName: entry.menuName, reason: entry.reason })),
      votes: poll.votes.map((v: { id: string; pollId: string; menuId: string; menuName: string; nickname: string; castAt: Date }) => ({
        id: v.id,
        pollId: v.pollId,
        menuId: v.menuId,
        menuName: v.menuName,
        nickname: v.nickname,
        castAt: v.castAt.toISOString(),
      })),
      voteCounts,
    };
  }),
  formatFoodSelection: vi.fn((fs) => ({
    id: fs.id,
    pollId: fs.pollId,
    menuId: fs.menuId,
    menuName: fs.menuName,
    status: fs.status,
    startedAt: fs.startedAt.toISOString(),
    endsAt: fs.endsAt.toISOString(),
    orderPlacedAt: fs.orderPlacedAt ? fs.orderPlacedAt.toISOString() : null,
    orderPlacedBy: fs.orderPlacedBy ?? null,
    completedAt: fs.completedAt ? fs.completedAt.toISOString() : null,
    etaMinutes: fs.etaMinutes,
    etaSetAt: fs.etaSetAt ? fs.etaSetAt.toISOString() : null,
    deliveryDueAt: fs.deliveryDueAt ? fs.deliveryDueAt.toISOString() : null,
    createdBy: fs.createdBy ?? null,
    createdAt: fs.createdAt.toISOString(),
    orders: fs.orders.map((o: { id: string; selectionId: string; nickname: string; itemId: string | null; itemName: string; notes: string | null; orderedAt: Date }) => ({
      id: o.id,
      selectionId: o.selectionId,
      nickname: o.nickname,
      itemId: o.itemId,
      itemName: o.itemName,
      notes: o.notes,
      processed: false,
      processedAt: null,
      delivered: false,
      deliveredAt: null,
      orderedAt: o.orderedAt.toISOString(),
    })),
  })),
}));

describe('Food selection service', () => {
  beforeEach(async () => {
    foodSelectionService.clearAllTimers();
    pollService.clearAllTimers();
    await cleanDatabase();
  });

  afterAll(async () => {
    foodSelectionService.clearAllTimers();
    pollService.clearAllTimers();
    await cleanDatabase();
    await disconnectDatabase();
  });

  // ─── Helpers ─────────────────────────────────────────────

  /** Create a menu with one item, run a poll, vote, end it → finished poll with winner */
  async function createFinishedPollWithWinner() {
    const menu = await menuService.createMenu('Thai Food');
    await menuService.createItem(menu.id, 'Pad Thai', 'Noodles with sauce');

    const poll = await pollService.startPoll('Lunch poll', 60);
    await pollService.castVote(poll.id, menu.id, 'Alice');
    const finished = await pollService.endPoll(poll.id);
    return { menu, poll: finished };
  }

  async function createActiveFoodSelection() {
    const { menu, poll } = await createFinishedPollWithWinner();
    const selection = await foodSelectionService.startFoodSelection(poll.id, 10);
    return { menu, poll, selection };
  }

  async function createFinishedPollWithWinnerInOffice(officeLocationId: string, menuName: string) {
    const menu = await menuService.createMenu(menuName, officeLocationId);
    await menuService.createItem(menu.id, `${menuName} Meal`, 'Office meal', undefined, undefined, officeLocationId);

    const poll = await pollService.startPoll(`${menuName} poll`, 60, undefined, officeLocationId);
    await pollService.castVote(poll.id, menu.id, `${menuName.toLowerCase()}@example.com`, officeLocationId);
    const finished = await pollService.endPoll(poll.id, {}, officeLocationId);
    return { menu, poll: finished };
  }

  // ─── Duration validation ─────────────────────────────────

  describe('duration validation', () => {
    it('accepts 1 minute', async () => {
      const { poll } = await createFinishedPollWithWinner();
      const selection = await foodSelectionService.startFoodSelection(poll.id, 1);
      expect(selection.status).toBe('active');
    });

    it('accepts 5 minutes', async () => {
      const { poll } = await createFinishedPollWithWinner();
      const selection = await foodSelectionService.startFoodSelection(poll.id, 5);
      expect(selection.status).toBe('active');
    });

    it('accepts 10 minutes', async () => {
      const { poll } = await createFinishedPollWithWinner();
      const selection = await foodSelectionService.startFoodSelection(poll.id, 10);
      expect(selection.status).toBe('active');
    });

    it('accepts 15 minutes', async () => {
      const { poll } = await createFinishedPollWithWinner();
      const selection = await foodSelectionService.startFoodSelection(poll.id, 15);
      expect(selection.status).toBe('active');
    });

    it('accepts 30 minutes', async () => {
      const { poll } = await createFinishedPollWithWinner();
      const selection = await foodSelectionService.startFoodSelection(poll.id, 30);
      expect(selection.status).toBe('active');
    });

    it('accepts 20 minutes', async () => {
      const { poll } = await createFinishedPollWithWinner();
      const selection = await foodSelectionService.startFoodSelection(poll.id, 20);
      expect(selection.status).toBe('active');
    });

    it('rejects 3 minutes', async () => {
      const { poll } = await createFinishedPollWithWinner();
      await expect(
        foodSelectionService.startFoodSelection(poll.id, 3),
      ).rejects.toThrow('Duration must be 1 minute or a multiple of 5 between 5 and 30 minutes');
    });

    it('rejects 60 minutes', async () => {
      const { poll } = await createFinishedPollWithWinner();
      await expect(
        foodSelectionService.startFoodSelection(poll.id, 60),
      ).rejects.toThrow('Duration must be 1 minute or a multiple of 5 between 5 and 30 minutes');
    });
  });

  // ─── Starting food selection ─────────────────────────────

  describe('starting food selection', () => {
    it('inherits the poll creator when no explicit food-selection creator is provided', async () => {
      const menu = await menuService.createMenu('Thai Food');
      await menuService.createItem(menu.id, 'Pad Thai', 'Noodles with sauce');
      const poll = await pollService.startPoll('Lunch poll', 60, undefined, undefined, 'creator@example.com');
      await pollService.castVote(poll.id, menu.id, 'Alice');
      const finished = await pollService.endPoll(poll.id);

      const selection = await foodSelectionService.startFoodSelection(finished.id, 10);

      expect(selection.createdBy).toBe('creator@example.com');
    });

    it('stores an explicit normalized food-selection creator key', async () => {
      const { poll } = await createFinishedPollWithWinner();

      const selection = await foodSelectionService.startFoodSelection(
        poll.id,
        10,
        undefined,
        ' Starter@Example.com ',
      );

      expect(selection.createdBy).toBe('starter@example.com');
    });

    it('cannot start if poll is not finished', async () => {
      await menuService.createMenu('Thai Food');
      const poll = await pollService.startPoll('Lunch poll', 60);
      await expect(
        foodSelectionService.startFoodSelection(poll.id, 10),
      ).rejects.toThrow('Poll must be finished before starting food selection');
      // Clean up
      await pollService.endPoll(poll.id);
    });

    it('cannot start if poll does not exist', async () => {
      await expect(
        foodSelectionService.startFoodSelection('00000000-0000-0000-0000-000000000000', 10),
      ).rejects.toThrow('Poll not found');
    });

    it('snapshots menu_id and menu_name from poll winner', async () => {
      const { menu, poll } = await createFinishedPollWithWinner();
      const selection = await foodSelectionService.startFoodSelection(poll.id, 10);
      expect(selection.menuId).toBe(menu.id);
      expect(selection.menuName).toBe('Thai Food');
    });

    it('rejects if a food selection is already active', async () => {
      // Create a finished poll and start a food selection
      await cleanDatabase();
      foodSelectionService.clearAllTimers();
      pollService.clearAllTimers();
      const { poll: poll2 } = await createFinishedPollWithWinner();
      // first food selection
      await foodSelectionService.startFoodSelection(poll2.id, 10);
      // second should fail
      await expect(
        foodSelectionService.startFoodSelection(poll2.id, 15),
      ).rejects.toThrow('A food selection is already in progress');
    });

    it('broadcasts food_selection_started event', async () => {
      const { broadcast } = await import('../../src/server/sse.js');
      const { poll } = await createFinishedPollWithWinner();
      await foodSelectionService.startFoodSelection(poll.id, 10);
      expect(broadcast).toHaveBeenCalledWith(
        'food_selection_started',
        expect.objectContaining({
          foodSelection: expect.objectContaining({ status: 'active' }),
        }),
        expect.any(String),
      );
    });
  });

  // ─── Placing orders ──────────────────────────────────────

  describe('placing orders', () => {
    it('places an order successfully', async () => {
      const { menu, selection } = await createActiveFoodSelection();
      const items = await prisma.menuItem.findMany({ where: { menuId: menu.id } });
      const order = await foodSelectionService.placeOrder(
        selection.id,
        'Alice',
        items[0].id,
        'Extra spicy',
      );
      expect(order.nickname).toBe('Alice');
      expect(order.itemName).toBe('Pad Thai');
      expect(order.notes).toBe('Extra spicy');
    });

    it('allows multiple items for the same nickname', async () => {
      const { menu, selection } = await createActiveFoodSelection();

      // Add a second item to menu for multi-selection
      await menuService.createItem(menu.id, 'Green Curry', 'Spicy curry');
      const allItems = await prisma.menuItem.findMany({ where: { menuId: menu.id } });
      const itemByName = new Map(
        allItems.map((item: { name: string; id: string }) => [item.name, item]),
      );

      const order1 = await foodSelectionService.placeOrder(
        selection.id,
        'Alice',
        (itemByName.get('Pad Thai') as { id: string }).id,
        'No spice',
      );
      const order2 = await foodSelectionService.placeOrder(
        selection.id,
        'Alice',
        (itemByName.get('Green Curry') as { id: string }).id,
        'Extra spicy',
      );

      // Should be different records (one per item)
      expect(order2.id).not.toBe(order1.id);
      expect(order1.itemName).toBe('Pad Thai');
      expect(order2.itemName).toBe('Green Curry');
      expect(order2.notes).toBe('Extra spicy');

      // Two orders should exist for Alice
      const orders = await prisma.foodOrder.findMany({
        where: { selectionId: selection.id, nickname: 'Alice' },
      });
      expect(orders).toHaveLength(2);
    });

    it('re-ordering the same item creates another line item', async () => {
      const { menu, selection } = await createActiveFoodSelection();
      const items = await prisma.menuItem.findMany({ where: { menuId: menu.id } });

      const order1 = await foodSelectionService.placeOrder(selection.id, 'Alice', items[0].id, 'No spice');
      const order2 = await foodSelectionService.placeOrder(selection.id, 'Alice', items[0].id, 'Extra spicy');

      expect(order2.id).not.toBe(order1.id);
      expect(order2.notes).toBe('Extra spicy');

      const orders = await prisma.foodOrder.findMany({
        where: { selectionId: selection.id, nickname: 'Alice' },
      });
      expect(orders).toHaveLength(2);
    });

    it('broadcasts order_placed for new orders', async () => {
      const { broadcast } = await import('../../src/server/sse.js');
      const { menu, selection } = await createActiveFoodSelection();
      const items = await prisma.menuItem.findMany({ where: { menuId: menu.id } });

      await foodSelectionService.placeOrder(selection.id, 'Bob', items[0].id);

      expect(broadcast).toHaveBeenCalledWith(
        'order_placed',
        expect.objectContaining({
          order: expect.objectContaining({ nickname: 'Bob' }),
        }),
        expect.any(String),
      );
    });

    it('broadcasts order_placed when re-ordering the same item', async () => {
      const { broadcast } = await import('../../src/server/sse.js');
      const { menu, selection } = await createActiveFoodSelection();
      const items = await prisma.menuItem.findMany({ where: { menuId: menu.id } });

      // First order
      await foodSelectionService.placeOrder(selection.id, 'Charlie', items[0].id);
      // Second for same item (new line item)
      await foodSelectionService.placeOrder(selection.id, 'Charlie', items[0].id, 'Changed notes');

      expect(broadcast).toHaveBeenCalledWith(
        'order_placed',
        expect.objectContaining({
          order: expect.objectContaining({ nickname: 'Charlie' }),
        }),
        expect.any(String),
      );
    });

    it('rejects order for item not in winning menu', async () => {
      const { selection } = await createActiveFoodSelection();
      // Create a different menu + item
      const otherMenu = await menuService.createMenu('Sushi Place');
      const otherItem = await menuService.createItem(otherMenu.id, 'California Roll');

      await expect(
        foodSelectionService.placeOrder(selection.id, 'Dave', otherItem.id),
      ).rejects.toThrow('Item does not belong to the winning menu');
    });

    it('rejects order if food selection is not active', async () => {
      const { menu, selection } = await createActiveFoodSelection();
      const items = await prisma.menuItem.findMany({ where: { menuId: menu.id } });

      // Expire the selection
      await foodSelectionService.expireFoodSelection(selection.id);

      await expect(
        foodSelectionService.placeOrder(selection.id, 'Eve', items[0].id),
      ).rejects.toThrow('Food selection is not active');
    });

    it('rejects order with invalid nickname', async () => {
      const { menu, selection } = await createActiveFoodSelection();
      const items = await prisma.menuItem.findMany({ where: { menuId: menu.id } });

      await expect(
        foodSelectionService.placeOrder(selection.id, '', items[0].id),
      ).rejects.toThrow('Nickname must be 1–30 characters');
    });

    it('rejects notes over 200 characters', async () => {
      const { menu, selection } = await createActiveFoodSelection();
      const items = await prisma.menuItem.findMany({ where: { menuId: menu.id } });
      const longNotes = 'a'.repeat(201);

      await expect(
        foodSelectionService.placeOrder(selection.id, 'Frank', items[0].id, longNotes),
      ).rejects.toThrow('Notes must be 200 characters or fewer');
    });
  });

  // ─── Withdrawing orders ──────────────────────────────────

  describe('withdrawing orders', () => {
    it('withdraws an order successfully', async () => {
      const { menu, selection } = await createActiveFoodSelection();
      const items = await prisma.menuItem.findMany({ where: { menuId: menu.id } });

      await foodSelectionService.placeOrder(selection.id, 'Alice', items[0].id);
      await foodSelectionService.withdrawOrder(selection.id, 'Alice');

      const orders = await prisma.foodOrder.findMany({
        where: { selectionId: selection.id },
      });
      expect(orders).toHaveLength(0);
    });

    it('withdraws only the targeted line item when orderId is provided', async () => {
      const { menu, selection } = await createActiveFoodSelection();
      await menuService.createItem(menu.id, 'Green Curry', 'Spicy curry');
      const items = await prisma.menuItem.findMany({ where: { menuId: menu.id } });

      const first = await foodSelectionService.placeOrder(selection.id, 'Alice', items[0].id);
      await foodSelectionService.placeOrder(selection.id, 'Alice', items[1].id);

      await foodSelectionService.withdrawOrder(selection.id, 'Alice', first.id);

      const remaining = await prisma.foodOrder.findMany({
        where: { selectionId: selection.id, nickname: 'Alice' },
      });
      expect(remaining).toHaveLength(1);
      expect(remaining[0].itemId).toBe(items[1].id);
    });

    it('broadcasts order_withdrawn with orderId for line-item withdrawal', async () => {
      const { broadcast } = await import('../../src/server/sse.js');
      const { menu, selection } = await createActiveFoodSelection();
      const items = await prisma.menuItem.findMany({ where: { menuId: menu.id } });

      const order = await foodSelectionService.placeOrder(selection.id, 'Alice', items[0].id);
      await foodSelectionService.withdrawOrder(selection.id, 'Alice', order.id);

      expect(broadcast).toHaveBeenCalledWith('order_withdrawn', {
        nickname: 'Alice',
        selectionId: selection.id,
        orderId: order.id,
      }, expect.any(String));
    });

    it('broadcasts order_withdrawn', async () => {
      const { broadcast } = await import('../../src/server/sse.js');
      const { menu, selection } = await createActiveFoodSelection();
      const items = await prisma.menuItem.findMany({ where: { menuId: menu.id } });

      await foodSelectionService.placeOrder(selection.id, 'Alice', items[0].id);
      await foodSelectionService.withdrawOrder(selection.id, 'Alice');

      expect(broadcast).toHaveBeenCalledWith('order_withdrawn', {
        nickname: 'Alice',
        selectionId: selection.id,
      }, expect.any(String));
    });

    it('rejects withdrawal if food selection is not active', async () => {
      const { menu, selection } = await createActiveFoodSelection();
      const items = await prisma.menuItem.findMany({ where: { menuId: menu.id } });

      await foodSelectionService.placeOrder(selection.id, 'Alice', items[0].id);
      await foodSelectionService.expireFoodSelection(selection.id);

      await expect(
        foodSelectionService.withdrawOrder(selection.id, 'Alice'),
      ).rejects.toThrow('Food selection is not active');
    });

    it('rejects withdrawal for nonexistent order', async () => {
      const { selection } = await createActiveFoodSelection();
      await expect(
        foodSelectionService.withdrawOrder(selection.id, 'Nobody'),
      ).rejects.toThrow('Order not found');
    });
  });

  // ─── Expiry ──────────────────────────────────────────────

  describe('expiry', () => {
    it('sets status to overtime', async () => {
      const { selection } = await createActiveFoodSelection();
      const expired = await foodSelectionService.expireFoodSelection(selection.id);
      expect(expired.status).toBe('overtime');
    });

    it('broadcasts food_selection_overtime', async () => {
      const { broadcast } = await import('../../src/server/sse.js');
      const { selection } = await createActiveFoodSelection();
      await foodSelectionService.expireFoodSelection(selection.id);

      expect(broadcast).toHaveBeenCalledWith('food_selection_overtime', {
        foodSelectionId: selection.id,
      }, expect.any(String));
    });

    it('no order changes accepted once status=overtime', async () => {
      const { menu, selection } = await createActiveFoodSelection();
      const items = await prisma.menuItem.findMany({ where: { menuId: menu.id } });

      await foodSelectionService.expireFoodSelection(selection.id);

      await expect(
        foodSelectionService.placeOrder(selection.id, 'Late', items[0].id),
      ).rejects.toThrow('Food selection is not active');
    });
  });

  // ─── Extension ───────────────────────────────────────────

  describe('extension', () => {
    it('accepts 5, 10, and 15 minute extensions', async () => {
      for (const mins of [5, 10, 15]) {
        await cleanDatabase();
        foodSelectionService.clearAllTimers();
        pollService.clearAllTimers();

        const { selection } = await createActiveFoodSelection();
        await foodSelectionService.expireFoodSelection(selection.id);
        const extended = await foodSelectionService.extendFoodSelection(selection.id, mins);
        expect(extended.status).toBe('active');
      }
    });

    it('rejects invalid extension durations', async () => {
      const { selection } = await createActiveFoodSelection();
      await foodSelectionService.expireFoodSelection(selection.id);

      await expect(
        foodSelectionService.extendFoodSelection(selection.id, 20),
      ).rejects.toThrow('Extension must be 5, 10, or 15 minutes');
    });

    it('sets ends_at = now + extension', async () => {
      const { selection } = await createActiveFoodSelection();
      await foodSelectionService.expireFoodSelection(selection.id);

      const before = Date.now();
      const extended = await foodSelectionService.extendFoodSelection(selection.id, 10);
      const after = Date.now();

      const newEndsAt = new Date(extended.endsAt).getTime();
      // Should be roughly now + 10 minutes (within 2 seconds tolerance)
      expect(newEndsAt).toBeGreaterThanOrEqual(before + 10 * 60 * 1000 - 2000);
      expect(newEndsAt).toBeLessThanOrEqual(after + 10 * 60 * 1000 + 2000);
    });

    it('returns status=active after extension', async () => {
      const { selection } = await createActiveFoodSelection();
      await foodSelectionService.expireFoodSelection(selection.id);
      const extended = await foodSelectionService.extendFoodSelection(selection.id, 5);
      expect(extended.status).toBe('active');
    });

    it('broadcasts food_selection_extended', async () => {
      const { broadcast } = await import('../../src/server/sse.js');
      const { selection } = await createActiveFoodSelection();
      await foodSelectionService.expireFoodSelection(selection.id);
      await foodSelectionService.extendFoodSelection(selection.id, 10);

      expect(broadcast).toHaveBeenCalledWith(
        'food_selection_extended',
        expect.objectContaining({
          foodSelectionId: selection.id,
          newEndsAt: expect.any(String),
        }),
        expect.any(String),
      );
    });

    it('only overtime food selections can be extended', async () => {
      const { selection } = await createActiveFoodSelection();
      await expect(
        foodSelectionService.extendFoodSelection(selection.id, 5),
      ).rejects.toThrow('Only overtime food selections can be extended');
    });
  });

  // ─── Active timer update ───────────────────────────────

  describe('active timer update', () => {
    it('updates active selection ends_at = now + remaining minutes', async () => {
      const { selection } = await createActiveFoodSelection();
      const before = Date.now();

      const updated = await foodSelectionService.updateActiveFoodSelectionTimer(selection.id, 20);

      const after = Date.now();
      const endsAtMs = new Date(updated.endsAt).getTime();
      expect(endsAtMs).toBeGreaterThanOrEqual(before + 20 * 60 * 1000 - 2000);
      expect(endsAtMs).toBeLessThanOrEqual(after + 20 * 60 * 1000 + 2000);
    });

    it('rejects timer update when selection is not active', async () => {
      const { selection } = await createActiveFoodSelection();
      await foodSelectionService.expireFoodSelection(selection.id);

      await expect(
        foodSelectionService.updateActiveFoodSelectionTimer(selection.id, 10),
      ).rejects.toThrow('Only active food selections can update timer');
    });

    it('rejects invalid remaining minutes values', async () => {
      const { selection } = await createActiveFoodSelection();

      await expect(
        foodSelectionService.updateActiveFoodSelectionTimer(selection.id, 0),
      ).rejects.toThrow('Remaining minutes must be an integer between 1 and 240');
      await expect(
        foodSelectionService.updateActiveFoodSelectionTimer(selection.id, 241),
      ).rejects.toThrow('Remaining minutes must be an integer between 1 and 240');
    });
  });

  // ─── Completion ──────────────────────────────────────────

  describe('completion', () => {
    it('sets status to ordering', async () => {
      const { selection } = await createActiveFoodSelection();
      await foodSelectionService.expireFoodSelection(selection.id);
      const completed = await foodSelectionService.completeFoodSelection(selection.id);
      expect(completed.status).toBe('ordering');
      expect(completed.etaMinutes).toBeNull();
      expect(completed.etaSetAt).toBeNull();
      expect(completed.deliveryDueAt).toBeNull();
    });

    it('broadcasts food_selection_ordering_started', async () => {
      const { broadcast } = await import('../../src/server/sse.js');
      const { selection } = await createActiveFoodSelection();
      await foodSelectionService.expireFoodSelection(selection.id);
      await foodSelectionService.completeFoodSelection(selection.id);

      expect(broadcast).toHaveBeenCalledWith(
        'food_selection_ordering_started',
        expect.objectContaining({
          foodSelection: expect.objectContaining({ status: 'ordering' }),
        }),
        expect.any(String),
      );
    });

    it('only overtime food selections can be completed', async () => {
      const { selection } = await createActiveFoodSelection();
      await expect(
        foodSelectionService.completeFoodSelection(selection.id),
      ).rejects.toThrow('Only overtime food selections can be completed');
    });

    it('completes active selection via complete-now path', async () => {
      const { selection } = await createActiveFoodSelection();
      const completed = await foodSelectionService.completeFoodSelectionNow(selection.id);
      expect(completed.status).toBe('ordering');
      expect(completed.etaMinutes).toBeNull();
      expect(completed.etaSetAt).toBeNull();
      expect(completed.deliveryDueAt).toBeNull();
    });

    it('does not set completedAt until arrival is confirmed', async () => {
      const { selection } = await createActiveFoodSelection();
      await foodSelectionService.expireFoodSelection(selection.id);
      const completed = await foodSelectionService.completeFoodSelection(selection.id);
      expect(completed.status).toBe('ordering');
      expect(completed.completedAt).toBeNull();
    });

    it('allows a user to claim ordering responsibility before placing the order', async () => {
      const { selection } = await createActiveFoodSelection();
      await foodSelectionService.expireFoodSelection(selection.id);
      await foodSelectionService.completeFoodSelection(selection.id);

      const claimed = await foodSelectionService.claimOrderingResponsibility(
        selection.id,
        'alice@example.com',
      );

      expect(claimed.status).toBe('ordering');
      expect(claimed.orderPlacedBy).toBe('alice@example.com');
      expect(claimed.orderPlacedAt).toBeNull();
    });

    it('broadcasts food_selection_ordering_claimed when a user claims ordering', async () => {
      const { broadcast } = await import('../../src/server/sse.js');
      const { selection } = await createActiveFoodSelection();
      await foodSelectionService.expireFoodSelection(selection.id);
      await foodSelectionService.completeFoodSelection(selection.id);

      await foodSelectionService.claimOrderingResponsibility(selection.id, 'alice@example.com');

      expect(broadcast).toHaveBeenCalledWith(
        'food_selection_ordering_claimed',
        expect.objectContaining({
          foodSelection: expect.objectContaining({
            status: 'ordering',
            orderPlacedBy: 'alice@example.com',
          }),
        }),
        expect.any(String),
      );
    });

    it('aborts in delivery phase, deletes selection/orders, and aborts related poll', async () => {
      const { menu, poll } = await createFinishedPollWithWinner();
      const items = await prisma.menuItem.findMany({ where: { menuId: menu.id } });
      const selection = await foodSelectionService.startFoodSelection(poll.id, 10);
      await foodSelectionService.placeOrder(selection.id, 'Alice', items[0].id, 'No onions');
      await foodSelectionService.expireFoodSelection(selection.id);
      await foodSelectionService.completeFoodSelection(selection.id);

      const aborted = await foodSelectionService.abortFoodSelection(selection.id);

      expect(aborted.status).toBe('aborted');
      expect(aborted.orders).toHaveLength(0);

      const persistedSelection = await prisma.foodSelection.findUnique({ where: { id: selection.id } });
      const persistedOrders = await prisma.foodOrder.findMany({ where: { selectionId: selection.id } });
      const persistedPoll = await prisma.poll.findUnique({ where: { id: poll.id } });

      expect(persistedSelection).toBeNull();
      expect(persistedOrders).toHaveLength(0);
      expect(persistedPoll?.status).toBe('aborted');
      expect(persistedPoll?.winnerMenuId).toBeNull();
      expect(persistedPoll?.winnerMenuName).toBeNull();
    });

    it('places delivery order from ordering phase with ETA', async () => {
      const { selection } = await createActiveFoodSelection();
      await foodSelectionService.expireFoodSelection(selection.id);
      await foodSelectionService.completeFoodSelection(selection.id);

      const placed = await foodSelectionService.placeDeliveryOrder(selection.id, 25, 'admin@example.com');

      expect(placed.status).toBe('delivering');
      expect(placed.orderPlacedAt).toEqual(expect.any(String));
      expect(placed.orderPlacedBy).toBe('admin@example.com');
      expect(placed.etaMinutes).toBe(25);
      expect(placed.etaSetAt).toEqual(expect.any(String));
      expect(placed.deliveryDueAt).toEqual(expect.any(String));
    });

    it('rejects placing delivery order when another user already placed it', async () => {
      const { selection } = await createActiveFoodSelection();
      await foodSelectionService.expireFoodSelection(selection.id);
      await foodSelectionService.completeFoodSelection(selection.id);

      await foodSelectionService.placeDeliveryOrder(selection.id, 20, 'first@example.com');

      await expect(
        foodSelectionService.placeDeliveryOrder(selection.id, 20, 'second@example.com'),
      ).rejects.toThrow('Delivery order can only be placed from ordering phase');
    });

    it('rejects placing delivery order when another user already claimed ordering', async () => {
      const { selection } = await createActiveFoodSelection();
      await foodSelectionService.expireFoodSelection(selection.id);
      await foodSelectionService.completeFoodSelection(selection.id);
      await foodSelectionService.claimOrderingResponsibility(selection.id, 'first@example.com');

      await expect(
        foodSelectionService.placeDeliveryOrder(selection.id, 20, 'second@example.com'),
      ).rejects.toThrow('Order is already being placed by first@example.com');
    });

    it('allows toggling processed checkmark for order lines during ordering', async () => {
      const { menu, selection } = await createActiveFoodSelection();
      const items = await prisma.menuItem.findMany({ where: { menuId: menu.id } });
      const order = await foodSelectionService.placeOrder(selection.id, 'Alice', items[0].id);
      await foodSelectionService.expireFoodSelection(selection.id);
      await foodSelectionService.completeFoodSelection(selection.id);

      const updated = await foodSelectionService.setOrderProcessed(selection.id, order.id, true);

      expect(updated.id).toBe(order.id);
      expect(updated.processed).toBe(true);
      expect(updated.processedAt).toEqual(expect.any(String));
    });

    it('allows toggling delivered checkmark for order lines during delivery phase', async () => {
      const { menu, selection } = await createActiveFoodSelection();
      const items = await prisma.menuItem.findMany({ where: { menuId: menu.id } });
      const order = await foodSelectionService.placeOrder(selection.id, 'Alice', items[0].id);
      await foodSelectionService.expireFoodSelection(selection.id);
      await foodSelectionService.completeFoodSelection(selection.id);
      await foodSelectionService.placeDeliveryOrder(selection.id, 20, 'admin@example.com');

      const updated = await foodSelectionService.setOrderDelivered(selection.id, order.id, true);

      expect(updated.id).toBe(order.id);
      expect(updated.delivered).toBe(true);
      expect(updated.deliveredAt).toEqual(expect.any(String));
    });

    it('lists eligible fallback-order candidates during ordering', async () => {
      const menu = await menuService.createMenu('Fallback Menu');
      await menuService.createItem(menu.id, 'Pad Thai', 'Noodles with sauce');
      const items = await prisma.menuItem.findMany({ where: { menuId: menu.id } });
      const poll = await pollService.startPoll('Fallback poll', 60);
      await pollService.castVote(poll.id, menu.id, 'Alice');
      await pollService.castVote(poll.id, menu.id, 'Dana');
      const finishedPoll = await pollService.endPoll(poll.id);
      const selection = await foodSelectionService.startFoodSelection(finishedPoll.id, 10);
      await userMenuDefaultsService.upsertUserMenuDefaultPreference(
        'Dana',
        menu.id,
        items[0].id,
        null,
        true,
      );
      await foodSelectionService.placeOrder(selection.id, 'Alice', items[0].id);
      await foodSelectionService.expireFoodSelection(selection.id);
      await foodSelectionService.completeFoodSelection(selection.id);

      const candidates = await foodSelectionService.listFallbackOrderCandidates(selection.id);

      expect(candidates).toEqual([
        expect.objectContaining({
          nickname: 'Dana',
          itemId: items[0].id,
          itemName: 'Pad Thai',
        }),
      ]);
    });

    it('places fallback order from a saved default meal during ordering', async () => {
      const menu = await menuService.createMenu('Fallback Menu');
      await menuService.createItem(menu.id, 'Pad Thai', 'Noodles with sauce');
      const items = await prisma.menuItem.findMany({ where: { menuId: menu.id } });
      const poll = await pollService.startPoll('Fallback poll', 60);
      await pollService.castVote(poll.id, menu.id, 'Alice');
      await pollService.castVote(poll.id, menu.id, 'Dana');
      const finishedPoll = await pollService.endPoll(poll.id);
      const selection = await foodSelectionService.startFoodSelection(finishedPoll.id, 10);
      await userMenuDefaultsService.upsertUserMenuDefaultPreference(
        'Dana',
        menu.id,
        items[0].id,
        'Extra spicy',
        true,
      );
      await foodSelectionService.expireFoodSelection(selection.id);
      await foodSelectionService.completeFoodSelection(selection.id);

      const order = await foodSelectionService.placeFallbackOrder(
        selection.id,
        'Dana',
        'Organizer',
      );

      expect(order.nickname).toBe('Dana');
      expect(order.itemId).toBe(items[0].id);
      expect(order.itemName).toBe('Pad Thai');
      expect(order.notes).toContain('Extra spicy');
      expect(order.notes).toContain('Default meal placed by organizer');
      expect(order.notes).toContain('Organizer');
    });

    it('rejects fallback order when user already has an order', async () => {
      const menu = await menuService.createMenu('Fallback Menu');
      await menuService.createItem(menu.id, 'Pad Thai', 'Noodles with sauce');
      const items = await prisma.menuItem.findMany({ where: { menuId: menu.id } });
      const poll = await pollService.startPoll('Fallback poll', 60);
      await pollService.castVote(poll.id, menu.id, 'Alice');
      await pollService.castVote(poll.id, menu.id, 'Dana');
      const finishedPoll = await pollService.endPoll(poll.id);
      const selection = await foodSelectionService.startFoodSelection(finishedPoll.id, 10);
      await userMenuDefaultsService.upsertUserMenuDefaultPreference(
        'Dana',
        menu.id,
        items[0].id,
        null,
        true,
      );
      await foodSelectionService.placeOrder(selection.id, 'Dana', items[0].id);
      await foodSelectionService.expireFoodSelection(selection.id);
      await foodSelectionService.completeFoodSelection(selection.id);

      await expect(
        foodSelectionService.placeFallbackOrder(selection.id, 'Dana', 'Organizer'),
      ).rejects.toThrow('User already has an order');
    });
  });

  describe('office scoping', () => {
    it('allows one active food selection per office', async () => {
      const berlin = await createOfficeLocation('Berlin');
      const munich = await createOfficeLocation('Munich');

      const { poll: berlinPoll } = await createFinishedPollWithWinnerInOffice(berlin.id, 'Berlin');
      const { poll: munichPoll } = await createFinishedPollWithWinnerInOffice(munich.id, 'Munich');

      const berlinSelection = await foodSelectionService.startFoodSelection(berlinPoll.id, 10, berlin.id);
      const munichSelection = await foodSelectionService.startFoodSelection(munichPoll.id, 10, munich.id);

      expect(berlinSelection.status).toBe('active');
      expect(munichSelection.status).toBe('active');
    });

    it('returns active and completed history only for the requested office', async () => {
      const berlin = await createOfficeLocation('Berlin');
      const munich = await createOfficeLocation('Munich');

      const { poll: berlinPoll } = await createFinishedPollWithWinnerInOffice(berlin.id, 'Berlin');
      const { poll: munichPoll } = await createFinishedPollWithWinnerInOffice(munich.id, 'Munich');

      const berlinSelection = await foodSelectionService.startFoodSelection(berlinPoll.id, 10, berlin.id);
      const munichSelection = await foodSelectionService.startFoodSelection(munichPoll.id, 10, munich.id);

      await foodSelectionService.expireFoodSelection(berlinSelection.id, berlin.id);
      await foodSelectionService.completeFoodSelection(berlinSelection.id, berlin.id);
      await foodSelectionService.placeDeliveryOrder(berlinSelection.id, 15, 'alice@example.com', berlin.id);
      await foodSelectionService.confirmFoodArrival(berlinSelection.id, berlin.id);

      const berlinActive = await foodSelectionService.getActiveFoodSelection(berlin.id);
      const munichActive = await foodSelectionService.getActiveFoodSelection(munich.id);
      const berlinHistory = await foodSelectionService.getCompletedFoodSelectionsHistory(5, berlin.id);
      const munichHistory = await foodSelectionService.getCompletedFoodSelectionsHistory(5, munich.id);

      expect(berlinActive).toBeNull();
      expect(munichActive?.id).toBe(munichSelection.id);
      expect(berlinHistory).toHaveLength(1);
      expect(berlinHistory[0]?.id).toBe(berlinSelection.id);
      expect(munichHistory).toHaveLength(0);
    });
  });

  // ─── ETA updates ────────────────────────────────────────

  describe('eta updates', () => {
    it('updates ETA for an ongoing delivery selection', async () => {
      const { selection } = await createActiveFoodSelection();
      await foodSelectionService.expireFoodSelection(selection.id);
      await foodSelectionService.completeFoodSelection(selection.id);
      await foodSelectionService.placeDeliveryOrder(selection.id, 20, 'admin@example.com');

      const updated = await foodSelectionService.updateCompletedFoodSelectionEta(
        selection.id,
        25,
      );

      expect(updated.status).toBe('delivering');
      expect(updated.etaMinutes).toBe(25);
      expect(updated.deliveryDueAt).toEqual(expect.any(String));
    });

    it('rejects invalid ETA minutes', async () => {
      const { selection } = await createActiveFoodSelection();
      await foodSelectionService.expireFoodSelection(selection.id);
      await foodSelectionService.completeFoodSelection(selection.id);
      await foodSelectionService.placeDeliveryOrder(selection.id, 20, 'admin@example.com');

      await expect(
        foodSelectionService.updateCompletedFoodSelectionEta(selection.id, 0),
      ).rejects.toThrow('ETA must be an integer between 1 and 240 minutes');
    });

    it('rejects ETA updates when delivery phase is not active', async () => {
      const { selection } = await createActiveFoodSelection();
      await expect(
        foodSelectionService.updateCompletedFoodSelectionEta(selection.id, 12),
      ).rejects.toThrow('ETA can only be updated for ongoing delivery phase');
    });

    it('broadcasts food_selection_eta_updated', async () => {
      const { broadcast } = await import('../../src/server/sse.js');
      const { selection } = await createActiveFoodSelection();
      await foodSelectionService.expireFoodSelection(selection.id);
      await foodSelectionService.completeFoodSelection(selection.id);
      await foodSelectionService.placeDeliveryOrder(selection.id, 20, 'admin@example.com');

      await foodSelectionService.updateCompletedFoodSelectionEta(selection.id, 30);

      expect(broadcast).toHaveBeenCalledWith('food_selection_eta_updated', {
        foodSelectionId: selection.id,
        etaMinutes: 30,
        etaSetAt: expect.any(String),
        deliveryDueAt: expect.any(String),
      }, expect.any(String));
    });
  });

  // Food selection persistence (no automatic purge)

  describe('food-selection persistence', () => {
    it('keeps all completed food selections beyond 5', async () => {
      const selectionIds: string[] = [];

      for (let i = 0; i < 6; i++) {
        const menu = await menuService.createMenu(`Retention Menu ${i}`);
        await menuService.createItem(menu.id, `Retention Item ${i}`);
        const poll = await pollService.startPoll(`Retention Poll ${i}`, 60);
        await pollService.castVote(poll.id, menu.id, 'Voter');
        await pollService.endPoll(poll.id);

        const sel = await foodSelectionService.startFoodSelection(poll.id, 10);
        await foodSelectionService.expireFoodSelection(sel.id);
        await foodSelectionService.completeFoodSelection(sel.id);
        await foodSelectionService.placeDeliveryOrder(sel.id, 20, 'admin@example.com');
        await foodSelectionService.confirmFoodArrival(sel.id);
        selectionIds.push(sel.id);
      }

      const completed = await prisma.foodSelection.findMany({
        where: { status: 'completed' },
        orderBy: { createdAt: 'desc' },
      });

      expect(completed).toHaveLength(6);
      const completedIds = completed.map((r: { id: string }) => r.id);
      expect(completedIds).toContain(selectionIds[0]);
    }, 15_000);
  });

  // ─── Query helpers ───────────────────────────────────────

  describe('query helpers', () => {
    it('getActiveFoodSelection returns active selection', async () => {
      const { selection } = await createActiveFoodSelection();
      const active = await foodSelectionService.getActiveFoodSelection();
      expect(active).not.toBeNull();
      expect(active!.id).toBe(selection.id);
    });

    it('getActiveFoodSelection returns overtime selection', async () => {
      const { selection } = await createActiveFoodSelection();
      await foodSelectionService.expireFoodSelection(selection.id);
      const active = await foodSelectionService.getActiveFoodSelection();
      expect(active).not.toBeNull();
      expect(active!.status).toBe('overtime');
    });

    it('getActiveFoodSelection returns null when none active', async () => {
      const active = await foodSelectionService.getActiveFoodSelection();
      expect(active).toBeNull();
    });

    it('getLatestCompletedFoodSelection returns completed selection', async () => {
      const { menu, selection } = await createActiveFoodSelection();
      const items = await prisma.menuItem.findMany({ where: { menuId: menu.id } });
      await foodSelectionService.placeOrder(selection.id, 'Alice', items[0].id);
      await foodSelectionService.expireFoodSelection(selection.id);
      await foodSelectionService.completeFoodSelection(selection.id);
      await foodSelectionService.placeDeliveryOrder(selection.id, 20, 'admin@example.com');
      await foodSelectionService.confirmFoodArrival(selection.id);

      const completed = await foodSelectionService.getLatestCompletedFoodSelection();
      expect(completed).not.toBeNull();
      expect(completed!.status).toBe('completed');
      expect(completed!.orders).toHaveLength(1);
    });

    it('getLatestCompletedFoodSelection returns null when none completed', async () => {
      const completed = await foodSelectionService.getLatestCompletedFoodSelection();
      expect(completed).toBeNull();
    });

    it('getCompletedFoodSelectionsHistory returns most recent first', async () => {
      const first = await createActiveFoodSelection();
      await foodSelectionService.expireFoodSelection(first.selection.id);
      await foodSelectionService.completeFoodSelection(first.selection.id);
      await foodSelectionService.placeDeliveryOrder(first.selection.id, 20, 'admin@example.com');
      await foodSelectionService.confirmFoodArrival(first.selection.id);

      const secondMenu = await menuService.createMenu('History Menu 2');
      await menuService.createItem(secondMenu.id, 'History Item 2');
      const secondPoll = await pollService.startPoll('History Poll 2', 60);
      await pollService.castVote(secondPoll.id, secondMenu.id, 'Bob');
      await pollService.endPoll(secondPoll.id);
      const secondSelection = await foodSelectionService.startFoodSelection(secondPoll.id, 10);
      await foodSelectionService.expireFoodSelection(secondSelection.id);
      await foodSelectionService.completeFoodSelection(secondSelection.id);
      await foodSelectionService.placeDeliveryOrder(secondSelection.id, 20, 'admin@example.com');
      await foodSelectionService.confirmFoodArrival(secondSelection.id);

      const history = await foodSelectionService.getCompletedFoodSelectionsHistory();
      expect(history).toHaveLength(2);
      expect(history[0].id).toBe(secondSelection.id);
      expect(history[1].id).toBe(first.selection.id);
    });
  });
});



