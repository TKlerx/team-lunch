import { getAuthSessionFromCookieHeader } from './authSession.js';
import { getBlockedUserMessage, resolveUserApproval } from './authAccess.js';
import { ensureDefaultOfficeLocation, validateOfficeLocationId } from './officeLocation.js';
import { serviceError } from '../routes/routeUtils.js';

export function readRequestedOfficeLocationId(query: unknown): string | undefined {
  if (!query || typeof query !== 'object') {
    return undefined;
  }

  const candidate = (query as Record<string, unknown>).officeLocationId;
  if (typeof candidate !== 'string') {
    return undefined;
  }

  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function resolveOfficeLocationIdFromCookie(
  cookieHeader: string | undefined,
  requestedOfficeLocationId?: string,
): Promise<string> {
  const session = getAuthSessionFromCookieHeader(cookieHeader);
  if (!session) {
    return (await ensureDefaultOfficeLocation()).id;
  }

  const approval = await resolveUserApproval(session.username);
  if (approval.blocked) {
    throw serviceError(getBlockedUserMessage(), 403);
  }
  if (approval.approvalRequired && !approval.approved && !approval.isAdmin) {
    throw serviceError('User is awaiting approval', 403);
  }
  if (approval.isAdmin) {
    if (requestedOfficeLocationId?.trim()) {
      return (await validateOfficeLocationId(requestedOfficeLocationId)).id;
    }
    if (approval.officeLocationId) {
      return approval.officeLocationId;
    }

    return (await ensureDefaultOfficeLocation()).id;
  }
  if (requestedOfficeLocationId?.trim()) {
    if (approval.accessibleOfficeLocationIds.includes(requestedOfficeLocationId.trim())) {
      return requestedOfficeLocationId.trim();
    }
    throw serviceError('Requested office is not assigned to the user', 403);
  }
  if (approval.officeLocationId) {
    return approval.officeLocationId;
  }
  if (approval.accessibleOfficeLocationIds.length > 0) {
    return approval.accessibleOfficeLocationIds[0];
  }

  // Unauthenticated nickname mode still uses the legacy default office.
  throw serviceError('No office assignment available for this user', 403);
}
