import prisma from '../db.js';
import { listOfficeLocations } from './officeLocation.js';
import { announcePollStarted, createPollRecord } from './pollCreation.js';
import type { OfficeLocation } from '../../lib/types.js';
import { evaluateOrderingPolicy } from './orderingPolicy.js';
import { addCalendarDays, getOfficeDateTime, officeMidnightToUtc, officeTimeToUtc } from './officeTime.js';

const AUTO_POLL_DESCRIPTION = 'Scheduled lunch poll';
const AUTO_POLL_CREATED_BY_PREFIX = 'office-scheduler:';
const AUTO_POLL_WINDOW_MINUTES = 60;
const SCHEDULER_INTERVAL_MS = 60_000;

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

function getScheduleCreatedBy(location: OfficeLocation, now: Date): string {
  return `${AUTO_POLL_CREATED_BY_PREFIX}${location.id}:${getOfficeDateTime(now, location.timeZone).date}`;
}

function getMinutesUntilScheduledFinish(now: Date, finishTime: string, timeZone: string): number {
  const finishDate = officeTimeToUtc(getOfficeDateTime(now, timeZone).date, finishTime, timeZone);
  return finishDate ? Math.floor((finishDate.getTime() - now.getTime()) / 60_000) : 0;
}

async function hasExistingLunchActivityToday(location: OfficeLocation, now: Date): Promise<boolean> {
  const localDate = getOfficeDateTime(now, location.timeZone).date;
  const dayStart = officeMidnightToUtc(localDate, location.timeZone);
  const dayEnd = officeMidnightToUtc(addCalendarDays(localDate, 1), location.timeZone);
  const officeLocationId = location.id;

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

  if (!location.autoStartPollWeekdays.includes(getOfficeDateTime(now, location.timeZone).weekday)) {
    return null;
  }

  const createdBy = getScheduleCreatedBy(location, now);
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

  if (await hasExistingLunchActivityToday(location, now)) {
    return null;
  }

  const minutesUntilFinish = getMinutesUntilScheduledFinish(now, location.autoStartPollFinishTime, location.timeZone);
  if (minutesUntilFinish < 5 || minutesUntilFinish > AUTO_POLL_WINDOW_MINUTES) {
    return null;
  }

  const { availability } = await evaluateOrderingPolicy(location.id, now);
  return ['eligible', 'unrestricted'].includes(availability.status) ? minutesUntilFinish : null;
}

async function tryAutoStartPoll(location: OfficeLocation, now: Date): Promise<void> {
  try {
    const durationMinutes = await shouldAutoStartPoll(location, now);
    if (!durationMinutes) return;

    const { poll, resolvedOfficeLocationId } = await createPollRecord(
      AUTO_POLL_DESCRIPTION,
      durationMinutes,
      undefined,
      location.id,
      getScheduleCreatedBy(location, now),
    );
    await announcePollStarted(poll, resolvedOfficeLocationId);
  } catch (error) {
    const statusCode =
      typeof error === 'object' && error && 'statusCode' in error
        ? Number((error as { statusCode?: number }).statusCode)
        : 0;
    if (statusCode !== 409 && statusCode !== 400) {
      console.error('[officePollSchedule] failed to auto-start poll', location.id, error);
    }
  }
}

export async function runOfficePollScheduleCheck(now = new Date()): Promise<void> {
  try {
    const locations = await listOfficeLocations();
    for (const location of locations) {
      await tryAutoStartPoll(location, now);
    }
  } catch (error) {
    console.error('[officePollSchedule] failed to check office schedules', error);
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
