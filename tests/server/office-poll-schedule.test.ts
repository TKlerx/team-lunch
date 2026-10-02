import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { broadcast } from "../../src/server/sse.js";
import { sendEmail } from "../../src/server/services/notificationEmail.js";
import prisma from "../../src/server/db.js";
import { cleanDatabase, disconnectDatabase } from "./helpers/db.js";
import {
  createOfficeLocation,
  updateOfficeLocationSettings,
} from "../../src/server/services/officeLocation.js";
import type { UpdateOfficeLocationSettingsRequest } from "../../src/lib/types.js";
import * as orderingPolicy from "../../src/server/services/orderingPolicy.js";
import * as officeLocations from "../../src/server/services/officeLocation.js";
import {
  clearAllTimers,
  getActiveTimers,
} from "../../src/server/services/pollCreation.js";
import "../../src/server/services/poll.js";
import { runOfficePollScheduleCheck } from "../../src/server/services/officePollSchedule.js";

vi.mock("../../src/server/sse.js", () => ({ broadcast: vi.fn() }));
vi.mock(
  "../../src/server/services/notificationEmail.js",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../src/server/services/notificationEmail.js")
    >()),
    sendEmail: vi.fn(),
  }),
);
vi.mock("../../src/server/services/authAccess.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../src/server/services/authAccess.js")
  >()),
  listApprovedAccessUserEmails: vi.fn(async () => ["scheduled@example.com"]),
}));

let officeCount = 0;
async function scheduledOffice(
  settings: Partial<UpdateOfficeLocationSettingsRequest> = {},
) {
  const office = await createOfficeLocation(
    `Scheduled office ${++officeCount}`,
  );
  await updateOfficeLocationSettings(office.id, {
    autoStartPollEnabled: true,
    autoStartPollWeekdays: ["wednesday"],
    autoStartPollFinishTime: "11:30",
    defaultFoodSelectionDurationMinutes: 20,
    orderingIntervalWeeks: 1,
    orderingAnchorDate: "2026-03-02",
    timeZone: "UTC",
    ...settings,
  });
  return office;
}

async function checkAt(instant: string) {
  const now = new Date(instant);
  vi.setSystemTime(now);
  await runOfficePollScheduleCheck(now);
}

async function retainedPoll(
  officeLocationId: string,
  createdAt: string,
  status = "finished",
  createdBy?: string,
) {
  const instant = new Date(createdAt);
  return prisma.poll.create({
    data: {
      officeLocationId,
      description: "Retained lunch",
      status,
      createdBy,
      startedAt: instant,
      endsAt: instant,
      createdAt: instant,
    },
  });
}

async function retainedSelection(
  officeLocationId: string,
  createdAt: string,
  completedAt: string | null,
  status = "completed",
) {
  const poll = await retainedPoll(officeLocationId, createdAt);
  return prisma.foodSelection.create({
    data: {
      officeLocationId,
      pollId: poll.id,
      menuName: "Retained menu",
      status,
      startedAt: poll.startedAt,
      endsAt: poll.endsAt,
      createdAt: poll.createdAt,
      completedAt: completedAt ? new Date(completedAt) : null,
    },
  });
}

function expectNoStart() {
  expect(broadcast).not.toHaveBeenCalledWith(
    "poll_started",
    expect.anything(),
    expect.anything(),
  );
  expect(sendEmail).not.toHaveBeenCalled();
  expect(getActiveTimers().size).toBe(0);
}

async function scheduledPolls(officeLocationId: string) {
  return prisma.poll.findMany({
    where: { officeLocationId, createdBy: { startsWith: "office-scheduler:" } },
  });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-03-11T10:40:00Z"));
  await cleanDatabase();
  vi.clearAllMocks();
});

afterEach(() => {
  clearAllTimers();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

afterAll(async () => {
  await cleanDatabase();
  await disconnectDatabase();
});

describe("daily starts and deduplication", () => {
  it("auto-starts a scheduled poll within the office window without an exception", async () => {
    const office = await scheduledOffice();
    await checkAt("2026-03-11T10:40:00Z");
    const [poll] = await scheduledPolls(office.id);
    expect(poll.description).toBe("Scheduled lunch poll");
    expect(poll.createdBy).toBe(`office-scheduler:${office.id}:2026-03-11`);
    expect(poll.orderingPolicyException).toBeNull();
    expect(poll.endsAt.toISOString()).toBe("2026-03-11T11:30:00.000Z");
    expect(broadcast).toHaveBeenCalledWith(
      "poll_started",
      expect.objectContaining({
        poll: expect.objectContaining({ id: poll.id }),
      }),
      office.id,
    );
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it("does not create a duplicate scheduled poll even when the first was aborted", async () => {
    const office = await scheduledOffice();
    await checkAt("2026-03-11T10:45:00Z");
    const [poll] = await scheduledPolls(office.id);
    await prisma.poll.update({
      where: { id: poll.id },
      data: { status: "aborted" },
    });
    clearAllTimers();
    vi.clearAllMocks();
    await checkAt("2026-03-11T10:50:00Z");
    expect(await scheduledPolls(office.id)).toHaveLength(1);
    expectNoStart();
  });

  it.each(["poll", "selection"])(
    "skips existing same-day %s activity",
    async (kind) => {
      const office = await scheduledOffice({ orderingIntervalWeeks: 0 });
      if (kind === "poll")
        await retainedPoll(office.id, "2026-03-11T09:00:00Z");
      else
        await retainedSelection(
          office.id,
          "2026-03-11T09:00:00Z",
          null,
          "aborted",
        );
      await checkAt("2026-03-11T10:45:00Z");
      expect(await scheduledPolls(office.id)).toHaveLength(0);
      expectNoStart();
    },
  );
});

describe("calendar policy eligibility", () => {
  it.each(["period_used", "not_started"])(
    "skips %s at precheck without notification, timer, or exception",
    async (state) => {
      const office = await scheduledOffice(
        state === "not_started" ? { orderingAnchorDate: "2026-03-16" } : {},
      );
      if (state === "period_used")
        await retainedSelection(
          office.id,
          "2026-03-09T09:00:00Z",
          "2026-03-10T12:00:00Z",
        );
      const evaluate = vi.spyOn(orderingPolicy, "evaluateOrderingPolicy");
      await checkAt("2026-03-11T10:45:00Z");
      expect(evaluate).toHaveBeenCalledTimes(1);
      expect(await scheduledPolls(office.id)).toHaveLength(0);
      const polls = await prisma.poll.findMany({
        where: { officeLocationId: office.id },
      });
      expect(polls.every((poll) => poll.orderingPolicyException === null)).toBe(
        true,
      );
      expectNoStart();
    },
  );
});

describe("fresh blocks and Unrestricted", () => {
  it("starts in a fresh multiweek block, but unused elapsed blocks give no carryover", async () => {
    const office = await scheduledOffice({
      orderingIntervalWeeks: 2,
      orderingAnchorDate: "2026-02-02",
    });
    await retainedSelection(
      office.id,
      "2026-02-16T09:00:00Z",
      "2026-02-27T12:00:00Z",
    );
    await checkAt("2026-03-04T10:45:00Z");
    const [poll] = await scheduledPolls(office.id);
    expect(poll.orderingPolicyException).toBeNull();
    await prisma.poll.update({
      where: { id: poll.id },
      data: { status: "finished" },
    });
    await prisma.foodSelection.create({
      data: {
        officeLocationId: office.id,
        pollId: poll.id,
        menuName: "Lunch",
        status: "completed",
        startedAt: poll.startedAt,
        endsAt: poll.endsAt,
        createdAt: new Date("2026-03-04T11:30:00Z"),
        completedAt: new Date("2026-03-04T12:00:00Z"),
      },
    });
    clearAllTimers();
    vi.clearAllMocks();
    await checkAt("2026-03-11T10:45:00Z");
    expect(await scheduledPolls(office.id)).toHaveLength(1);
    expectNoStart();
    await checkAt("2026-03-18T10:45:00Z");
    expect(await scheduledPolls(office.id)).toHaveLength(2);
  });

  it("Unrestricted ignores retained completions and a future anchor", async () => {
    const office = await scheduledOffice({
      orderingAnchorDate: "2026-03-16",
    });
    await updateOfficeLocationSettings(office.id, {
      autoStartPollEnabled: true,
      autoStartPollWeekdays: ["wednesday"],
      autoStartPollFinishTime: "11:30",
      defaultFoodSelectionDurationMinutes: 20,
      orderingIntervalWeeks: 0,
    });
    await retainedSelection(
      office.id,
      "2026-03-09T09:00:00Z",
      "2026-03-10T12:00:00Z",
    );
    await checkAt("2026-03-11T10:45:00Z");
    const [poll] = await scheduledPolls(office.id);
    expect(poll.orderingPolicyException).toBeNull();
  });
});

describe("office-local schedules", () => {
  it("uses each office weekday, finish clock and date marker at the same instant", async () => {
    const tokyo = await scheduledOffice({
      timeZone: "Asia/Tokyo",
      autoStartPollFinishTime: "01:30",
    });
    const losAngeles = await scheduledOffice({
      timeZone: "America/Los_Angeles",
      autoStartPollWeekdays: ["tuesday"],
      autoStartPollFinishTime: "09:30",
    });
    const wrongDay = await scheduledOffice({
      timeZone: "America/Los_Angeles",
      autoStartPollFinishTime: "09:30",
    });
    await checkAt("2026-03-10T15:45:00Z");
    const [tokyoPoll] = await scheduledPolls(tokyo.id);
    const [laPoll] = await scheduledPolls(losAngeles.id);
    expect(tokyoPoll.createdBy).toBe(`office-scheduler:${tokyo.id}:2026-03-11`);
    expect(laPoll.createdBy).toBe(
      `office-scheduler:${losAngeles.id}:2026-03-10`,
    );
    expect(tokyoPoll.endsAt.toISOString()).toBe("2026-03-10T16:30:00.000Z");
    expect(laPoll.endsAt.toISOString()).toBe("2026-03-10T16:30:00.000Z");
    expect(await scheduledPolls(wrongDay.id)).toHaveLength(0);
  });

  it.each([
    ["2026-03-10T14:59:59Z", true],
    ["2026-03-10T15:00:00Z", false],
    ["2026-03-11T15:00:00Z", true],
  ])(
    "uses half-open office-local activity bounds for %s",
    async (createdAt, starts) => {
      const office = await scheduledOffice({
        timeZone: "Asia/Tokyo",
        autoStartPollFinishTime: "01:30",
        orderingIntervalWeeks: 0,
      });
      await retainedPoll(office.id, createdAt);
      await checkAt("2026-03-10T15:45:00Z");
      expect(await scheduledPolls(office.id)).toHaveLength(starts ? 1 : 0);
    },
  );
});

describe("office-local DST schedules", () => {
  it.each([
    ["2026-03-29T00:40:00Z", "03:30", "2026-03-29T01:30:00.000Z"],
    ["2026-10-25T00:40:00Z", "02:30", null],
    ["2026-03-29T00:40:00Z", "02:30", null],
  ])(
    "handles office DST finish clocks at %s (%s)",
    async (now, finish, expectedEnd) => {
      const office = await scheduledOffice({
        timeZone: "Europe/Berlin",
        autoStartPollWeekdays: ["sunday"],
        autoStartPollFinishTime: finish,
      });
      await checkAt(now);
      const polls = await scheduledPolls(office.id);
      if (expectedEnd) expect(polls[0].endsAt.toISOString()).toBe(expectedEnd);
      else {
        expect(polls).toHaveLength(0);
        expectNoStart();
      }
    },
  );
});

describe("existing schedule and activity guards", () => {
  it.each([
    ["2026-03-11T10:25:00Z", false],
    ["2026-03-11T10:30:00Z", true],
    ["2026-03-11T11:25:00Z", true],
    ["2026-03-11T11:26:00Z", false],
    ["2026-03-11T11:30:00Z", false],
    ["2026-03-11T11:35:00Z", false],
    ["2026-03-11T10:44:00Z", false],
  ])("retains window and duration guards at %s", async (now, starts) => {
    const office = await scheduledOffice();
    await checkAt(now);
    expect(await scheduledPolls(office.id)).toHaveLength(starts ? 1 : 0);
    if (!starts) expectNoStart();
  });

  it.each(["disabled", "inactive", "no-weekday", "no-finish"])(
    "retains the %s schedule guard",
    async (guard) => {
      const office = await scheduledOffice({
        autoStartPollEnabled: guard !== "disabled" && guard !== "no-finish",
        autoStartPollWeekdays:
          guard === "no-weekday" ? ["monday"] : ["wednesday"],
        autoStartPollFinishTime: guard === "no-finish" ? null : "11:30",
      });
      if (guard === "inactive")
        await prisma.officeLocation.update({
          where: { id: office.id },
          data: { isActive: false },
        });
      if (guard === "no-finish")
        await prisma.officeLocation.update({
          where: { id: office.id },
          data: { autoStartPollEnabled: true },
        });
      await checkAt("2026-03-11T10:45:00Z");
      expect(await scheduledPolls(office.id)).toHaveLength(0);
      expectNoStart();
    },
  );

  it.each(["active", "tied", "ordering", "delivering", "delivery_due"])(
    "retains the ongoing %s guard across days",
    async (status) => {
      const office = await scheduledOffice({ orderingIntervalWeeks: 0 });
      if (status === "active" || status === "tied")
        await retainedPoll(office.id, "2026-03-10T09:00:00Z", status);
      else
        await retainedSelection(
          office.id,
          "2026-03-10T09:00:00Z",
          null,
          status,
        );
      await checkAt("2026-03-11T10:45:00Z");
      expect(await scheduledPolls(office.id)).toHaveLength(0);
      expectNoStart();
    },
  );
});

describe("creation rechecks and office failure isolation", () => {
  it.each(["completion", "settings"])(
    "rechecks a stale eligible precheck after %s changes without overriding",
    async (change) => {
      const office = await scheduledOffice();
      const evaluate = orderingPolicy.evaluateOrderingPolicy;
      const spy = vi.spyOn(orderingPolicy, "evaluateOrderingPolicy");
      spy.mockImplementationOnce(async (officeId, now) => {
        const result = await evaluate(officeId, now);
        expect(result.availability.status).toBe("eligible");
        if (change === "completion")
          await retainedSelection(
            office.id,
            "2026-03-09T09:00:00Z",
            "2026-03-10T12:00:00Z",
          );
        else
          await prisma.officeLocation.update({
            where: { id: office.id },
            data: { orderingAnchorDate: new Date("2026-03-16T00:00:00Z") },
          });
        return result;
      });
      await checkAt("2026-03-11T10:45:00Z");
      expect(spy).toHaveBeenCalledTimes(2);
      expect(await scheduledPolls(office.id)).toHaveLength(0);
      expectNoStart();
    },
  );
});

describe("office failure isolation", () => {
  it("fails closed for an evaluator error and still starts the next office", async () => {
    const failedOffice = await scheduledOffice();
    const healthyOffice = await scheduledOffice();
    const locations = await officeLocations.listOfficeLocations();
    vi.spyOn(officeLocations, "listOfficeLocations").mockResolvedValue([
      locations.find((location) => location.id === failedOffice.id)!,
      locations.find((location) => location.id === healthyOffice.id)!,
    ]);
    const error = new Error("Policy database unavailable");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const evaluate = orderingPolicy.evaluateOrderingPolicy;
    vi.spyOn(orderingPolicy, "evaluateOrderingPolicy").mockImplementation(
      (officeId, now) => {
        if (officeId === failedOffice.id) throw error;
        return evaluate(officeId, now);
      },
    );

    await expect(checkAt("2026-03-11T10:45:00Z")).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledWith(
      "[officePollSchedule] failed to auto-start poll",
      failedOffice.id,
      error,
    );
    expect(
      await prisma.poll.count({
        where: { officeLocationId: failedOffice.id },
      }),
    ).toBe(0);
    expect(
      await prisma.foodSelection.count({
        where: { officeLocationId: failedOffice.id },
      }),
    ).toBe(0);
    const [poll] = await scheduledPolls(healthyOffice.id);
    expect(poll.orderingPolicyException).toBeNull();
    expect([...getActiveTimers().keys()]).toEqual([poll.id]);
    expect(broadcast).not.toHaveBeenCalledWith(
      "poll_started",
      expect.anything(),
      failedOffice.id,
    );
    expect(broadcast).toHaveBeenCalledWith(
      "poll_started",
      expect.anything(),
      healthyOffice.id,
    );
    expect(sendEmail).toHaveBeenCalledOnce();
  });
});
