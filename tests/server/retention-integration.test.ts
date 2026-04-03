import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';
import { clearAllTimers as clearPollTimers } from '../../src/server/services/poll.js';
import { clearAllTimers as clearFoodSelectionTimers } from '../../src/server/services/foodSelection.js';
import { ensureDefaultOfficeLocation } from '../../src/server/services/officeLocation.js';
import prisma from '../../src/server/db.js';

describe('Retention rule integration tests', () => {
  beforeEach(async () => {
    clearPollTimers();
    clearFoodSelectionTimers();
    await cleanDatabase();
  });

  afterAll(async () => {
    clearPollTimers();
    clearFoodSelectionTimers();
    await cleanDatabase();
    await disconnectDatabase();
  });

  async function createMenu(name: string) {
    const office = await ensureDefaultOfficeLocation();
    return prisma.menu.create({
      data: {
        officeLocationId: office.id,
        name,
      },
    });
  }

  async function createMenuItem(menuId: string, name: string) {
    return prisma.menuItem.create({
      data: {
        menuId,
        name,
      },
    });
  }

  async function createFinishedPoll(menuId: string, index: number) {
    const office = await ensureDefaultOfficeLocation();
    const menu = await prisma.menu.findUniqueOrThrow({ where: { id: menuId } });
    const now = new Date();

    return prisma.poll.create({
      data: {
        officeLocationId: office.id,
        description: `Poll ${index}`,
        status: 'finished',
        startedAt: new Date(now.getTime() - 60 * 60 * 1000),
        endsAt: new Date(now.getTime() - 30 * 60 * 1000),
        winnerMenuId: menu.id,
        winnerMenuName: menu.name,
        votes: {
          create: {
            menuId: menu.id,
            menuName: menu.name,
            nickname: `Voter${index}`,
          },
        },
      },
    });
  }

  async function createCompletedFoodSelection(pollId: string, durationMinutes = 10) {
    const poll = await prisma.poll.findUniqueOrThrow({ where: { id: pollId } });
    const now = new Date();

    return prisma.foodSelection.create({
      data: {
        officeLocationId: poll.officeLocationId,
        pollId: poll.id,
        menuId: null,
        menuName: poll.winnerMenuName ?? 'Unknown menu',
        status: 'completed',
        startedAt: new Date(now.getTime() - durationMinutes * 60 * 1000),
        endsAt: new Date(now.getTime() - 20 * 60 * 1000),
        orderPlacedAt: new Date(now.getTime() - 15 * 60 * 1000),
        orderPlacedBy: 'buyer@example.com',
        etaMinutes: 20,
        etaSetAt: new Date(now.getTime() - 15 * 60 * 1000),
        deliveryDueAt: new Date(now.getTime() - 5 * 60 * 1000),
        completedAt: new Date(now.getTime() - 1 * 60 * 1000),
      },
    });
  }

  it('keeps all polls after creating 6', async () => {
    const menu = await createMenu('Retention Test Menu');

    for (let i = 1; i <= 6; i++) {
      await createFinishedPoll(menu.id, i);
    }

    const allPolls = await prisma.poll.findMany({
      orderBy: { createdAt: 'desc' },
    });

    expect(allPolls).toHaveLength(6);
    expect(allPolls.map((poll: { description: string }) => poll.description)).toEqual(
      expect.arrayContaining(['Poll 1', 'Poll 2', 'Poll 3', 'Poll 4', 'Poll 5', 'Poll 6']),
    );
  });

  it('keeps all polls after creating 7', async () => {
    const menu = await createMenu('Retention Test Menu 2');

    for (let i = 1; i <= 7; i++) {
      await createFinishedPoll(menu.id, i);
    }

    const allPolls = await prisma.poll.findMany({
      orderBy: { createdAt: 'desc' },
    });

    expect(allPolls).toHaveLength(7);
    expect(allPolls.map((poll: { description: string }) => poll.description)).toEqual(
      expect.arrayContaining(['Poll 1', 'Poll 2', 'Poll 3', 'Poll 4', 'Poll 5', 'Poll 6', 'Poll 7']),
    );
  });

  it('keeps all completed food selections after completing 6', async () => {
    const menu = await createMenu('FS Retention Menu');
    await createMenuItem(menu.id, 'Test Item');

    for (let i = 1; i <= 6; i++) {
      const poll = await createFinishedPoll(menu.id, i);
      await createCompletedFoodSelection(poll.id);
    }

    const completed = await prisma.foodSelection.findMany({
      where: { status: 'completed' },
      orderBy: { createdAt: 'desc' },
    });

    expect(completed).toHaveLength(6);
  });

  it('keeps food selections when older polls are not purged', async () => {
    const menu = await createMenu('Cascade Test Menu');
    await createMenuItem(menu.id, 'Cascade Item');

    for (let i = 1; i <= 6; i++) {
      const poll = await createFinishedPoll(menu.id, i);
      await createCompletedFoodSelection(poll.id);
    }

    const allPolls = await prisma.poll.findMany({
      orderBy: { createdAt: 'desc' },
    });
    expect(allPolls).toHaveLength(6);
    expect(allPolls.map((poll: { description: string }) => poll.description)).toContain('Poll 1');

    const foodSelections = await prisma.foodSelection.findMany();
    expect(foodSelections).toHaveLength(6);
  });
});
