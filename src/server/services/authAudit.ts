import prisma from '../db.js';
import { normalizeEmail } from './localAuth.js';

export type AuthAuditEvent =
  | 'auth_profile_created'
  | 'auth_profile_deleted'
  | 'auth_profile_field_updated'
  | 'auth_access_approved'
  | 'auth_access_declined'
  | 'auth_access_blocked'
  | 'auth_access_unblocked'
  | 'auth_access_promoted'
  | 'auth_access_demoted'
  | 'local_login_succeeded'
  | 'local_login_failed'
  | 'entra_login_succeeded'
  | 'entra_login_failed'
  | 'local_credentials_generated';

type AuthAuditInput = {
  event: AuthAuditEvent;
  actorEmail?: string | null;
  targetEmail?: string | null;
  targetType?: string;
  field?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  metadata?: Record<string, unknown>;
};

function normalizeOptionalEmail(value: string | null | undefined): string | null {
  const normalized = normalizeEmail(value ?? '');
  return normalized.length > 0 ? normalized : null;
}

function serializeValue(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

export async function recordAuthAuditLog(input: AuthAuditInput): Promise<void> {
  const delegate = (prisma as unknown as {
    authAuditLog?: {
      create?: (args: {
        data: {
          event: string;
          actorEmail: string | null;
          targetEmail: string | null;
          targetType: string;
          field: string | null;
          oldValue: string | null;
          newValue: string | null;
          metadata: Record<string, unknown>;
        };
      }) => Promise<unknown>;
    };
  }).authAuditLog;
  if (!delegate?.create) {
    return;
  }

  await delegate.create({
    data: {
      event: input.event,
      actorEmail: normalizeOptionalEmail(input.actorEmail),
      targetEmail: normalizeOptionalEmail(input.targetEmail),
      targetType: input.targetType ?? 'auth_user',
      field: input.field ?? null,
      oldValue: serializeValue(input.oldValue),
      newValue: serializeValue(input.newValue),
      metadata: input.metadata ?? {},
    },
  });
}
