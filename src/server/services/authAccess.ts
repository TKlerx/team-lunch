import { createHash } from 'node:crypto';
import prisma from '../db.js';
import { serviceError } from '../routes/routeUtils.js';
import { normalizeEmail } from './localAuth.js';
import { isLikelyEmail, sendEmail } from './notificationEmail.js';
import { validateOfficeLocationId } from './officeLocation.js';

const DB_PROBE_TIMEOUT_MS = 500;

type AuthAccessEntry = {
  id: string;
  email: string;
  approved: boolean;
  isAdmin: boolean;
  blocked: boolean;
  officeLocationId: string | null;
  requestedAt: Date;
  approvedAt: Date | null;
  blockedAt: Date | null;
  updatedAt: Date;
  officeLocation: {
    id: string;
    key: string;
    name: string;
    isActive: boolean;
  } | null;
  officeMemberships: Array<{
    officeLocation: {
      id: string;
      key: string;
      name: string;
      isActive: boolean;
    };
  }>;
};

const authAccessUserModel = (prisma as any).authAccessUser as {
  findUnique: (args: {
    where: { email: string };
    select?: {
      id?: true;
      email?: true;
      approved?: true;
      isAdmin?: true;
      blocked?: true;
      officeLocationId?: true;
      requestedAt?: true;
      approvedAt?: true;
      blockedAt?: true;
      updatedAt?: true;
      officeLocation?: {
        select: {
          id: true;
          key: true;
          name: true;
          isActive: true;
        };
      };
      officeMemberships?: {
        select: {
          officeLocation: {
            select: {
              id: true;
              key: true;
              name: true;
              isActive: true;
            };
          };
        };
      };
    };
  }) => Promise<
    Pick<
      AuthAccessEntry,
      | 'id'
      | 'email'
      | 'approved'
      | 'isAdmin'
      | 'blocked'
      | 'officeLocationId'
      | 'requestedAt'
      | 'approvedAt'
      | 'blockedAt'
      | 'updatedAt'
      | 'officeLocation'
      | 'officeMemberships'
    > | null
  >;
  upsert: (args: {
    where: { email: string };
    create: {
      email: string;
      approved: boolean;
      isAdmin?: boolean;
      blocked?: boolean;
      officeLocationId?: string | null;
      requestedAt?: Date;
      approvedAt?: Date;
      blockedAt?: Date | null;
    };
    update: {
      approved?: boolean;
      isAdmin?: boolean;
      blocked?: boolean;
      officeLocationId?: string | null;
      approvedAt?: Date;
      blockedAt?: Date | null;
      updatedAt: Date;
    };
  }) => Promise<unknown>;
  update: (args: {
    where: { email: string };
    data: {
      approved?: boolean;
      isAdmin?: boolean;
      blocked?: boolean;
      officeLocationId?: string | null;
      approvedAt?: Date | null;
      blockedAt?: Date | null;
      updatedAt: Date;
    };
  }) => Promise<unknown>;
  findMany: (args: {
    where?: { approved?: boolean; blocked?: boolean };
    orderBy: { requestedAt: 'asc' | 'desc' };
    select: {
      id: true;
      email: true;
      approved: true;
      isAdmin: true;
      blocked: true;
      officeLocationId: true;
      requestedAt: true;
      approvedAt: true;
      blockedAt: true;
      updatedAt: true;
      officeLocation: {
        select: {
          id: true;
          key: true;
          name: true;
          isActive: true;
        };
      };
      officeMemberships: {
        select: {
          officeLocation: {
            select: {
              id: true;
              key: true;
              name: true;
              isActive: true;
            };
          };
        };
      };
    };
  }) => Promise<AuthAccessEntry[]>;
  delete: (args: { where: { email: string } }) => Promise<unknown>;
};

const BLOCKED_USER_MESSAGE = 'Your account has been blocked by an administrator';

function getAuditLogDelegate():
  | { create: (args: { data: { event: string; actorEmail: string | null; targetType: string; targetId: string } }) => Promise<unknown> }
  | null {
  const delegate = (prisma as unknown as {
    auditLog?: {
      create?: (args: {
        data: { event: string; actorEmail: string | null; targetType: string; targetId: string };
      }) => Promise<unknown>;
    };
  }).auditLog;
  if (!delegate || typeof delegate.create !== 'function') {
    return null;
  }
  return { create: delegate.create.bind(delegate) };
}

async function writeAuthAccessAuditLog(
  event: 'user_blocked_by_admin' | 'user_unblocked_by_admin',
  actorEmail: string | null,
  targetEmail: string,
): Promise<void> {
  const delegate = getAuditLogDelegate();
  if (!delegate) {
    return;
  }

  try {
    const digest = createHash('sha1').update(targetEmail).digest('hex');
    const targetId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
    await delegate.create({
      data: {
        event,
        actorEmail,
        targetType: 'auth_access_user',
        targetId,
      },
    });
  } catch {
    // Best effort only.
  }
}

export function getConfiguredAdminEmail(): string | null {
  const configured = normalizeEmail(process.env.AUTH_ADMIN_EMAIL?.trim() ?? '');
  return configured.length > 0 ? configured : null;
}

export function isApprovalWorkflowEnabled(): boolean {
  return getConfiguredAdminEmail() !== null;
}

export function isAdminUser(email: string): boolean {
  const adminEmail = getConfiguredAdminEmail();
  return !!adminEmail && normalizeEmail(email) === adminEmail;
}

async function listAdminReminderRecipients(): Promise<string[]> {
  const configuredAdmin = getConfiguredAdminEmail();
  const extras = (process.env.AUTH_ADMIN_REMINDER_EMAILS ?? '')
    .split(',')
    .map((entry) => normalizeEmail(entry))
    .filter((entry) => entry.length > 0 && isLikelyEmail(entry));

  const deduped = new Set<string>(extras);
  if (configuredAdmin && isLikelyEmail(configuredAdmin)) {
    deduped.add(configuredAdmin);
  }

  try {
    const rows = await Promise.race([
      authAccessUserModel.findMany({
        where: { approved: true, blocked: false },
        orderBy: { requestedAt: 'asc' },
        select: {
          id: true,
          email: true,
          approved: true,
          isAdmin: true,
          blocked: true,
          officeLocationId: true,
          requestedAt: true,
          approvedAt: true,
          blockedAt: true,
          updatedAt: true,
          officeLocation: {
            select: {
              id: true,
              key: true,
              name: true,
              isActive: true,
            },
          },
          officeMemberships: {
            select: {
              officeLocation: {
                select: {
                  id: true,
                  key: true,
                  name: true,
                  isActive: true,
                },
              },
            },
          },
        },
      }),
      new Promise<Array<AuthAccessEntry>>((resolve) => {
        setTimeout(() => resolve([]), DB_PROBE_TIMEOUT_MS);
      }),
    ]);

    for (const row of rows) {
      if (row.isAdmin || isAdminUser(row.email)) {
        const normalized = normalizeEmail(row.email);
        if (isLikelyEmail(normalized)) {
          deduped.add(normalized);
        }
      }
    }
  } catch {
    // Best effort only.
  }

  return [...deduped];
}

async function notifyPendingApproval(requestedEmail: string): Promise<void> {
  const recipients = await listAdminReminderRecipients();
  if (recipients.length > 0) {
    await sendEmail({
      to: recipients,
      subject: '[Team Lunch] New user pending approval',
      text: `A user registered and is waiting for approval: ${requestedEmail}`,
    });
  }

  if (isLikelyEmail(requestedEmail)) {
    await sendEmail({
      to: requestedEmail,
      subject: '[Team Lunch] Approval pending',
      text: 'Your account is pending admin approval. You can sign in after an admin approves your access.',
    });
  }
}

function validateManagedEmail(email: string): string {
  const normalized = normalizeEmail(email);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalized) || normalized.length > 255) {
    throw serviceError('Invalid email format', 400);
  }
  return normalized;
}

function dedupeOfficeLocations(
  locations: Array<{ id: string; key: string; name: string; isActive: boolean }>,
): Array<{ id: string; key: string; name: string; isActive: boolean }> {
  const seen = new Set<string>();
  const deduped: Array<{ id: string; key: string; name: string; isActive: boolean }> = [];
  for (const location of locations) {
    if (seen.has(location.id)) {
      continue;
    }
    seen.add(location.id);
    deduped.push(location);
  }
  return deduped;
}

function getAssignedOfficeLocations(entry: {
  officeLocationId: string | null;
  officeLocation: { id: string; key: string; name: string; isActive: boolean } | null;
  officeMemberships?: Array<{
    officeLocation: { id: string; key: string; name: string; isActive: boolean };
  }>;
}): Array<{ id: string; key: string; name: string; isActive: boolean }> {
  return dedupeOfficeLocations([
    ...(entry.officeLocation ? [entry.officeLocation] : []),
    ...((entry.officeMemberships ?? []).map((membership) => membership.officeLocation)),
  ]);
}

async function syncUserOfficeMemberships(
  authAccessUserId: string,
  officeLocationIds: string[],
): Promise<void> {
  await prisma.authAccessUserOffice.deleteMany({
    where: {
      authAccessUserId,
      officeLocationId: { notIn: officeLocationIds.length > 0 ? officeLocationIds : ['00000000-0000-0000-0000-000000000000'] },
    },
  });

  if (officeLocationIds.length === 0) {
    return;
  }

  await prisma.authAccessUserOffice.createMany({
    data: officeLocationIds.map((officeLocationId) => ({
      authAccessUserId,
      officeLocationId,
    })),
    skipDuplicates: true,
  });
}

async function validateOfficeLocationIds(officeLocationIds: string[]): Promise<string[]> {
  const normalizedOfficeLocationIds = [...new Set(
    officeLocationIds.map((officeLocationId) => officeLocationId.trim()).filter((officeLocationId) => officeLocationId.length > 0),
  )];

  for (const officeLocationId of normalizedOfficeLocationIds) {
    await validateOfficeLocationId(officeLocationId);
  }

  return normalizedOfficeLocationIds;
}

async function getAuthAccessEntryByEmail(email: string): Promise<AuthAccessEntry | null> {
  return authAccessUserModel.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      approved: true,
      isAdmin: true,
      blocked: true,
      officeLocationId: true,
      requestedAt: true,
      approvedAt: true,
      blockedAt: true,
      updatedAt: true,
      officeLocation: {
        select: {
          id: true,
          key: true,
          name: true,
          isActive: true,
        },
      },
      officeMemberships: {
        select: {
          officeLocation: {
            select: {
              id: true,
              key: true,
              name: true,
              isActive: true,
            },
          },
        },
      },
    },
  });
}

async function ensureBootstrapAdminAccessUser(email: string): Promise<{
  id: string;
  isAdmin: boolean;
  officeLocationId: string | null;
}> {
  const existing = await prisma.authAccessUser.findUnique({
    where: { email },
    select: { id: true, isAdmin: true, officeLocationId: true },
  });
  if (existing) {
    if (!existing.isAdmin) {
      return prisma.authAccessUser.update({
        where: { email },
        data: {
          approved: true,
          isAdmin: true,
          blocked: false,
          blockedAt: null,
          approvedAt: new Date(),
          updatedAt: new Date(),
        },
        select: { id: true, isAdmin: true, officeLocationId: true },
      });
    }
    return existing;
  }

  return prisma.authAccessUser.create({
    data: {
      email,
      approved: true,
      isAdmin: true,
      blocked: false,
      approvedAt: new Date(),
    },
    select: { id: true, isAdmin: true, officeLocationId: true },
  });
}

export async function ensurePendingAccessRequest(email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  let alreadyExisted = false;

  try {
    const existing = await Promise.race([
      authAccessUserModel.findUnique({ where: { email: normalized } }),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), DB_PROBE_TIMEOUT_MS);
      }),
    ]);
    alreadyExisted = !!existing;
  } catch {
    // Continue with best-effort upsert below.
  }

  try {
    await Promise.race([
      authAccessUserModel.upsert({
        where: { email: normalized },
        create: { email: normalized, approved: false, requestedAt: new Date() },
        update: { updatedAt: new Date() },
      }),
      new Promise<'timeout'>((resolve) => {
        setTimeout(() => resolve('timeout'), DB_PROBE_TIMEOUT_MS);
      }),
    ]);
    return !alreadyExisted;
  } catch {
    // Ignore DB errors in environments without migrated auth_access_users table.
    return false;
  }
}

export async function isApprovedUser(email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  try {
    const entry = await Promise.race([
      authAccessUserModel.findUnique({
        where: { email: normalized },
        select: {
          id: true,
          email: true,
          approved: true,
          isAdmin: true,
          blocked: true,
          officeLocationId: true,
          officeLocation: {
            select: {
              id: true,
              key: true,
              name: true,
              isActive: true,
            },
          },
          officeMemberships: {
            select: {
              officeLocation: {
                select: {
                  id: true,
                  key: true,
                  name: true,
                  isActive: true,
                },
              },
            },
          },
        },
      }),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), DB_PROBE_TIMEOUT_MS);
      }),
    ]);
    return (
      !!entry?.approved &&
      !entry?.blocked &&
      (!!entry?.isAdmin || getAssignedOfficeLocations(entry).length > 0)
    );
  } catch {
    return false;
  }
}

export async function approveUserByAdmin(email: string, officeLocationId: string): Promise<void> {
  const normalized = validateManagedEmail(email);
  const officeLocation = await validateOfficeLocationId(officeLocationId);

  await authAccessUserModel.upsert({
    where: { email: normalized },
    create: {
      email: normalized,
      approved: true,
      officeLocationId: officeLocation.id,
      requestedAt: new Date(),
      approvedAt: new Date(),
      blocked: false,
      blockedAt: null,
    },
    update: { officeLocationId: officeLocation.id, updatedAt: new Date() },
  });

  try {
    await authAccessUserModel.update({
      where: { email: normalized },
      data: {
        approved: true,
        officeLocationId: officeLocation.id,
        approvedAt: new Date(),
        blocked: false,
        blockedAt: null,
        updatedAt: new Date(),
      },
    });
    const approvedUser = await prisma.authAccessUser.findUnique({
      where: { email: normalized },
      select: { id: true },
    });
    if (!approvedUser) {
      throw serviceError('Failed to approve user', 500);
    }
    await syncUserOfficeMemberships(approvedUser.id, [officeLocation.id]);
  } catch {
    throw serviceError('Failed to approve user', 500);
  }
}

export async function promoteUserByAdmin(email: string): Promise<void> {
  const normalized = validateManagedEmail(email);
  await authAccessUserModel.upsert({
    where: { email: normalized },
    create: {
      email: normalized,
      approved: true,
      isAdmin: true,
      blocked: false,
      requestedAt: new Date(),
      approvedAt: new Date(),
      blockedAt: null,
    },
    update: {
      approved: true,
      isAdmin: true,
      blocked: false,
      approvedAt: new Date(),
      blockedAt: null,
      updatedAt: new Date(),
    },
  });
}

export async function demoteUserByAdmin(email: string, officeLocationId?: string): Promise<void> {
  const normalized = validateManagedEmail(email);
  if (isAdminUser(normalized)) {
    throw serviceError('Configured admin cannot be demoted', 400);
  }

  const existing = await authAccessUserModel.findUnique({
    where: { email: normalized },
    select: {
      id: true,
      email: true,
      approved: true,
      isAdmin: true,
      blocked: true,
      officeLocationId: true,
      officeLocation: {
        select: {
          id: true,
          key: true,
          name: true,
          isActive: true,
        },
      },
      officeMemberships: {
        select: {
          officeLocation: {
            select: {
              id: true,
              key: true,
              name: true,
              isActive: true,
            },
          },
        },
      },
    },
  });
  if (!existing) {
    throw serviceError('User not found', 404);
  }
  const existingAssignedOfficeLocationIds = getAssignedOfficeLocations(existing).map(
    (location) => location.id,
  );
  const requestedOfficeLocationId = officeLocationId
    ? (await validateOfficeLocationId(officeLocationId)).id
    : null;
  const assignedOfficeLocationIds = [
    ...new Set(
      (requestedOfficeLocationId
        ? [...existingAssignedOfficeLocationIds, requestedOfficeLocationId]
        : existingAssignedOfficeLocationIds),
    ),
  ];
  const resolvedOfficeLocationId = requestedOfficeLocationId ?? existing.officeLocationId ?? assignedOfficeLocationIds[0] ?? null;
  if (!resolvedOfficeLocationId || assignedOfficeLocationIds.length === 0) {
    throw serviceError('Office assignment is required before demoting this user', 400);
  }

  try {
    await authAccessUserModel.update({
      where: { email: normalized },
      data: {
        isAdmin: false,
        officeLocationId: resolvedOfficeLocationId,
        updatedAt: new Date(),
      },
    });
    await syncUserOfficeMemberships(existing.id, assignedOfficeLocationIds);
  } catch {
    throw serviceError('User not found', 404);
  }
}

export async function blockUserByAdmin(email: string, actorEmail?: string): Promise<void> {
  const normalized = validateManagedEmail(email);
  if (isAdminUser(normalized)) {
    throw serviceError('Configured admin cannot be blocked', 400);
  }
  if (actorEmail && normalizeEmail(actorEmail) === normalized) {
    throw serviceError('You cannot block your own account', 400);
  }

  await authAccessUserModel.upsert({
    where: { email: normalized },
    create: {
      email: normalized,
      approved: false,
      blocked: true,
      officeLocationId: null,
      requestedAt: new Date(),
      blockedAt: new Date(),
    },
    update: {
      blocked: true,
      blockedAt: new Date(),
      updatedAt: new Date(),
    },
  });

  await writeAuthAccessAuditLog(
    'user_blocked_by_admin',
    actorEmail ? normalizeEmail(actorEmail) : null,
    normalized,
  );
}

export async function unblockUserByAdmin(email: string, actorEmail?: string): Promise<void> {
  const normalized = validateManagedEmail(email);

  try {
    await authAccessUserModel.update({
      where: { email: normalized },
      data: { blocked: false, blockedAt: null, updatedAt: new Date() },
    });
  } catch {
    throw serviceError('User not found', 404);
  }

  await writeAuthAccessAuditLog(
    'user_unblocked_by_admin',
    actorEmail ? normalizeEmail(actorEmail) : null,
    normalized,
  );
}

export async function declineUserByAdmin(email: string): Promise<void> {
  const normalized = validateManagedEmail(email);

  try {
    await authAccessUserModel.delete({
      where: { email: normalized },
    });
  } catch {
    // If there is no pending record, treat it as an idempotent no-op.
  }
}

export async function listPendingAccessRequests(): Promise<Array<{ email: string; requestedAt: string }>> {
  try {
    const rows = await Promise.race([
      authAccessUserModel.findMany({
        where: { approved: false, blocked: false },
        orderBy: { requestedAt: 'asc' },
        select: {
          id: true,
          email: true,
          requestedAt: true,
          approved: true,
          isAdmin: true,
          blocked: true,
          officeLocationId: true,
          approvedAt: true,
          blockedAt: true,
          updatedAt: true,
          officeLocation: {
            select: {
              id: true,
              key: true,
              name: true,
              isActive: true,
            },
          },
          officeMemberships: {
            select: {
              officeLocation: {
                select: {
                  id: true,
                  key: true,
                  name: true,
                  isActive: true,
                },
              },
            },
          },
        },
      }),
      new Promise<Array<AuthAccessEntry>>((resolve) => {
        setTimeout(() => resolve([]), DB_PROBE_TIMEOUT_MS);
      }),
    ]);
    return rows.map((row) => ({ email: row.email, requestedAt: row.requestedAt.toISOString() }));
  } catch {
    return [];
  }
}

export async function listAccessUsers(): Promise<
  Array<{
    email: string;
    approved: boolean;
    isAdmin: boolean;
    blocked: boolean;
    officeLocationId: string | null;
    officeLocationKey: string | null;
    officeLocationName: string | null;
    assignedOfficeLocationIds: string[];
    assignedOfficeLocations: Array<{ id: string; key: string; name: string; isActive: boolean }>;
    requestedAt: string;
    approvedAt: string | null;
    blockedAt: string | null;
    updatedAt: string;
  }>
> {
  try {
    const rows = await Promise.race([
      authAccessUserModel.findMany({
        orderBy: { requestedAt: 'asc' },
        select: {
          id: true,
          email: true,
          approved: true,
          isAdmin: true,
          blocked: true,
          officeLocationId: true,
          requestedAt: true,
          approvedAt: true,
          blockedAt: true,
          updatedAt: true,
          officeLocation: {
            select: {
              id: true,
              key: true,
              name: true,
              isActive: true,
            },
          },
          officeMemberships: {
            select: {
              officeLocation: {
                select: {
                  id: true,
                  key: true,
                  name: true,
                  isActive: true,
                },
              },
            },
          },
        },
      }),
      new Promise<Array<AuthAccessEntry>>((resolve) => {
        setTimeout(() => resolve([]), DB_PROBE_TIMEOUT_MS);
      }),
    ]);
    const configuredAdmin = getConfiguredAdminEmail();
    let rowsWithBootstrapAdmin = rows;
    if (configuredAdmin && !rows.some((row) => row.email === configuredAdmin)) {
      const bootstrapAdminRow = await Promise.race([
        getAuthAccessEntryByEmail(configuredAdmin),
        new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), DB_PROBE_TIMEOUT_MS);
        }),
      ]);
      if (bootstrapAdminRow) {
        rowsWithBootstrapAdmin = [bootstrapAdminRow, ...rows];
      } else {
        rowsWithBootstrapAdmin = [
          {
            id: 'bootstrap-admin',
            email: configuredAdmin,
            approved: true,
            isAdmin: true,
            blocked: false,
            officeLocationId: null,
            requestedAt: new Date(0),
            approvedAt: null,
            blockedAt: null,
            updatedAt: new Date(0),
            officeLocation: null,
            officeMemberships: [],
          },
          ...rows,
        ];
      }
    }
    return rowsWithBootstrapAdmin.map((row) => {
      const assignedOfficeLocations = getAssignedOfficeLocations(row);
      return {
        email: row.email,
        approved: row.approved,
        isAdmin: row.isAdmin || isAdminUser(row.email),
        blocked: row.blocked,
        officeLocationId: row.officeLocationId ?? assignedOfficeLocations[0]?.id ?? null,
        officeLocationKey: row.officeLocation?.key ?? assignedOfficeLocations[0]?.key ?? null,
        officeLocationName: row.officeLocation?.name ?? assignedOfficeLocations[0]?.name ?? null,
        assignedOfficeLocationIds: assignedOfficeLocations.map((location) => location.id),
        assignedOfficeLocations,
        requestedAt: row.requestedAt.toISOString(),
        approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
        blockedAt: row.blockedAt ? row.blockedAt.toISOString() : null,
        updatedAt: row.updatedAt.toISOString(),
      };
    });
  } catch {
    return [];
  }
}

export async function listApprovedAccessUserEmails(officeLocationId?: string): Promise<string[]> {
  try {
    const rows = await Promise.race([
      authAccessUserModel.findMany({
        where: {
          approved: true,
          blocked: false,
        },
        orderBy: { requestedAt: 'asc' },
        select: {
          id: true,
          email: true,
          approved: true,
          isAdmin: true,
          blocked: true,
          officeLocationId: true,
          requestedAt: true,
          approvedAt: true,
          blockedAt: true,
          updatedAt: true,
          officeLocation: {
            select: {
              id: true,
              key: true,
              name: true,
              isActive: true,
            },
          },
          officeMemberships: {
            select: {
              officeLocation: {
                select: {
                  id: true,
                  key: true,
                  name: true,
                  isActive: true,
                },
              },
            },
          },
        },
      }),
      new Promise<Array<AuthAccessEntry>>((resolve) => {
        setTimeout(() => resolve([]), DB_PROBE_TIMEOUT_MS);
      }),
    ]);
    return [
      ...new Set(
        rows
          .filter((row) => {
            if (!officeLocationId) {
              return true;
            }
            if (row.isAdmin || isAdminUser(row.email)) {
              return true;
            }
            return getAssignedOfficeLocations(row).some((location) => location.id === officeLocationId);
          })
          .map((row) => normalizeEmail(row.email))
          .filter((row) => isLikelyEmail(row)),
      ),
    ];
  } catch {
    return [];
  }
}

export async function resolveUserApproval(
  email: string,
): Promise<{
  approvalRequired: boolean;
  isAdmin: boolean;
  approved: boolean;
  blocked: boolean;
  officeLocationId: string | null;
  officeLocationKey: string | null;
  officeLocationName: string | null;
  accessibleOfficeLocationIds: string[];
  accessibleOfficeLocations: Array<{ id: string; key: string; name: string; isActive: boolean }>;
  pendingRequestCreated: boolean;
}> {
  if (!isApprovalWorkflowEnabled()) {
    return {
      approvalRequired: false,
      isAdmin: false,
      approved: true,
      blocked: false,
      officeLocationId: null,
      officeLocationKey: null,
      officeLocationName: null,
      accessibleOfficeLocationIds: [],
      accessibleOfficeLocations: [],
      pendingRequestCreated: false,
    };
  }

  const normalized = normalizeEmail(email);
  if (isAdminUser(normalized)) {
    const entry = await getAuthAccessEntryByEmail(normalized).catch(() => null);
    const assignedOfficeLocations = entry ? getAssignedOfficeLocations(entry) : [];
    const preferredOfficeLocation =
      assignedOfficeLocations.find((location) => location.id === entry?.officeLocationId) ??
      assignedOfficeLocations[0] ??
      null;
    return {
      approvalRequired: true,
      isAdmin: true,
      approved: true,
      blocked: false,
      officeLocationId: preferredOfficeLocation?.id ?? null,
      officeLocationKey: preferredOfficeLocation?.key ?? null,
      officeLocationName: preferredOfficeLocation?.name ?? null,
      accessibleOfficeLocationIds: assignedOfficeLocations.map((location) => location.id),
      accessibleOfficeLocations: assignedOfficeLocations,
      pendingRequestCreated: false,
    };
  }

  try {
    const entry = await Promise.race([
      authAccessUserModel.findUnique({
        where: { email: normalized },
        select: {
          id: true,
          email: true,
          approved: true,
          isAdmin: true,
          blocked: true,
          officeLocationId: true,
          officeLocation: {
            select: {
              id: true,
              key: true,
              name: true,
              isActive: true,
            },
          },
          officeMemberships: {
            select: {
              officeLocation: {
                select: {
                  id: true,
                  key: true,
                  name: true,
                  isActive: true,
                },
              },
            },
          },
        },
      }),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), DB_PROBE_TIMEOUT_MS);
      }),
    ]);
    const assignedOfficeLocations = entry ? getAssignedOfficeLocations(entry) : [];
    const preferredOfficeLocation =
      assignedOfficeLocations.find((location) => location.id === entry?.officeLocationId) ??
      assignedOfficeLocations[0] ??
      null;
    const approved = !!entry?.approved && (!!entry?.isAdmin || assignedOfficeLocations.length > 0);
    const isAdmin = !!entry?.isAdmin;
    const blocked = !!entry?.blocked;
    if (blocked) {
      return {
        approvalRequired: true,
        isAdmin,
        approved: false,
        blocked: true,
        officeLocationId: preferredOfficeLocation?.id ?? null,
        officeLocationKey: preferredOfficeLocation?.key ?? null,
        officeLocationName: preferredOfficeLocation?.name ?? null,
        accessibleOfficeLocationIds: assignedOfficeLocations.map((location) => location.id),
        accessibleOfficeLocations: assignedOfficeLocations,
        pendingRequestCreated: false,
      };
    }
    let pendingRequestCreated = false;
    if (!approved) {
      pendingRequestCreated = await ensurePendingAccessRequest(normalized);
      if (pendingRequestCreated) {
        await notifyPendingApproval(normalized);
      }
    }
    return {
      approvalRequired: true,
      isAdmin,
      approved,
      blocked: false,
      officeLocationId: preferredOfficeLocation?.id ?? null,
      officeLocationKey: preferredOfficeLocation?.key ?? null,
      officeLocationName: preferredOfficeLocation?.name ?? null,
      accessibleOfficeLocationIds: assignedOfficeLocations.map((location) => location.id),
      accessibleOfficeLocations: assignedOfficeLocations,
      pendingRequestCreated,
    };
  } catch {
    const pendingRequestCreated = await ensurePendingAccessRequest(normalized);
    if (pendingRequestCreated) {
      await notifyPendingApproval(normalized);
    }
    return {
      approvalRequired: true,
      isAdmin: false,
      approved: false,
      blocked: false,
      officeLocationId: null,
      officeLocationKey: null,
      officeLocationName: null,
      accessibleOfficeLocationIds: [],
      accessibleOfficeLocations: [],
      pendingRequestCreated,
    };
  }
}

export async function assignUserOfficeByAdmin(email: string, officeLocationId: string): Promise<void> {
  await assignUserOfficesByAdmin(email, [officeLocationId], officeLocationId);
}

export async function assignUserOfficesByAdmin(
  email: string,
  officeLocationIds: string[],
  preferredOfficeLocationId?: string,
): Promise<void> {
  const normalized = validateManagedEmail(email);
  const existing = isAdminUser(normalized)
    ? await ensureBootstrapAdminAccessUser(normalized)
    : await prisma.authAccessUser.findUnique({
        where: { email: normalized },
        select: { id: true, isAdmin: true, officeLocationId: true },
      });
  if (!existing) {
    throw serviceError('User not found', 404);
  }

  const normalizedOfficeLocationIds = await validateOfficeLocationIds(officeLocationIds);
  if (!existing.isAdmin && normalizedOfficeLocationIds.length === 0) {
    throw serviceError('At least one office assignment is required', 400);
  }

  let resolvedPreferredOfficeLocationId = preferredOfficeLocationId?.trim() || existing.officeLocationId;
  if (resolvedPreferredOfficeLocationId) {
    resolvedPreferredOfficeLocationId = (await validateOfficeLocationId(resolvedPreferredOfficeLocationId)).id;
  }
  if (resolvedPreferredOfficeLocationId && !normalizedOfficeLocationIds.includes(resolvedPreferredOfficeLocationId)) {
    throw serviceError('Preferred office must be one of the assigned offices', 400);
  }
  if (!resolvedPreferredOfficeLocationId && normalizedOfficeLocationIds.length > 0) {
    resolvedPreferredOfficeLocationId = normalizedOfficeLocationIds[0];
  }

  await prisma.authAccessUser.update({
    where: { email: normalized },
    data: {
      officeLocationId: resolvedPreferredOfficeLocationId ?? null,
      updatedAt: new Date(),
    },
  });
  await syncUserOfficeMemberships(existing.id, normalizedOfficeLocationIds);
}

export function getBlockedUserMessage(): string {
  return BLOCKED_USER_MESSAGE;
}
