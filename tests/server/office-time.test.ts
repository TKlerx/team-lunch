import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addCalendarDays,
  calendarDaysBetween,
  getOfficeDateTime,
  officeMidnightToUtc,
  officeTimeToUtc,
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

describe("office clock validation", () => {
  it.each([
    ["00:00", "2026-03-11T00:00:00.000Z"],
    ["09:05", "2026-03-11T09:05:00.000Z"],
    ["12:30", "2026-03-11T12:30:00.000Z"],
    ["23:59", "2026-03-11T23:59:00.000Z"],
  ])("accepts strict HH:mm %s", (time, expected) => {
    expect(officeTimeToUtc("2026-03-11", time, "UTC")?.toISOString()).toBe(
      expected,
    );
  });

  it.each([
    "",
    "9:05",
    "09:5",
    "24:00",
    "23:60",
    "-1:00",
    "12:30:00",
    " 12:30",
    "12:30 ",
    "12:30\n",
    "12.30",
    "ab:cd",
    null,
    undefined,
    1230,
  ])("rejects invalid runtime clock %s rather than normalizing it", (time) => {
    expect(() => officeTimeToUtc("2026-03-11", time as string, "UTC")).toThrow(
      RangeError,
    );
  });

  it("retains strict date and timezone validation", () => {
    expect(() => officeTimeToUtc("2026-02-29", "12:30", "UTC")).toThrow(
      RangeError,
    );
    expect(() =>
      officeTimeToUtc("2026-03-11", "12:30", "Unknown/Office"),
    ).toThrow(RangeError);
  });
});

describe("office clock conversion", () => {
  it.each([
    ["2026-03-11", "01:30", "Asia/Tokyo", "2026-03-10T16:30:00.000Z"],
    ["2026-03-11", "11:30", "Asia/Kathmandu", "2026-03-11T05:45:00.000Z"],
    ["2026-09-28", "11:30", "America/St_Johns", "2026-09-28T14:00:00.000Z"],
    ["2026-09-28", "11:30", "Pacific/Chatham", "2026-09-27T21:45:00.000Z"],
    ["2026-03-29", "03:30", "Europe/Berlin", "2026-03-29T01:30:00.000Z"],
  ])(
    "converts %s %s in %s, including fractional offsets",
    (date, time, zone, expected) => {
      const instant = officeTimeToUtc(date, time, zone)!;
      expect(instant.toISOString()).toBe(expected);
      const [hour, minute] = time.split(":").map(Number);
      expect(getOfficeDateTime(instant, zone)).toMatchObject({
        date,
        hour,
        minute,
      });
    },
  );

  it.each([
    ["2026-10-25", "02:30", "Europe/Berlin", "2026-10-25T00:30:00.000Z"],
    ["2026-04-05", "01:45", "Australia/Lord_Howe", "2026-04-04T14:45:00.000Z"],
  ])(
    "chooses the earlier instant of repeated %s %s in %s",
    (date, time, zone, expected) => {
      expect(officeTimeToUtc(date, time, zone)?.toISOString()).toBe(expected);
    },
  );

  it.each([
    ["2026-03-29", "02:30", "Europe/Berlin"],
    ["2026-10-04", "02:15", "Australia/Lord_Howe"],
    ["2018-11-04", "00:30", "America/Sao_Paulo"],
    ["2011-12-30", "00:00", "Pacific/Apia"],
    ["2011-12-30", "12:30", "Pacific/Apia"],
    ["2011-12-30", "23:59", "Pacific/Apia"],
  ])("returns null for nonexistent %s %s in %s", (date, time, zone) => {
    expect(officeTimeToUtc(date, time, zone)).toBeNull();
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
