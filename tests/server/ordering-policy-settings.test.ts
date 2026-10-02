import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/server/index.js";
import prisma from "../../src/server/db.js";
import { createSessionCookieValue } from "../../src/server/services/authSession.js";
import { createOfficeLocation } from "../../src/server/services/officeLocation.js";
import { cleanDatabase, disconnectDatabase } from "./helpers/db.js";

const settings = {
  autoStartPollEnabled: true,
  autoStartPollWeekdays: ["monday"],
  autoStartPollFinishTime: "11:30",
  defaultFoodSelectionDurationMinutes: 15,
};
const policy = {
  orderingIntervalWeeks: 2,
  timeZone: "Europe/Vienna",
  orderingAnchorDate: "2099-01-05",
};
let app: FastifyInstance;
let officeId: string;
let otherOfficeId: string;
const originalEnv = {
  AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
  AUTH_ADMIN_EMAIL: process.env.AUTH_ADMIN_EMAIL,
};

function save(
  payload: object,
  username = "admin@company.com",
  target = officeId,
) {
  const session = createSessionCookieValue({
    username,
    method: "entra",
    iat: Math.floor(Date.now() / 1000),
  });
  return app.inject({
    method: "POST",
    url: `/api/auth/offices/${target}/settings`,
    headers: { cookie: `team_lunch_auth_session=${session}` },
    payload,
  });
}

beforeAll(async () => {
  process.env.AUTH_SESSION_SECRET = "12345678901234567890123456789012";
  process.env.AUTH_ADMIN_EMAIL = "admin@company.com";
  app = await buildApp();
  await app.ready();
});
beforeEach(async () => {
  await cleanDatabase();
  officeId = (await createOfficeLocation("Vienna")).id;
  otherOfficeId = (await createOfficeLocation("Berlin")).id;
});
afterAll(async () => {
  await cleanDatabase();
  await app.close();
  await disconnectDatabase();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("ordering policy settings route", () => {
  it("saves a future anchor, preserves older payloads, and only updates the addressed office", async () => {
    const otherBefore = await prisma.officeLocation.findUniqueOrThrow({
      where: { id: otherOfficeId },
    });
    const res = await save({ ...settings, ...policy });
    expect(res.statusCode).toBe(200);
    expect(res.json().office).toMatchObject({ id: officeId, ...policy });
    expect(
      (
        await save({ ...settings, defaultFoodSelectionDurationMinutes: 20 })
      ).json().office,
    ).toMatchObject(policy);
    expect(
      await prisma.officeLocation.findUniqueOrThrow({
        where: { id: otherOfficeId },
      }),
    ).toEqual(otherBefore);
  });

  it.each([
    { orderingIntervalWeeks: "2" },
    { orderingIntervalWeeks: 5 },
    { orderingIntervalWeeks: null },
    { timeZone: "Not/AZone" },
    { timeZone: null },
    { orderingAnchorDate: "2099-02-30" },
    { orderingAnchorDate: "2099-01-06" },
    { orderingAnchorDate: "2099-01-05T00:00:00Z" },
    { orderingAnchorDate: null },
  ])("returns 400 with no partial update for %j", async (field) => {
    const before = await prisma.officeLocation.findUniqueOrThrow({
      where: { id: officeId },
    });
    const res = await save({ ...settings, ...policy, ...field });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: expect.any(String) });
    expect(
      await prisma.officeLocation.findUniqueOrThrow({
        where: { id: officeId },
      }),
    ).toEqual(before);
  });

});

describe("unrestricted ordering policy settings route", () => {
  it("retains the anchor when disabled, still validates timezone, and re-enables it", async () => {
    expect((await save({ ...settings, ...policy })).statusCode).toBe(200);
    const disabled = await save({
      ...settings,
      orderingIntervalWeeks: 0,
      orderingAnchorDate: { invalid: true },
      timeZone: "UTC",
    });
    expect(disabled.statusCode).toBe(200);
    expect(disabled.json().office).toMatchObject({
      orderingIntervalWeeks: 0,
      orderingAnchorDate: policy.orderingAnchorDate,
      timeZone: "UTC",
    });
    expect(
      (await save({ ...settings, timeZone: "Not/AZone" })).statusCode,
    ).toBe(400);
    const enabled = await save({ ...settings, orderingIntervalWeeks: 4 });
    expect(enabled.statusCode).toBe(200);
    expect(enabled.json().office).toMatchObject({
      orderingIntervalWeeks: 4,
      orderingAnchorDate: policy.orderingAnchorDate,
    });
  });
});

describe("ordering policy settings authorization and office resolution", () => {
  it("rejects unauthenticated and non-admin writes without changing either office", async () => {
    const before = await prisma.officeLocation.findMany({
      orderBy: { id: "asc" },
    });
    const anonymous = await app.inject({
      method: "POST",
      url: `/api/auth/offices/${officeId}/settings`,
      payload: { ...settings, ...policy },
    });
    expect(anonymous.statusCode).toBe(401);
    expect(
      (await save({ ...settings, ...policy }, "member@company.com")).statusCode,
    ).toBe(403);
    expect(
      await prisma.officeLocation.findMany({ orderBy: { id: "asc" } }),
    ).toEqual(before);
  });

  it("rejects nonexistent and inactive offices without falling back to another office", async () => {
    await prisma.officeLocation.update({
      where: { id: otherOfficeId },
      data: { isActive: false },
    });
    const before = await prisma.officeLocation.findUniqueOrThrow({
      where: { id: officeId },
    });
    expect(
      (
        await save(
          { ...settings, ...policy },
          "admin@company.com",
          otherOfficeId,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await save(
          { ...settings, ...policy },
          "admin@company.com",
          "00000000-0000-0000-0000-000000000000",
        )
      ).statusCode,
    ).toBe(404);
    expect(
      await prisma.officeLocation.findUniqueOrThrow({
        where: { id: officeId },
      }),
    ).toEqual(before);
  });
});
