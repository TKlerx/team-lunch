import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addCalendarDays,
  calendarDaysBetween,
  getOfficeDateTime,
  officeMidnightToUtc,
  parseCalendarDate,
  validateMondayDate,
  validateTimeZone,
} from "../../src/server/services/officeTime.js";

afterEach(() => vi.unstubAllEnvs());

describe("office calendar validation", () => {
  it.each([
    "2024-02-29",
    "2026-01-01",
    "0001-01-01",
    "0099-12-31",
    "9999-12-31",
  ])("accepts strict date %s without the Date year-0–99 shortcut", (value) => {
    expect(parseCalendarDate(value).toISOString()).toBe(
      `${value}T00:00:00.000Z`,
    );
  });

  it.each([
    "",
    "2026-2-01",
    "2026-02-1",
    "2026-02-29",
    "1900-02-29",
    "2026-04-31",
    "2026-00-01",
    "2026-13-01",
    "2026-01-00",
    "0000-01-01",
    " 2026-01-01",
    "2026-01-01 ",
    "2026-01-01T00:00:00Z",
  ])("rejects invalid date %s rather than normalizing it", (value) => {
    expect(() => parseCalendarDate(value)).toThrow(RangeError);
  });

  it("requires a valid Monday independently of server timezone", () => {
    expect(() => validateMondayDate("2026-09-28")).not.toThrow();
    expect(() => validateMondayDate("2026-09-29")).toThrow("Monday");
    expect(() => validateMondayDate("2026-02-30")).toThrow(RangeError);
  });

  it.each(["UTC", "Europe/Vienna", "Asia/Kathmandu", "Pacific/Chatham"])(
    "accepts timezone %s",
    (zone) => expect(() => validateTimeZone(zone)).not.toThrow(),
  );
  it.each(["", "Unknown/Office", " Europe/Vienna", "+05:45"])(
    "rejects timezone %s",
    (zone) => {
      expect(() => validateTimeZone(zone)).toThrow(RangeError);
      expect(() => getOfficeDateTime(new Date(), zone)).toThrow(RangeError);
      expect(() => officeMidnightToUtc("2026-09-28", zone)).toThrow(RangeError);
    },
  );

  it("rejects invalid instants and non-string runtime inputs", () => {
    expect(() => getOfficeDateTime(new Date(NaN), "UTC")).toThrow(RangeError);
    expect(() => parseCalendarDate(null as unknown as string)).toThrow(
      RangeError,
    );
    expect(() => validateTimeZone(null as unknown as string)).toThrow(
      RangeError,
    );
  });
});

describe("calendar arithmetic", () => {
  it.each([
    ["2026-12-28", 7, "2027-01-04"],
    ["2024-02-28", 1, "2024-02-29"],
    ["2024-02-29", 1, "2024-03-01"],
    ["2023-02-28", 1, "2023-03-01"],
    ["2000-02-28", 2, "2000-03-01"],
    ["1900-02-28", 1, "1900-03-01"],
    ["2027-01-04", -7, "2026-12-28"],
    ["2026-09-28", 28, "2026-10-26"],
    ["2026-09-28", 0, "2026-09-28"],
  ])("adds calendar days across boundaries: %s + %s", (start, days, end) => {
    expect(addCalendarDays(start, days)).toBe(end);
    expect(calendarDaysBetween(start, end)).toBe(days);
    expect(calendarDaysBetween(end, start)).toBe(-days || 0);
  });

  it("rejects fractional offsets and out-of-range results", () => {
    for (const offset of [0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => addCalendarDays("2026-09-28", offset)).toThrow(RangeError);
    }
    expect(() => addCalendarDays("0001-01-01", -1)).toThrow(RangeError);
    expect(() => addCalendarDays("9999-12-31", 1)).toThrow(RangeError);
  });
});

describe("office-local boundaries", () => {
  it.each([
    ["2026-09-28", "UTC", "2026-09-28T00:00:00.000Z"],
    ["2026-03-23", "Europe/Vienna", "2026-03-22T23:00:00.000Z"],
    ["2026-03-30", "Europe/Vienna", "2026-03-29T22:00:00.000Z"],
    ["2026-10-19", "Europe/Vienna", "2026-10-18T22:00:00.000Z"],
    ["2026-10-26", "Europe/Vienna", "2026-10-25T23:00:00.000Z"],
    ["2026-09-28", "Asia/Kathmandu", "2026-09-27T18:15:00.000Z"],
    ["2026-09-28", "America/St_Johns", "2026-09-28T02:30:00.000Z"],
    ["2026-09-28", "Pacific/Chatham", "2026-09-27T10:15:00.000Z"],
    ["2018-11-04", "America/Sao_Paulo", "2018-11-04T03:00:00.000Z"],
    ["2020-11-01", "America/Havana", "2020-11-01T04:00:00.000Z"],
  ])("converts %s midnight in %s", (date, zone, expected) => {
    const boundary = officeMidnightToUtc(date, zone);
    expect(boundary.toISOString()).toBe(expected);
    expect(getOfficeDateTime(boundary, zone).date).toBe(date);
    expect(getOfficeDateTime(new Date(boundary.getTime() - 1), zone).date).toBe(
      addCalendarDays(date, -1),
    );
  });

  it("does not pretend a wholly skipped local date exists", () => {
    expect(() => officeMidnightToUtc("2011-12-30", "Pacific/Apia")).toThrow(
      "does not exist",
    );
  });

  it("converts each weekly boundary separately across DST", () => {
    const hours = (start: string, end: string) =>
      (officeMidnightToUtc(end, "Europe/Vienna").getTime() -
        officeMidnightToUtc(start, "Europe/Vienna").getTime()) /
      3_600_000;
    expect(hours("2026-03-23", "2026-03-30")).toBe(167);
    expect(hours("2026-10-19", "2026-10-26")).toBe(169);
    expect(calendarDaysBetween("2026-03-23", "2026-03-30")).toBe(7);
  });

  it.each(["UTC", "America/Los_Angeles", "Asia/Tokyo"])(
    "uses office date, weekday and clock rather than server TZ=%s",
    (serverZone) => {
      vi.stubEnv("TZ", serverZone);
      const instant = new Date("2026-09-27T22:30:00.000Z");
      expect(getOfficeDateTime(instant, "Europe/Vienna")).toEqual({
        date: "2026-09-28",
        weekday: "monday",
        hour: 0,
        minute: 30,
      });
      expect(getOfficeDateTime(instant, "America/Los_Angeles")).toEqual({
        date: "2026-09-27",
        weekday: "sunday",
        hour: 15,
        minute: 30,
      });
      expect(
        officeMidnightToUtc("2026-09-28", "Europe/Vienna").toISOString(),
      ).toBe("2026-09-27T22:00:00.000Z");
      expect(addCalendarDays("2026-12-28", 7)).toBe("2027-01-04");
      expect(() => validateMondayDate("2026-09-28")).not.toThrow();
    },
  );
});
