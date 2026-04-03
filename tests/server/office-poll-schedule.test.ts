import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../../src/server/db.js';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';
import {
  createOfficeLocation,
  updateOfficeLocationSettings,
} from '../../src/server/services/officeLocation.js';
import { runOfficePollScheduleCheck } from '../../src/server/services/officePollSchedule.js';

describe('office poll scheduler', () => {
  beforeEach(async () => {
    await cleanDatabase();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectDatabase();
  });

  it('auto-starts a scheduled poll within the office window', async () => {
    const office = await createOfficeLocation('Berlin');
    await updateOfficeLocationSettings(office.id, {
      autoStartPollEnabled: true,
      autoStartPollWeekdays: ['wednesday'],
      autoStartPollFinishTime: '11:30',
      defaultFoodSelectionDurationMinutes: 20,
    });

    const now = new Date(2026, 2, 11, 10, 40, 0, 0);
    await runOfficePollScheduleCheck(now);

    const poll = await prisma.poll.findFirst({
      where: { officeLocationId: office.id },
    });

    expect(poll).toBeTruthy();
    expect(poll?.description).toBe('Scheduled lunch poll');
    expect(poll?.createdBy).toBe(`office-scheduler:${office.id}:2026-03-11`);
    expect(Math.round((poll!.endsAt.getTime() - poll!.startedAt.getTime()) / 60_000)).toBe(50);
  });

  it('does not create a duplicate scheduled poll for the same office and date', async () => {
    const office = await createOfficeLocation('Munich');
    await updateOfficeLocationSettings(office.id, {
      autoStartPollEnabled: true,
      autoStartPollWeekdays: ['wednesday'],
      autoStartPollFinishTime: '11:30',
      defaultFoodSelectionDurationMinutes: 15,
    });

    const now = new Date(2026, 2, 11, 10, 45, 0, 0);
    await runOfficePollScheduleCheck(now);
    await runOfficePollScheduleCheck(new Date(2026, 2, 11, 10, 50, 0, 0));

    const pollCount = await prisma.poll.count({
      where: { officeLocationId: office.id },
    });

    expect(pollCount).toBe(1);
  });

  it('skips auto-start when lunch activity already exists in that office for the day', async () => {
    const office = await createOfficeLocation('Zurich');
    await updateOfficeLocationSettings(office.id, {
      autoStartPollEnabled: true,
      autoStartPollWeekdays: ['wednesday'],
      autoStartPollFinishTime: '11:30',
      defaultFoodSelectionDurationMinutes: 30,
    });

    await prisma.poll.create({
      data: {
        officeLocationId: office.id,
        description: 'Manual poll',
        status: 'finished',
        startedAt: new Date(2026, 2, 11, 9, 0, 0, 0),
        endsAt: new Date(2026, 2, 11, 10, 0, 0, 0),
        createdAt: new Date(2026, 2, 11, 9, 0, 0, 0),
      },
    });

    await runOfficePollScheduleCheck(new Date(2026, 2, 11, 10, 45, 0, 0));

    const polls = await prisma.poll.findMany({
      where: { officeLocationId: office.id },
    });

    expect(polls).toHaveLength(1);
    expect(polls[0].description).toBe('Manual poll');
  });
});
