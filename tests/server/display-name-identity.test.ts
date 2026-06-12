import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import prisma from '../../src/server/db.js';
import { cleanDatabase } from './helpers/db.js';
import {
  deleteLocalUserByAdmin,
  getAuthDisplayProfile,
  syncEntraDisplayName,
  updateLocalUserEmailByAdmin,
  updateLocalDisplayName,
} from '../../src/server/services/authAccess.js';
import { normalizeDisplayName } from '../../src/server/services/displayName.js';
import { upsertLocalAuthUser } from '../../src/server/services/localAuth.js';
import { buildApp } from '../../src/server/index.js';
import { createSessionCookieValue } from '../../src/server/services/authSession.js';
import { createOfficeLocation } from '../../src/server/services/officeLocation.js';

describe('display name identity services', () => {
  const originalEnv = {
    AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
    AUTH_ADMIN_EMAIL: process.env.AUTH_ADMIN_EMAIL,
  };

  beforeEach(async () => {
    process.env.AUTH_SESSION_SECRET = '12345678901234567890123456789012';
    delete process.env.AUTH_ADMIN_EMAIL;
    await cleanDatabase();
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('persists local account display names', async () => {
    await upsertLocalAuthUser('alice@example.com', 'Secret#1234');
    await prisma.authAccessUser.create({
      data: {
        email: 'alice@example.com',
        approved: true,
        blocked: false,
        isAdmin: false,
      },
    });

    const updated = await updateLocalDisplayName('alice@example.com', ' Alice Example ');
    const reloaded = await getAuthDisplayProfile('alice@example.com');

    expect(updated).toMatchObject({
      email: 'alice@example.com',
      displayName: 'Alice Example',
      displayNameSource: 'local',
      displayNameSnapshot: 'Alice Example',
    });
    expect(reloaded).toEqual(updated);
  });

  it('allows duplicate display names across users', async () => {
    await upsertLocalAuthUser('alice@example.com', 'Secret#1234');
    await upsertLocalAuthUser('bob@example.com', 'Secret#1234');
    await prisma.authAccessUser.createMany({
      data: [
        { email: 'alice@example.com', approved: true, blocked: false, isAdmin: false },
        { email: 'bob@example.com', approved: true, blocked: false, isAdmin: false },
      ],
    });

    await updateLocalDisplayName('alice@example.com', 'Sam');
    await updateLocalDisplayName('bob@example.com', 'Sam');

    const users = await prisma.authAccessUser.findMany({
      where: { displayName: 'Sam' },
      orderBy: { email: 'asc' },
    });

    expect(users.map((user) => user.email)).toEqual(['alice@example.com', 'bob@example.com']);
  });

  it('keeps Entra display names read-only even when the name claim is absent', async () => {
    await syncEntraDisplayName('entra@example.com', null);

    await expect(updateLocalDisplayName('entra@example.com', 'Local Edit')).rejects.toThrow(
      'Display name is managed by Microsoft Entra',
    );
    await expect(getAuthDisplayProfile('entra@example.com')).resolves.toMatchObject({
      email: 'entra@example.com',
      displayName: null,
      displayNameSource: 'entra',
      displayNameSnapshot: 'entra@example.com',
    });
  });

  it('validates display-name boundaries and supported characters', () => {
    const emojiDisplayName = `Alex_O'Neil (Team) @ HQ ${String.fromCodePoint(0x1f355)}`;
    expect(normalizeDisplayName(`  ${emojiDisplayName}  `)).toBe(emojiDisplayName);
    expect(normalizeDisplayName('a'.repeat(64))).toBe('a'.repeat(64));
    expect(() => normalizeDisplayName('a'.repeat(65))).toThrow(
      'Display name must be 64 characters or fewer',
    );
    expect(() => normalizeDisplayName('Bad<Name')).toThrow(
      'Display name contains unsupported characters',
    );
    expect(() => normalizeDisplayName("Bad\u202EName")).toThrow(
      'Display name contains unsupported characters',
    );
    expect(() => normalizeDisplayName("Bad\u200BName")).toThrow(
      'Display name contains unsupported characters',
    );
    expect(() => normalizeDisplayName("Bad\u0001Name")).toThrow(
      'Display name contains unsupported characters',
    );
  });

  it('lets signed-in local users update and clear their display name', async () => {
    await upsertLocalAuthUser('local@example.com', 'Secret#1234');
    await prisma.authAccessUser.create({
      data: {
        email: 'local@example.com',
        approved: true,
        blocked: false,
        isAdmin: false,
      },
    });
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'local@example.com',
      method: 'local',
      iat: Math.floor(Date.now() / 1000),
    });

    const updateResponse = await app.inject({
      method: 'PUT',
      url: '/api/auth/me/display-name',
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: { displayName: ' Local User ' },
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({
      email: 'local@example.com',
      displayName: 'Local User',
      displayNameSource: 'local',
      displayNameSnapshot: 'Local User',
    });

    const clearResponse = await app.inject({
      method: 'PUT',
      url: '/api/auth/me/display-name',
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: { displayName: '' },
    });
    expect(clearResponse.statusCode).toBe(200);
    expect(clearResponse.json()).toMatchObject({
      displayName: null,
      displayNameSource: null,
      displayNameSnapshot: 'local@example.com',
    });

    await app.close();
  });

  it('lets the bootstrap local admin create a missing access profile when editing display name', async () => {
    process.env.AUTH_ADMIN_EMAIL = 'admin@example.com';
    await upsertLocalAuthUser('admin@example.com', 'Secret#1234');
    const app = await buildApp();
    const session = createSessionCookieValue({
      username: 'admin@example.com',
      method: 'local',
      iat: Math.floor(Date.now() / 1000),
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/auth/me/display-name',
      headers: { cookie: `team_lunch_auth_session=${session}` },
      payload: { displayName: 'Admin Example' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      email: 'admin@example.com',
      displayName: 'Admin Example',
      displayNameSource: 'local',
      displayNameSnapshot: 'Admin Example',
    });
    await expect(prisma.authAccessUser.findUnique({
      where: { email: 'admin@example.com' },
    })).resolves.toMatchObject({
      email: 'admin@example.com',
      approved: true,
      isAdmin: true,
      blocked: false,
    });

    await app.close();
  });

  it('rejects Entra and pending or blocked profile display-name edits', async () => {
    process.env.AUTH_ADMIN_EMAIL = 'admin@example.com';
    const office = await createOfficeLocation('Berlin');
    await prisma.authAccessUser.createMany({
      data: [
        {
          email: 'entra@example.com',
          approved: true,
          blocked: false,
          isAdmin: false,
          officeLocationId: office.id,
        },
        { email: 'pending@example.com', approved: false, blocked: false, isAdmin: false },
        { email: 'blocked@example.com', approved: true, blocked: true, isAdmin: false },
      ],
    });
    await syncEntraDisplayName('entra@example.com', 'Entra User');
    const app = await buildApp();

    for (const [username, method, expectedStatus] of [
      ['entra@example.com', 'entra', 400],
      ['pending@example.com', 'local', 403],
      ['blocked@example.com', 'local', 403],
    ] as const) {
      const session = createSessionCookieValue({
        username,
        method,
        iat: Math.floor(Date.now() / 1000),
      });
      const response = await app.inject({
        method: 'PUT',
        url: '/api/auth/me/display-name',
        headers: { cookie: `team_lunch_auth_session=${session}` },
        payload: { displayName: 'New Name' },
      });
      expect(response.statusCode).toBe(expectedStatus);
    }

    await app.close();
  });

  it('lets admins edit local display names and rejects Entra-managed admin edits', async () => {
    process.env.AUTH_ADMIN_EMAIL = 'admin@example.com';
    await upsertLocalAuthUser('local@example.com', 'Secret#1234');
    await prisma.authAccessUser.createMany({
      data: [
        { email: 'local@example.com', approved: true, blocked: false, isAdmin: false },
      ],
    });
    await syncEntraDisplayName('entra@example.com', 'Entra User');
    const app = await buildApp();
    const adminSession = createSessionCookieValue({
      username: 'admin@example.com',
      method: 'local',
      iat: Math.floor(Date.now() / 1000),
    });

    const updateResponse = await app.inject({
      method: 'PUT',
      url: '/api/auth/users/display-name',
      headers: { cookie: `team_lunch_auth_session=${adminSession}` },
      payload: { email: 'local@example.com', displayName: 'Admin Edited' },
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({
      email: 'local@example.com',
      displayName: 'Admin Edited',
      displayNameSource: 'local',
    });

    const entraResponse = await app.inject({
      method: 'PUT',
      url: '/api/auth/users/display-name',
      headers: { cookie: `team_lunch_auth_session=${adminSession}` },
      payload: { email: 'entra@example.com', displayName: 'Nope' },
    });
    expect(entraResponse.statusCode).toBe(400);
    expect(entraResponse.json()).toEqual({ error: 'Display name is managed by Microsoft Entra' });

    await app.close();
  });

  it('lets admins edit local account emails and expires the old local session', async () => {
    process.env.AUTH_ADMIN_EMAIL = 'admin@example.com';
    await upsertLocalAuthUser('local@example.com', 'Secret#1234');
    await prisma.authAccessUser.create({
      data: {
        email: 'local@example.com',
        approved: true,
        blocked: false,
        isAdmin: false,
      },
    });

    await expect(updateLocalUserEmailByAdmin('local@example.com', 'renamed@example.com')).resolves.toEqual({
      email: 'renamed@example.com',
      previousEmail: 'local@example.com',
    });
    await expect(prisma.localAuthUser.findUnique({ where: { email: 'local@example.com' } })).resolves.toBeNull();
    await expect(prisma.localAuthUser.findUnique({ where: { email: 'renamed@example.com' } })).resolves.toBeTruthy();
    await expect(prisma.authAccessUser.findUnique({ where: { email: 'renamed@example.com' } })).resolves.toBeTruthy();

    const app = await buildApp();
    const oldSession = createSessionCookieValue({
      username: 'local@example.com',
      method: 'local',
      iat: Math.floor(Date.now() / 1000),
    });
    const response = await app.inject({
      method: 'GET',
      url: '/api/user/preferences',
      headers: { cookie: `team_lunch_auth_session=${oldSession}` },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Session expired' });
    await app.close();
  });

  it('lets admins delete local accounts while preserving historical snapshots', async () => {
    process.env.AUTH_ADMIN_EMAIL = 'admin@example.com';
    await upsertLocalAuthUser('local@example.com', 'Secret#1234');
    await prisma.authAccessUser.create({
      data: {
        email: 'local@example.com',
        approved: true,
        blocked: false,
        isAdmin: false,
      },
    });
    const office = await createOfficeLocation('Berlin');
    const menu = await prisma.menu.create({
      data: { name: 'Pizza', officeLocationId: office.id },
    });
    const poll = await prisma.poll.create({
      data: {
        officeLocationId: office.id,
        description: 'Lunch',
        status: 'finished',
        startedAt: new Date(),
        endsAt: new Date(),
      },
    });
    await prisma.pollVote.create({
      data: {
        pollId: poll.id,
        menuId: menu.id,
        menuName: menu.name,
        nickname: 'Old Local',
        actorKey: 'local@example.com',
        actorEmail: 'local@example.com',
        displayNameSnapshot: 'Old Local',
      },
    });
    const selection = await prisma.foodSelection.create({
      data: {
        officeLocationId: office.id,
        pollId: poll.id,
        menuId: menu.id,
        menuName: menu.name,
        status: 'completed',
        startedAt: new Date(),
        endsAt: new Date(),
        completedAt: new Date(),
      },
    });
    await prisma.foodOrder.create({
      data: {
        selectionId: selection.id,
        nickname: 'Old Local',
        actorKey: 'local@example.com',
        actorEmail: 'local@example.com',
        displayNameSnapshot: 'Old Local',
        itemName: 'Margherita',
      },
    });

    await expect(deleteLocalUserByAdmin('local@example.com', 'admin@example.com')).resolves.toEqual({
      email: 'local@example.com',
    });
    await expect(prisma.localAuthUser.findUnique({ where: { email: 'local@example.com' } })).resolves.toBeNull();
    await expect(prisma.authAccessUser.findUnique({ where: { email: 'local@example.com' } })).resolves.toBeNull();
    const historicalVote = await prisma.pollVote.findFirstOrThrow();
    expect(historicalVote.displayNameSnapshot).toBe('Old Local');
    expect(historicalVote.actorEmail).toBe('local@example.com');
    const historicalOrder = await prisma.foodOrder.findFirstOrThrow();
    expect(historicalOrder.displayNameSnapshot).toBe('Old Local');
    expect(historicalOrder.actorEmail).toBe('local@example.com');
  });

  it('rejects local admin email/delete changes for Entra and bootstrap admin accounts', async () => {
    process.env.AUTH_ADMIN_EMAIL = 'admin@example.com';
    await syncEntraDisplayName('entra@example.com', 'Entra User');

    await expect(updateLocalUserEmailByAdmin('entra@example.com', 'renamed@example.com')).rejects.toThrow(
      'Microsoft Entra accounts cannot be edited locally',
    );
    await expect(deleteLocalUserByAdmin('entra@example.com', 'admin@example.com')).rejects.toThrow(
      'Microsoft Entra accounts cannot be deleted locally',
    );
    await expect(deleteLocalUserByAdmin('admin@example.com', 'other@example.com')).rejects.toThrow(
      'Configured admin cannot be deleted',
    );
  });
});
