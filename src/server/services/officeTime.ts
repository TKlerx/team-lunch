import type { OfficeWeekday } from "../../lib/types.js";

const DAY_MS = 86_400_000;
const WEEKDAYS: OfficeWeekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function parseCalendarDate(value: string): Date {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value.startsWith("0000-")
  ) {
    throw new RangeError("Expected a valid YYYY-MM-DD calendar date");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new RangeError("Expected a valid YYYY-MM-DD calendar date");
  }
  return date;
}

export function validateMondayDate(value: string): void {
  if (parseCalendarDate(value).getUTCDay() !== 1) {
    throw new RangeError("Calendar anchor must be a Monday");
  }
}

export function validateTimeZone(timeZone: string): void {
  if (typeof timeZone !== "string" || !timeZone || /^[+-]/.test(timeZone)) {
    throw new RangeError("Expected an IANA timezone");
  }
  new Intl.DateTimeFormat("en", { timeZone });
}

export function addCalendarDays(value: string, days: number): string {
  if (!Number.isSafeInteger(days))
    throw new RangeError("Expected an integer calendar-day offset");
  const date = parseCalendarDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() < 1 ||
    date.getUTCFullYear() > 9999
  ) {
    throw new RangeError("Calendar date is outside years 0001–9999");
  }
  return date.toISOString().slice(0, 10);
}

export function calendarDaysBetween(start: string, end: string): number {
  return (
    (parseCalendarDate(end).getTime() - parseCalendarDate(start).getTime()) /
    DAY_MS
  );
}

function officeFormatter(timeZone: string): Intl.DateTimeFormat {
  validateTimeZone(timeZone);
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

function officeParts(instant: Date, formatter: Intl.DateTimeFormat) {
  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year.padStart(4, "0")}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

export function getOfficeDateTime(instant: Date, timeZone: string) {
  const parts = officeParts(instant, officeFormatter(timeZone));
  return {
    ...parts,
    weekday: WEEKDAYS[parseCalendarDate(parts.date).getUTCDay()],
  };
}

export function officeTimeToUtc(value: string, time: string, timeZone: string): Date | null {
  if (typeof time !== "string" || time.length !== 5 || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new RangeError("Expected a valid HH:mm clock time");
  }
  const [hour, minute] = time.split(":").map(Number);
  const nominal = parseCalendarDate(value).getTime() + (hour * 60 + minute) * 60_000;
  const formatter = officeFormatter(timeZone);
  const candidates: number[] = [];
  // Sample both sides of a timezone transition; repeated clocks choose the
  // earlier instant, while a nonexistent scheduled clock has no candidate.
  for (const days of [-1, 0, 1]) {
    const sample = nominal + days * DAY_MS;
    const parts = officeParts(new Date(sample), formatter);
    const local = parseCalendarDate(parts.date).getTime() + (parts.hour * 60 + parts.minute) * 60_000;
    const candidate = nominal - (local - sample);
    const resolved = officeParts(new Date(candidate), formatter);
    if (resolved.date === value && resolved.hour === hour && resolved.minute === minute) {
      candidates.push(candidate);
    }
  }
  return candidates.length ? new Date(Math.min(...candidates)) : null;
}

export function officeMidnightToUtc(value: string, timeZone: string): Date {
  const nominal = parseCalendarDate(value).getTime();
  const formatter = officeFormatter(timeZone);
  let before = nominal - 2 * DAY_MS;
  let after = nominal + 2 * DAY_MS;
  // Find the date's first instant: skipped midnight advances to the first valid
  // time, and a repeated midnight selects the earlier occurrence.
  while (after - before > 1) {
    const middle = Math.floor((before + after) / 2);
    if (officeParts(new Date(middle), formatter).date < value) before = middle;
    else after = middle;
  }
  const result = new Date(after);
  if (officeParts(result, formatter).date !== value) {
    throw new RangeError("Calendar date does not exist in this timezone");
  }
  return result;
}
