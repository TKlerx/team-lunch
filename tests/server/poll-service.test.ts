import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';
import * as pollService from '../../src/server/services/poll.js';
import * as menuService from '../../src/server/services/menu.js';
import * as authAccessService from '../../src/server/services/authAccess.js';
import * as foodSelectionService from '../../src/server/services/foodSelection.js';
import { createOfficeLocation, ensureDefaultOfficeLocation } from '../../src/server/services/officeLocation.js';
import prisma from '../../src/server/db.js';
import { sendEmail } from '../../src/server/services/notificationEmail.js';

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
      rating: null,
      ratedAt: null,
      orderedAt: o.orderedAt.toISOString(),
    })),
  })),
}));

vi.mock('../../src/server/services/notificationEmail.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
  isLikelyEmail: vi.fn((value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)),
}));

describe('Poll service', () => {
  const hasAuditLogCreate = () =>
    typeof (prisma as unknown as { auditLog?: { create?: unknown } }).auditLog?.create === 'function';

  beforeEach(async () => {
    vi.clearAllMocks();
    pollService.clearAllTimers();
    await cleanDatabase();
  });

  afterAll(async () => {
    pollService.clearAllTimers();
    await cleanDatabase();
    await disconnectDatabase();
  });

  // ─── Helper to create test menus ─────────────────────────

  async function createTestMenus(count = 2) {
    const menus = [];
    for (let i = 0; i < count; i++) {
      const menu = await menuService.createMenu(`Menu ${String.fromCharCode(65 + i)}`);
      menus.push(menu);
    }
    return menus;
  }

  async function createActivePoll(durationMinutes = 5): ReturnType<typeof pollService.startPoll> {
    return pollService.startPoll('Test poll', durationMinutes);
  }

  // ─── Duration validation ─────────────────────────────────

  describe('duration validation', () => {
    it('accepts valid durations (multiples of 5 between 5 and 720)', async () => {
      const poll = await pollService.startPoll('Test', 5);
      expect(poll.status).toBe('active');
    });

    it('accepts 720 minutes (12 hours)', async () => {
      const poll = await pollService.startPoll('Test', 720);
      expect(poll.status).toBe('active');
    });

    it('rejects duration below 5', async () => {
      await expect(pollService.startPoll('Test', 3)).rejects.toThrow(
        'Duration must be a multiple of 5 between 5 and 720 minutes',
      );
    });

    it('rejects duration above 720', async () => {
      await expect(pollService.startPoll('Test', 725)).rejects.toThrow(
        'Duration must be a multiple of 5 between 5 and 720 minutes',
      );
    });

    it('rejects non-multiple of 5', async () => {
      await expect(pollService.startPoll('Test', 7)).rejects.toThrow(
        'Duration must be a multiple of 5 between 5 and 720 minutes',
      );
    });

    it('rejects non-integer duration', async () => {
      await expect(pollService.startPoll('Test', 5.5)).rejects.toThrow(
        'Duration must be a multiple of 5 between 5 and 720 minutes',
      );
    });
  });

  // ─── Description validation ──────────────────────────────

  describe('description validation', () => {
    it('rejects empty description', async () => {
      await expect(pollService.startPoll('', 60)).rejects.toThrow(
        'Description must be 1–120 characters',
      );
    });

    it('rejects whitespace-only description', async () => {
      await expect(pollService.startPoll('   ', 60)).rejects.toThrow(
        'Description must be 1–120 characters',
      );
    });

    it('rejects description over 120 characters', async () => {
      await expect(pollService.startPoll('A'.repeat(121), 60)).rejects.toThrow(
        'Description must be 1–120 characters',
      );
    });

    it('trims whitespace from description', async () => {
      const poll = await pollService.startPoll('  Test poll  ', 60);
      expect(poll.description).toBe('Test poll');
    });
  });

  describe('poll start notifications', () => {
    it('emails approved unblocked registered users when a poll starts', async () => {
      const defaultOffice = await ensureDefaultOfficeLocation();
      await authAccessService.approveUserByAdmin('alice@example.com', defaultOffice.id);
      await authAccessService.approveUserByAdmin('bob@example.com', defaultOffice.id);
      await authAccessService.blockUserByAdmin('bob@example.com', 'admin@example.com');

      await pollService.startPoll('Lunch vote', 60);

      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['alice@example.com'],
          subject: '[Team Lunch] New lunch poll: Lunch vote',
        }),
      );
    });

    it('still creates the poll when notification delivery fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.mocked(sendEmail).mockRejectedValueOnce(new Error('graph unavailable'));
      const defaultOffice = await ensureDefaultOfficeLocation();
      await authAccessService.approveUserByAdmin('alice@example.com', defaultOffice.id);

      const poll = await pollService.startPoll('Lunch vote', 60);

      expect(poll.status).toBe('active');
      consoleErrorSpy.mockRestore();
    });

    it('only emails registered users for the relevant office', async () => {
      const berlin = await createOfficeLocation('Berlin');
      const munich = await createOfficeLocation('Munich');

      await authAccessService.approveUserByAdmin('berlin@example.com', berlin.id);
      await authAccessService.approveUserByAdmin('munich@example.com', munich.id);
      await authAccessService.approveUserByAdmin('admin@example.com', berlin.id);
      await authAccessService.promoteUserByAdmin('admin@example.com');

      await pollService.startPoll('Berlin lunch', 60, undefined, berlin.id);

      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: expect.arrayContaining(['admin@example.com', 'berlin@example.com']),
          subject: '[Team Lunch] New lunch poll: Berlin lunch',
        }),
      );
    });
  });

  describe('office scoping', () => {
    it('allows one active poll per office', async () => {
      const berlin = await createOfficeLocation('Berlin');
      const munich = await createOfficeLocation('Munich');
      await menuService.createMenu('Berlin Menu', berlin.id);
      await menuService.createMenu('Munich Menu', munich.id);

      const berlinPoll = await pollService.startPoll('Berlin lunch', 60, undefined, berlin.id);
      const munichPoll = await pollService.startPoll('Munich lunch', 60, undefined, munich.id);

      expect(berlinPoll.status).toBe('active');
      expect(munichPoll.status).toBe('active');
    });

    it('returns active and latest completed polls only for the requested office', async () => {
      const berlin = await createOfficeLocation('Berlin');
      const munich = await createOfficeLocation('Munich');
      const berlinMenu = await menuService.createMenu('Berlin Menu', berlin.id);
      const munichMenu = await menuService.createMenu('Munich Menu', munich.id);

      const berlinPoll = await pollService.startPoll('Berlin lunch', 60, undefined, berlin.id);
      await pollService.castVote(berlinPoll.id, berlinMenu.id, 'alice@example.com', berlin.id);
      await pollService.endPoll(berlinPoll.id, {}, berlin.id);

      const munichPoll = await pollService.startPoll('Munich lunch', 60, undefined, munich.id);
      await pollService.castVote(munichPoll.id, munichMenu.id, 'bob@example.com', munich.id);

      const berlinActive = await pollService.getActivePoll(berlin.id);
      const munichActive = await pollService.getActivePoll(munich.id);
      const berlinLatest = await pollService.getLatestCompletedPoll(berlin.id);
      const munichLatest = await pollService.getLatestCompletedPoll(munich.id);

      expect(berlinActive).toBeNull();
      expect(munichActive?.id).toBe(munichPoll.id);
      expect(berlinLatest?.id).toBe(berlinPoll.id);
      expect(munichLatest).toBeNull();
    });
  });

  describe('excluded menu justifications', () => {
    it('stores excluded menu reasons on poll creation', async () => {
      const menus = await createTestMenus(2);
      const poll = await pollService.startPoll('Test', 5, [
        { menuId: menus[1].id, reason: 'Temporarily closed' },
      ]);

      expect(poll.excludedMenuJustifications).toEqual([
        {
          menuId: menus[1].id,
          menuName: menus[1].name,
          reason: 'Temporarily closed',
        },
      ]);
    });

    it('rejects excluded menu without justification', async () => {
      const menus = await createTestMenus(2);
      await expect(
        pollService.startPoll('Test', 5, [{ menuId: menus[1].id, reason: '   ' }]),
      ).rejects.toThrow('A justification of 1-240 characters is required for each excluded menu');
    });

    it('rejects vote for an excluded menu', async () => {
      const menus = await createTestMenus(2);
      const poll = await pollService.startPoll('Test', 5, [
        { menuId: menus[1].id, reason: 'Closed today' },
      ]);
      await expect(pollService.castVote(poll.id, menus[1].id, 'Alice')).rejects.toThrow(
        'Menu was excluded from this poll: Closed today',
      );
    });
  });

  // ─── Single active poll enforcement ──────────────────────

  describe('single active poll enforcement', () => {
    it('rejects creating while active poll exists (HTTP 409)', async () => {
      await createActivePoll();
      await expect(pollService.startPoll('Second', 60)).rejects.toThrow(
        'A poll is already in progress',
      );
      try {
        await pollService.startPoll('Second', 60);
      } catch (e: unknown) {
        expect((e as Error & { statusCode: number }).statusCode).toBe(409);
      }
    });

    it('rejects creating while tied poll exists (HTTP 409)', async () => {
      const menus = await createTestMenus(2);
      const poll = await createActivePoll();
      // Cast one vote per menu to create a tie
      await pollService.castVote(poll.id, menus[0].id, 'Alice');
      await pollService.castVote(poll.id, menus[1].id, 'Bob');
      await pollService.endPoll(poll.id);

      // Poll should now be tied
      const activePoll = await pollService.getActivePoll();
      expect(activePoll?.status).toBe('tied');

      await expect(pollService.startPoll('Third', 60)).rejects.toThrow(
        'A poll is already in progress',
      );
    });

    it('allows creating after previous poll is finished', async () => {
      const poll = await createActivePoll();
      await pollService.endPoll(poll.id); // No votes → finished with no winner
      const newPoll = await pollService.startPoll('Second', 60);
      expect(newPoll.status).toBe('active');
    });
  });

  // ─── Vote counting ──────────────────────────────────────

  describe('vote counting', () => {
    it('returns correct vote totals per menu', async () => {
      const menus = await createTestMenus(3);
      const poll = await createActivePoll();

      await pollService.castVote(poll.id, menus[0].id, 'Alice');
      await pollService.castVote(poll.id, menus[0].id, 'Bob');
      await pollService.castVote(poll.id, menus[1].id, 'Charlie');
      const updated = await pollService.castVote(poll.id, menus[2].id, 'Dave');

      expect(updated.voteCounts[menus[0].id]).toBe(2);
      expect(updated.voteCounts[menus[1].id]).toBe(1);
      expect(updated.voteCounts[menus[2].id]).toBe(1);
    });

    it('allows one user to vote for multiple menus', async () => {
      const menus = await createTestMenus(2);
      const poll = await createActivePoll();

      await pollService.castVote(poll.id, menus[0].id, 'Alice');
      const updated = await pollService.castVote(poll.id, menus[1].id, 'Alice');

      expect(updated.voteCounts[menus[0].id]).toBe(1);
      expect(updated.voteCounts[menus[1].id]).toBe(1);
    });

    it('prevents duplicate vote for same menu by same user', async () => {
      const menus = await createTestMenus(1);
      const poll = await createActivePoll();

      await pollService.castVote(poll.id, menus[0].id, 'Alice');
      await expect(
        pollService.castVote(poll.id, menus[0].id, 'Alice'),
      ).rejects.toThrow('You have already voted for this menu');
    });

    it('correctly updates counts after vote withdrawal', async () => {
      const menus = await createTestMenus(2);
      const poll = await createActivePoll();

      await pollService.castVote(poll.id, menus[0].id, 'Alice');
      await pollService.castVote(poll.id, menus[0].id, 'Bob');
      const afterWithdraw = await pollService.withdrawVote(poll.id, menus[0].id, 'Alice');

      expect(afterWithdraw.voteCounts[menus[0].id]).toBe(1);
    });

    it('withdraws all votes for a user across menus', async () => {
      const menus = await createTestMenus(2);
      const poll = await createActivePoll();

      await pollService.castVote(poll.id, menus[0].id, 'Alice');
      await pollService.castVote(poll.id, menus[1].id, 'Alice');
      await pollService.castVote(poll.id, menus[0].id, 'Bob');

      const updated = await pollService.withdrawAllVotes(poll.id, 'Alice');

      expect(updated.voteCounts[menus[0].id]).toBe(1);
      expect(updated.voteCounts[menus[1].id]).toBeUndefined();
      expect(updated.votes.every((v) => v.nickname !== 'Alice')).toBe(true);
    });
  });

  // ─── Winner determination ────────────────────────────────

  describe('winner determination', () => {
    it('stores the normalized poll creator key', async () => {
      const poll = await pollService.startPoll('Creator poll', 60, undefined, undefined, ' Alice@Example.com ');
      expect(poll.createdBy).toBe('alice@example.com');
    });

    it('auto-starts food selection with the creator after a winner is resolved', async () => {
      const previousDefault = process.env.DEFAULT_FOOD_SELECTION_DURATION_MINUTES;
      process.env.DEFAULT_FOOD_SELECTION_DURATION_MINUTES = '30';
      const autoStartSpy = vi.spyOn(foodSelectionService, 'startFoodSelection');
      const menus = await createTestMenus(2);
      const poll = await pollService.startPoll('Lunch vote', 60, undefined, undefined, 'alice@example.com');

      await pollService.castVote(poll.id, menus[0].id, 'Bob');
      await pollService.castVote(poll.id, menus[0].id, 'Charlie');
      await pollService.castVote(poll.id, menus[1].id, 'Dana');

      await pollService.endPoll(poll.id);

      expect(autoStartSpy).toHaveBeenCalledWith(
        poll.id,
        30,
        expect.any(String),
        'alice@example.com',
      );

      autoStartSpy.mockRestore();
      if (previousDefault === undefined) {
        delete process.env.DEFAULT_FOOD_SELECTION_DURATION_MINUTES;
      } else {
        process.env.DEFAULT_FOOD_SELECTION_DURATION_MINUTES = previousDefault;
      }
    });

    it('single highest vote count → status=finished', async () => {
      const menus = await createTestMenus(2);
      const poll = await createActivePoll();

      await pollService.castVote(poll.id, menus[0].id, 'Alice');
      await pollService.castVote(poll.id, menus[0].id, 'Bob');
      await pollService.castVote(poll.id, menus[1].id, 'Charlie');

      const ended = await pollService.endPoll(poll.id);
      expect(ended.status).toBe('finished');
      expect(ended.winnerMenuId).toBe(menus[0].id);
      expect(ended.winnerMenuName).toBe('Menu A');
      expect(ended.winnerSelectedRandomly).toBe(false);
    });

    it('no votes → status=finished with no winner', async () => {
      const poll = await createActivePoll();
      const ended = await pollService.endPoll(poll.id);
      expect(ended.status).toBe('finished');
      expect(ended.winnerMenuId).toBeNull();
    });

    it('marks endedPrematurely=true when manually ended before timer expiry', async () => {
      const poll = await createActivePoll(60);
      const ended = await pollService.endPoll(poll.id);
      expect(ended.status).toBe('finished');
      expect(ended.endedPrematurely).toBe(true);
    });

    it('writes an audit log entry when poll is closed early', async () => {
      const poll = await createActivePoll(60);

      await pollService.endPoll(poll.id, { actorEmail: 'admin@company.com' });

      const logs = await prisma.auditLog.findMany({
        where: { targetType: 'poll', targetId: poll.id, event: 'poll_closed_early' },
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].actorEmail).toBe('admin@company.com');
    });

    it('does not write an audit log entry when poll ends naturally', async () => {
      const poll = await createActivePoll(5);
      await prisma.poll.update({
        where: { id: poll.id },
        data: { endsAt: new Date(Date.now() - 1_000) },
      });

      await pollService.endPoll(poll.id, { allowPremature: false, actorEmail: 'admin@company.com' });

      const logs = await prisma.auditLog.findMany({
        where: { targetType: 'poll', targetId: poll.id, event: 'poll_closed_early' },
      });
      expect(logs).toHaveLength(0);
    });

    it('still finishes poll early when audit log write fails', async () => {
      const poll = await createActivePoll(60);
      const auditSpy = vi
        .spyOn(prisma.auditLog, 'create')
        .mockRejectedValueOnce(new Error('audit write failed'));

      const ended = await pollService.endPoll(poll.id, { actorEmail: 'admin@company.com' });
      expect(ended.status).toBe('finished');
      expect(ended.endedPrematurely).toBe(true);

      const persisted = await prisma.poll.findUniqueOrThrow({ where: { id: poll.id } });
      expect(persisted.status).toBe('finished');
      expect(persisted.endedPrematurely).toBe(true);

      auditSpy.mockRestore();
    });

    it('rejects ending before timer expiry when allowPremature=false', async () => {
      const poll = await createActivePoll(60);
      await expect(
        pollService.endPoll(poll.id, { allowPremature: false }),
      ).rejects.toThrow('Poll cannot be completed before timer expires');
    });
  });

  // ─── Tie detection ──────────────────────────────────────

  describe('tie detection', () => {
    it('two menus share top count → status=tied', async () => {
      const menus = await createTestMenus(2);
      const poll = await createActivePoll();

      await pollService.castVote(poll.id, menus[0].id, 'Alice');
      await pollService.castVote(poll.id, menus[1].id, 'Bob');

      const ended = await pollService.endPoll(poll.id);
      expect(ended.status).toBe('tied');
      expect(ended.winnerMenuId).toBeNull();
    });

    it('three menus share top count → status=tied', async () => {
      const menus = await createTestMenus(3);
      const poll = await createActivePoll();

      await pollService.castVote(poll.id, menus[0].id, 'Alice');
      await pollService.castVote(poll.id, menus[1].id, 'Bob');
      await pollService.castVote(poll.id, menus[2].id, 'Charlie');

      const ended = await pollService.endPoll(poll.id);
      expect(ended.status).toBe('tied');
    });

    it('tie only among top — lower vote menus excluded', async () => {
      const menus = await createTestMenus(3);
      const poll = await createActivePoll();

      // Menus A and B get 2 votes each, Menu C gets 1
      await pollService.castVote(poll.id, menus[0].id, 'Alice');
      await pollService.castVote(poll.id, menus[0].id, 'Bob');
      await pollService.castVote(poll.id, menus[1].id, 'Charlie');
      await pollService.castVote(poll.id, menus[1].id, 'Dave');
      await pollService.castVote(poll.id, menus[2].id, 'Eve');

      const ended = await pollService.endPoll(poll.id);
      expect(ended.status).toBe('tied');
    });
  });

  // ─── Random winner ──────────────────────────────────────

  describe('random winner', () => {
    it('auto-starts food selection after resolving a tie randomly', async () => {
      const previousDefault = process.env.DEFAULT_FOOD_SELECTION_DURATION_MINUTES;
      process.env.DEFAULT_FOOD_SELECTION_DURATION_MINUTES = '30';
      const autoStartSpy = vi.spyOn(foodSelectionService, 'startFoodSelection');
      const menus = await createTestMenus(2);
      const poll = await pollService.startPoll('Tie vote', 60, undefined, undefined, 'creator@example.com');
      await pollService.castVote(poll.id, menus[0].id, 'Alice');
      await pollService.castVote(poll.id, menus[1].id, 'Bob');
      await pollService.endPoll(poll.id);

      await pollService.randomWinner(poll.id);

      expect(autoStartSpy).toHaveBeenCalledWith(
        poll.id,
        30,
        expect.any(String),
        'creator@example.com',
      );

      autoStartSpy.mockRestore();
      if (previousDefault === undefined) {
        delete process.env.DEFAULT_FOOD_SELECTION_DURATION_MINUTES;
      } else {
        process.env.DEFAULT_FOOD_SELECTION_DURATION_MINUTES = previousDefault;
      }
    });

    it('picks only from tied top candidates', async () => {
      const menus = await createTestMenus(3);
      const poll = await createActivePoll();

      // Create a tie between A and B, C has fewer votes
      await pollService.castVote(poll.id, menus[0].id, 'Alice');
      await pollService.castVote(poll.id, menus[0].id, 'Bob');
      await pollService.castVote(poll.id, menus[1].id, 'Charlie');
      await pollService.castVote(poll.id, menus[1].id, 'Dave');
      await pollService.castVote(poll.id, menus[2].id, 'Eve');

      await pollService.endPoll(poll.id); // → tied

      const result = await pollService.randomWinner(poll.id);
      expect(result.status).toBe('finished');
      expect(result.winnerSelectedRandomly).toBe(true);
      // Winner must be one of the tied menus (A or B), not C
      expect([menus[0].id, menus[1].id]).toContain(result.winnerMenuId);
    });

    it('rejects random winner on non-tied poll', async () => {
      const poll = await createActivePoll();
      await expect(pollService.randomWinner(poll.id)).rejects.toThrow(
        'Only tied polls can use random selection',
      );
    });

    it('sets winnerSelectedRandomly to true', async () => {
      const menus = await createTestMenus(2);
      const poll = await createActivePoll();
      await pollService.castVote(poll.id, menus[0].id, 'Alice');
      await pollService.castVote(poll.id, menus[1].id, 'Bob');
      await pollService.endPoll(poll.id); // → tied

      const result = await pollService.randomWinner(poll.id);
      expect(result.winnerSelectedRandomly).toBe(true);
    });
  });

  // ─── Tie extension ──────────────────────────────────────

  describe('tie extension', () => {
    it('sets ends_at = now + extension and returns status=active', async () => {
      const menus = await createTestMenus(2);
      const poll = await createActivePoll();
      await pollService.castVote(poll.id, menus[0].id, 'Alice');
      await pollService.castVote(poll.id, menus[1].id, 'Bob');
      await pollService.endPoll(poll.id); // → tied

      const before = Date.now();
      const extended = await pollService.extendPoll(poll.id, 10);
      const after = Date.now();

      expect(extended.status).toBe('active');
      const endsAtMs = new Date(extended.endsAt).getTime();
      // Should be approximately now + 10 minutes
      expect(endsAtMs).toBeGreaterThanOrEqual(before + 10 * 60 * 1000 - 1000);
      expect(endsAtMs).toBeLessThanOrEqual(after + 10 * 60 * 1000 + 1000);
    });

    it('rejects extension on non-tied poll', async () => {
      const poll = await createActivePoll();
      await expect(pollService.extendPoll(poll.id, 10)).rejects.toThrow(
        'Only tied polls can be extended',
      );
    });

    it('rejects invalid extension values', async () => {
      const menus = await createTestMenus(2);
      const poll = await createActivePoll();
      await pollService.castVote(poll.id, menus[0].id, 'Alice');
      await pollService.castVote(poll.id, menus[1].id, 'Bob');
      await pollService.endPoll(poll.id); // → tied

      await expect(pollService.extendPoll(poll.id, 7)).rejects.toThrow(
        'Extension must be 5, 10, 15, or 30 minutes',
      );
      await expect(pollService.extendPoll(poll.id, 60)).rejects.toThrow(
        'Extension must be 5, 10, 15, or 30 minutes',
      );
    });

    it('accepts all valid extension values (5, 10, 15, 30)', async () => {
      for (const minutes of [5, 10, 15, 30]) {
        await cleanDatabase();
        pollService.clearAllTimers();
        const menus = await createTestMenus(2);
        const poll = await pollService.startPoll(`Test ${minutes}`, 60);
        await pollService.castVote(poll.id, menus[0].id, 'Alice');
        await pollService.castVote(poll.id, menus[1].id, 'Bob');
        await pollService.endPoll(poll.id);
        const extended = await pollService.extendPoll(poll.id, minutes);
        expect(extended.status).toBe('active');
      }
    });
  });

  // ─── Active timer update ───────────────────────────────

  describe('active timer update', () => {
    it('updates active poll ends_at = now + remaining minutes', async () => {
      const poll = await createActivePoll(60);
      const before = Date.now();

      const updated = await pollService.updateActivePollTimer(poll.id, 25);

      const after = Date.now();
      const endsAtMs = new Date(updated.endsAt).getTime();
      expect(endsAtMs).toBeGreaterThanOrEqual(before + 25 * 60 * 1000 - 2000);
      expect(endsAtMs).toBeLessThanOrEqual(after + 25 * 60 * 1000 + 2000);
    });

    it('rejects timer update when poll is not active', async () => {
      const poll = await createActivePoll(60);
      await pollService.endPoll(poll.id);

      await expect(pollService.updateActivePollTimer(poll.id, 10)).rejects.toThrow(
        'Only active polls can update timer',
      );
    });

    it('rejects invalid remaining minutes values', async () => {
      const poll = await createActivePoll(60);

      await expect(pollService.updateActivePollTimer(poll.id, 0)).rejects.toThrow(
        'Remaining minutes must be an integer between 1 and 240',
      );
      await expect(pollService.updateActivePollTimer(poll.id, 241)).rejects.toThrow(
        'Remaining minutes must be an integer between 1 and 240',
      );
    });
  });

  // ─── Vote expiry enforcement ─────────────────────────────

  describe('vote expiry enforcement', () => {
    it('rejects votes after poll expires', async () => {
      const menus = await createTestMenus(1);
      const defaultOffice = await ensureDefaultOfficeLocation();

      // Create a poll that's already expired by manipulating DB directly
      const now = new Date();
      const pastEndsAt = new Date(now.getTime() - 1000);

      const poll = await prisma.poll.create({
        data: {
          officeLocationId: defaultOffice.id,
          description: 'Expired poll',
          status: 'active',
          startedAt: new Date(now.getTime() - 120000),
          endsAt: pastEndsAt,
        },
        include: { votes: true },
      });

      await expect(
        pollService.castVote(poll.id, menus[0].id, 'Alice'),
      ).rejects.toThrow('Poll has expired');
    });

    it('rejects vote withdrawal after poll expires', async () => {
      const menus = await createTestMenus(1);
      const now = new Date();
      const defaultOffice = await ensureDefaultOfficeLocation();

      const poll = await prisma.poll.create({
        data: {
          officeLocationId: defaultOffice.id,
          description: 'Expired poll',
          status: 'active',
          startedAt: new Date(now.getTime() - 120000),
          endsAt: new Date(now.getTime() - 1000),
        },
        include: { votes: true },
      });

      await expect(
        pollService.withdrawVote(poll.id, menus[0].id, 'Alice'),
      ).rejects.toThrow('Poll has expired');
    });
  });

  // Poll persistence (no automatic purge)

  describe('poll persistence', () => {
    it('keeps all polls after finishing more than 5', async () => {
      for (let i = 0; i < 6; i++) {
        const poll = await pollService.startPoll(`Poll ${i + 1}`, 60);
        await pollService.endPoll(poll.id);
      }

      const polls = await prisma.poll.findMany();
      expect(polls).toHaveLength(6);
    });

    it('keeps all polls after random winner resolution too', async () => {
      for (let i = 0; i < 5; i++) {
        const poll = await pollService.startPoll(`Poll ${i}`, 60);
        await pollService.endPoll(poll.id);
      }

      const menus = await createTestMenus(2);
      const poll = await pollService.startPoll('Tie poll', 60);
      await pollService.castVote(poll.id, menus[0].id, 'Alice');
      await pollService.castVote(poll.id, menus[1].id, 'Bob');
      await pollService.endPoll(poll.id);
      await pollService.randomWinner(poll.id);

      const polls = await prisma.poll.findMany();
      expect(polls).toHaveLength(6);
    });
  });

  // ─── getActivePoll / getLatestCompletedPoll ──────────────

  describe('query helpers', () => {
    it('getActivePoll returns active poll', async () => {
      const poll = await createActivePoll();
      const active = await pollService.getActivePoll();
      expect(active?.id).toBe(poll.id);
      expect(active?.status).toBe('active');
    });

    it('getActivePoll returns tied poll', async () => {
      const menus = await createTestMenus(2);
      const poll = await createActivePoll();
      await pollService.castVote(poll.id, menus[0].id, 'Alice');
      await pollService.castVote(poll.id, menus[1].id, 'Bob');
      await pollService.endPoll(poll.id);

      const active = await pollService.getActivePoll();
      expect(active?.status).toBe('tied');
    });

    it('getActivePoll returns null when no active/tied poll', async () => {
      const result = await pollService.getActivePoll();
      expect(result).toBeNull();
    });

    it('getLatestCompletedPoll returns most recent finished poll', async () => {
      const poll1 = await pollService.startPoll('First', 60);
      await pollService.endPoll(poll1.id);

      const poll2 = await pollService.startPoll('Second', 60);
      await pollService.endPoll(poll2.id);

      const latest = await pollService.getLatestCompletedPoll();
      expect(latest?.id).toBe(poll2.id);
    });

    it('getLatestCompletedPoll returns null when no finished poll', async () => {
      const result = await pollService.getLatestCompletedPoll();
      expect(result).toBeNull();
    });
  });

  // ─── Abort poll ──────────────────────────────────────────

  describe('abortPoll', () => {
    it('aborts an active poll', async () => {
      const poll = await createActivePoll();
      const aborted = await pollService.abortPoll(poll.id);
      expect(aborted.status).toBe('aborted');
    });

    it('aborts a tied poll', async () => {
      const menus = await createTestMenus(2);
      const poll = await createActivePoll();
      await pollService.castVote(poll.id, menus[0].id, 'Alice');
      await pollService.castVote(poll.id, menus[1].id, 'Bob');
      await pollService.endPoll(poll.id); // → tied
      const aborted = await pollService.abortPoll(poll.id);
      expect(aborted.status).toBe('aborted');
    });

    it('rejects aborting a finished poll', async () => {
      const poll = await createActivePoll();
      await pollService.endPoll(poll.id); // → finished (0 votes)
      await expect(pollService.abortPoll(poll.id)).rejects.toThrow(
        'Only active or tied polls can be aborted',
      );
    });

    it('rejects aborting a non-existent poll', async () => {
      await expect(
        pollService.abortPoll('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow('Poll not found');
    });

    it('clears the timer on abort', async () => {
      const poll = await createActivePoll();
      expect(pollService.getActiveTimers().has(poll.id)).toBe(true);
      await pollService.abortPoll(poll.id);
      expect(pollService.getActiveTimers().has(poll.id)).toBe(false);
    });

    it('writes an audit log entry when poll is killed', async () => {
      if (!hasAuditLogCreate()) {
        return;
      }

      const poll = await createActivePoll();
      await pollService.abortPoll(poll.id, { actorEmail: 'admin@company.com' });

      const logs = await prisma.auditLog.findMany({
        where: { targetType: 'poll', targetId: poll.id, event: 'poll_killed_by_admin' },
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].actorEmail).toBe('admin@company.com');
    });

    it('still aborts poll when kill audit log write fails', async () => {
      if (!hasAuditLogCreate()) {
        return;
      }

      const poll = await createActivePoll();
      const auditSpy = vi
        .spyOn(prisma.auditLog, 'create')
        .mockRejectedValueOnce(new Error('audit write failed'));

      const aborted = await pollService.abortPoll(poll.id, { actorEmail: 'admin@company.com' });
      expect(aborted.status).toBe('aborted');

      auditSpy.mockRestore();
    });

    it('keeps aborted polls without retention purge', async () => {
      // Create 5 polls and abort them all
      for (let i = 0; i < 5; i++) {
        const p = await pollService.startPoll(`Poll ${i}`, 5);
        await pollService.abortPoll(p.id);
      }
      // Create a 6th → oldest should be purged
      const p6 = await pollService.startPoll('Poll 6', 5);
      await pollService.abortPoll(p6.id);

      const remaining = await prisma.poll.findMany();
      expect(remaining).toHaveLength(6);
    });

    it('allows starting a new poll after aborting', async () => {
      const poll = await createActivePoll();
      await pollService.abortPoll(poll.id);
      const newPoll = await pollService.startPoll('Fresh poll', 5);
      expect(newPoll.status).toBe('active');
    });
  });

  // ─── Auto-finished poll (single menu skip) ──────────────

  describe('createAutoFinishedPoll', () => {
    it('creates a finished poll with the specified menu as winner', async () => {
      const menus = await createTestMenus(1);
      const poll = await pollService.createAutoFinishedPoll(menus[0].id, menus[0].name);

      expect(poll.status).toBe('finished');
      expect(poll.winnerMenuId).toBe(menus[0].id);
      expect(poll.winnerMenuName).toBe(menus[0].name);
      expect(poll.winnerSelectedRandomly).toBe(false);
      expect(poll.votes).toHaveLength(0);
      expect(poll.description).toContain('Auto-selected');
    });

    it('rejects when an active poll exists', async () => {
      await createActivePoll();
      const menus = await createTestMenus(1);
      await expect(
        pollService.createAutoFinishedPoll(menus[0].id, menus[0].name),
      ).rejects.toThrow('A poll is already in progress');
    });

    it('rejects when a tied poll exists', async () => {
      const menus = await createTestMenus(2);
      const poll = await pollService.startPoll('Tied poll', 5);
      await pollService.castVote(poll.id, menus[0].id, 'Alice');
      await pollService.castVote(poll.id, menus[1].id, 'Bob');
      await pollService.endPoll(poll.id);

      // Verify tied
      const tiedPoll = await prisma.poll.findUnique({ where: { id: poll.id } });
      expect(tiedPoll!.status).toBe('tied');

      await expect(
        pollService.createAutoFinishedPoll(menus[0].id, menus[0].name),
      ).rejects.toThrow('A poll is already in progress');
    });

    it('does not purge polls after auto-finished creation', async () => {
      const menus = await createTestMenus(1);
      // Create 5 polls first
      for (let i = 0; i < 5; i++) {
        const p = await pollService.startPoll(`Poll ${i}`, 5);
        await pollService.abortPoll(p.id);
      }

      // Auto-create a 6th → oldest should be purged
      await pollService.createAutoFinishedPoll(menus[0].id, menus[0].name);

      const remaining = await prisma.poll.findMany();
      expect(remaining).toHaveLength(6);
    });

    it('allows starting a new poll after auto-finished poll', async () => {
      const menus = await createTestMenus(1);
      await pollService.createAutoFinishedPoll(menus[0].id, menus[0].name);

      const newPoll = await pollService.startPoll('Fresh poll', 5);
      expect(newPoll.status).toBe('active');
    });
  });
});





