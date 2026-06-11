import { beforeEach, describe, expect, it } from 'vitest';
import prisma from '../../src/server/db.js';
import { cleanDatabase } from './helpers/db.js';
import {
  getAuthDisplayProfile,
  syncEntraDisplayName,
  updateLocalDisplayName,
} from '../../src/server/services/authAccess.js';
import { upsertLocalAuthUser } from '../../src/server/services/localAuth.js';

describe('display name identity services', () => {
  beforeEach(async () => {
    await cleanDatabase();
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
});
