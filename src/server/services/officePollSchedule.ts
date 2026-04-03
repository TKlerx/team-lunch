import prisma from '../db.js';
import { listOfficeLocations } from './officeLocation.js';
import { startPoll } from './poll.js';
import type { OfficeLocation, OfficeWeekday } from '../../lib/types.js';

const AUTO_POLL_DESCRIPTION = 'Scheduled lunch poll';
const AUTO_POLL_CREATED_BY_PREFIX = 'office-scheduler:';
const AUTO_POLL_WINDOW_MINUTES = 60;
const SCHEDULER_INTERVAL_MS = 60_000;

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

function getWeekday(date: Date): OfficeWeekday {
  return (
    ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][
      date.getDay()
    ] as OfficeWeekday
  );
}

function getScheduleDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getScheduleCreatedBy(officeLocationId: string, date: Date): string {
  return `${AUTO_POLL_CREATED_BY_PREFIX}${officeLocationId}:${getScheduleDateKey(date)}`;
}

function getMinutesUntilScheduledFinish(date: Date, finishTime: string): number {
  const [hoursText, minutesText] = finishTime.split(':');
  const hours = Number.parseInt(hoursText, 10);
  const minutes = Number.parseInt(minutesText, 10);
  const finishDate = new Date(date);
  finishDate.setHours(hours, minutes, 0, 0);
  return Math.floor((finishDate.getTime() - date.getTime()) / 60_000);
}

async function hasExistingLunchActivityToday(officeLocationId: string, date: Date): Promise<boolean> {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const [poll, selection] = await Promise.all([
    prisma.poll.findFirst({
      where: {
        officeLocationId,
        createdAt: { gte: dayStart, lt: dayEnd },
        status: { not: 'aborted' },
      },
      select: { id: true },
    }),
    prisma.foodSelection.findFirst({
      where: {
        officeLocationId,
        createdAt: { gte: dayStart, lt: dayEnd },
      },
      select: { id: true },
    }),
  ]);

  return !!poll || !!selection;
}

async function shouldAutoStartPoll(location: OfficeLocation, now: Date): Promise<number | null> {
  if (!location.isActive || !location.autoStartPollEnabled || !location.autoStartPollFinishTime) {
    return null;
  }

  if (!location.autoStartPollWeekdays.includes(getWeekday(now))) {
    return null;
  }

  const createdBy = getScheduleCreatedBy(location.id, now);
  const existingScheduledPoll = await prisma.poll.findFirst({
    where: {
      officeLocationId: location.id,
      createdBy,
    },
    select: { id: true },
  });
  if (existingScheduledPoll) {
    return null;
  }

  if (await hasExistingLunchActivityToday(location.id, now)) {
    return null;
  }

  const minutesUntilFinish = getMinutesUntilScheduledFinish(now, location.autoStartPollFinishTime);
  if (minutesUntilFinish <= 0 || minutesUntilFinish > AUTO_POLL_WINDOW_MINUTES) {
    return null;
  }
  if (minutesUntilFinish < 5) {
    return null;
  }

  return minutesUntilFinish;
}

export async function runOfficePollScheduleCheck(now = new Date()): Promise<void> {
  const locations = await listOfficeLocations();
  for (const location of locations) {
    const durationMinutes = await shouldAutoStartPoll(location, now);
    if (!durationMinutes) {
      continue;
    }

    try {
      await startPoll(
        AUTO_POLL_DESCRIPTION,
        durationMinutes,
        undefined,
        location.id,
        getScheduleCreatedBy(location.id, now),
      );
    } catch (error) {
      const statusCode =
        typeof error === 'object' && error && 'statusCode' in error
          ? Number((error as { statusCode?: number }).statusCode)
          : 0;
      if (statusCode !== 409 && statusCode !== 400) {
        console.error('[officePollSchedule] failed to auto-start poll', error);
      }
    }
  }
}

export function startOfficePollScheduler(): void {
  if (schedulerTimer || process.env.NODE_ENV === 'test') {
    return;
  }

  void runOfficePollScheduleCheck();
  schedulerTimer = setInterval(() => {
    void runOfficePollScheduleCheck();
  }, SCHEDULER_INTERVAL_MS);
  if (typeof schedulerTimer === 'object' && 'unref' in schedulerTimer) {
    schedulerTimer.unref();
  }
}

export function stopOfficePollScheduler(): void {
  if (!schedulerTimer) {
    return;
  }
  clearInterval(schedulerTimer);
  schedulerTimer = null;
}
