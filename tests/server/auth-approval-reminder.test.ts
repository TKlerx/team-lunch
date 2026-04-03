import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanDatabase, disconnectDatabase } from './helpers/db.js';

vi.mock('../../src/server/services/notificationEmail.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
  isLikelyEmail: vi.fn((value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)),
}));

import {
  approveUserByAdmin,
  demoteUserByAdmin,
  promoteUserByAdmin,
  resolveUserApproval,
} from '../../src/server/services/authAccess.js';
import { createOfficeLocation, ensureDefaultOfficeLocation } from '../../src/server/services/officeLocation.js';
import { sendEmail } from '../../src/server/services/notificationEmail.js';

describe('auth approval reminder emails', () => {
  const originalEnv = {
    AUTH_ADMIN_EMAIL: process.env.AUTH_ADMIN_EMAIL,
    AUTH_ADMIN_REMINDER_EMAILS: process.env.AUTH_ADMIN_REMINDER_EMAILS,
  };

  beforeEach(async () => {
    await cleanDatabase();
    vi.clearAllMocks();
    process.env.AUTH_ADMIN_EMAIL = 'admin@company.com';
    delete process.env.AUTH_ADMIN_REMINDER_EMAILS;
  });

  afterAll(async () => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    await cleanDatabase();
    await disconnectDatabase();
  });

  it('sends approval pending reminder only when request is first created', async () => {
    const defaultOffice = await ensureDefaultOfficeLocation();
    await promoteUserByAdmin('admin.two@company.com');
    await approveUserByAdmin('member@company.com', defaultOffice.id);

    const first = await resolveUserApproval('new.user@company.com');
    expect(first.pendingRequestCreated).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        to: expect.arrayContaining(['admin@company.com', 'admin.two@company.com']),
      }),
    );

    const second = await resolveUserApproval('new.user@company.com');
    expect(second.pendingRequestCreated).toBe(false);
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it('demotes an unassigned admin when an office is provided during demotion', async () => {
    const berlin = await createOfficeLocation('Berlin');
    await promoteUserByAdmin('floating.admin@company.com');

    await demoteUserByAdmin('floating.admin@company.com', berlin.id);

    const approval = await resolveUserApproval('floating.admin@company.com');
    expect(approval.isAdmin).toBe(false);
    expect(approval.approved).toBe(true);
    expect(approval.officeLocationId).toBe(berlin.id);
    expect(approval.officeLocationName).toBe('Berlin');
  });
});
