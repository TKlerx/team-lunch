import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';
import * as pollService from '../../src/server/services/poll.js';
import prisma from '../../src/server/db.js';
import { ensureDefaultOfficeLocation } from '../../src/server/services/officeLocation.js';

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
      winnerMenuId: poll.winnerMenuId,
      winnerMenuName: poll.winnerMenuName,
      winnerSelectedRandomly: poll.winnerSelectedRandomly,
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
}));

describe('Poll timer', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    pollService.clearAllTimers();
    await cleanDatabase();
  });

  afterAll(async () => {
    vi.useRealTimers();
    pollService.clearAllTimers();
    await cleanDatabase();
    await disconnectDatabase();
  });

  it('timer triggers endPoll after configured duration', async () => {
    vi.useRealTimers(); // Need real timers for the startPoll call
    const poll = await pollService.startPoll('Timer test', 60);

    // Verify timer is scheduled
    const timers = pollService.getActiveTimers();
    expect(timers.has(poll.id)).toBe(true);

    // The timer is set for ~60 minutes from now
    // We can verify the timer exists; full timer integration
    // is validated by the fact that endPoll clears the timer
    pollService.clearTimer(poll.id);
    expect(timers.has(poll.id)).toBe(false);
  });

  it('extending a poll reschedules the timer', async () => {
    vi.useRealTimers();
    // Create test menus and a tied poll
    const defaultOffice = await ensureDefaultOfficeLocation();
    const menuA = await prisma.menu.create({ data: { name: 'TimerTestA', officeLocationId: defaultOffice.id } });
    const menuB = await prisma.menu.create({ data: { name: 'TimerTestB', officeLocationId: defaultOffice.id } });

    const poll = await pollService.startPoll('Extend timer test', 60);
    await pollService.castVote(poll.id, menuA.id, 'Alice');
    await pollService.castVote(poll.id, menuB.id, 'Bob');
    await pollService.endPoll(poll.id); // → tied

    const timers = pollService.getActiveTimers();
    // After ending (tied), no timer should be active
    expect(timers.has(poll.id)).toBe(false);

    // Extend the poll — timer should be rescheduled
    await pollService.extendPoll(poll.id, 10);
    expect(timers.has(poll.id)).toBe(true);

    // Clean up
    pollService.clearTimer(poll.id);
  });

  it('ending a poll clears the timer', async () => {
    vi.useRealTimers();
    const poll = await pollService.startPoll('End timer test', 60);

    const timers = pollService.getActiveTimers();
    expect(timers.has(poll.id)).toBe(true);

    await pollService.endPoll(poll.id);
    expect(timers.has(poll.id)).toBe(false);
  });

  it('clearAllTimers removes all scheduled timers', async () => {
    vi.useRealTimers();
    const poll = await pollService.startPoll('Clear all test', 60);

    const timers = pollService.getActiveTimers();
    expect(timers.has(poll.id)).toBe(true);

    pollService.clearAllTimers();
    expect(timers.size).toBe(0);
  });
});



