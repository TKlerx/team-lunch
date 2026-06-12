import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import prisma from '../../src/server/db.js';
import { buildApp } from '../../src/server/index.js';
import {
  approveUserByAdmin,
  deleteLocalUserByAdmin,
  syncEntraDisplayName,
  updateLocalDisplayName,
} from '../../src/server/services/authAccess.js';
import { upsertLocalAuthUser } from '../../src/server/services/localAuth.js';
import { createOfficeLocation } from '../../src/server/services/officeLocation.js';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';

describe('auth audit history', () => {
  const originalEnv = {
    AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
    AUTH_ADMIN_EMAIL: process.env.AUTH_ADMIN_EMAIL,
  };

  beforeEach(async () => {
    process.env.AUTH_SESSION_SECRET = '12345678901234567890123456789012';
    process.env.AUTH_ADMIN_EMAIL = 'admin@example.com';
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

  afterAll(async () => {
    await cleanDatabase();
    await disconnectDatabase();
  });

  it('writes profile create, edit, and delete audit rows', async () => {
    await syncEntraDisplayName('entra@example.com', 'Entra User');
    await upsertLocalAuthUser('local@example.com', 'Secret#1234');
    await prisma.authAccessUser.create({
      data: {
        email: 'local@example.com',
        approved: true,
        blocked: false,
        isAdmin: false,
      },
    });
    await updateLocalDisplayName('local@example.com', 'Local User', 'local@example.com');
    await deleteLocalUserByAdmin('local@example.com', 'admin@example.com');

    const rows = await prisma.authAuditLog.findMany({
      orderBy: { createdAt: 'asc' },
    });

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'auth_profile_created',
          actorEmail: 'entra@example.com',
          targetEmail: 'entra@example.com',
        }),
        expect.objectContaining({
          event: 'auth_profile_field_updated',
          actorEmail: 'local@example.com',
          targetEmail: 'local@example.com',
          field: 'displayName',
          oldValue: null,
          newValue: 'Local User',
        }),
        expect.objectContaining({
          event: 'auth_profile_deleted',
          actorEmail: 'admin@example.com',
          targetEmail: 'local@example.com',
        }),
      ]),
    );
  });

  it('writes access approval audit rows with structured metadata', async () => {
    const office = await createOfficeLocation('Berlin');

    await approveUserByAdmin('member@example.com', office.id, 'admin@example.com');

    await expect(prisma.authAuditLog.findFirst({
      where: { event: 'auth_access_approved', targetEmail: 'member@example.com' },
    })).resolves.toMatchObject({
      actorEmail: 'admin@example.com',
      field: 'approved',
      oldValue: 'false',
      newValue: 'true',
      metadata: expect.objectContaining({ officeLocationId: office.id }),
    });
  });

  it('writes local login success and failure audit rows', async () => {
    await upsertLocalAuthUser('local@example.com', 'Secret#1234');
    const app = await buildApp();

    await app.inject({
      method: 'POST',
      url: '/api/auth/local/login',
      payload: { username: 'local@example.com', password: 'wrong-password' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/auth/local/login',
      payload: { username: 'local@example.com', password: 'Secret#1234' },
    });

    await expect(prisma.authAuditLog.findMany({
      where: { targetEmail: 'local@example.com' },
      orderBy: { createdAt: 'asc' },
    })).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'local_login_failed',
          metadata: expect.objectContaining({ reason: 'Invalid username or password' }),
        }),
        expect.objectContaining({
          event: 'local_login_succeeded',
          actorEmail: 'local@example.com',
        }),
      ]),
    );
    await app.close();
  });

  it('writes Entra callback failure audit rows with known reason metadata', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/entra/callback',
    });

    expect(response.statusCode).toBe(503);
    await expect(prisma.authAuditLog.findFirst({
      where: { event: 'entra_login_failed' },
    })).resolves.toMatchObject({
      metadata: expect.objectContaining({
        reason: 'Entra authentication is not configured',
      }),
    });
    await app.close();
  });
});
