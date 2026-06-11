import { getAuthSessionFromCookieHeader, type AuthMethod } from '../services/authSession.js';
import {
  getAuthDisplayProfile,
  getBlockedUserMessage,
  resolveUserApproval,
} from '../services/authAccess.js';
import { serviceError } from './routeUtils.js';

export type AuthenticatedActor = {
  actorKey: string;
  actorEmail: string;
  displayNameSnapshot: string;
  isAdmin: boolean;
  method: AuthMethod;
};

export async function requireAuthenticatedActor(
  cookieHeader: string | undefined,
  testFallbackLabel?: string,
): Promise<AuthenticatedActor> {
  const session = getAuthSessionFromCookieHeader(cookieHeader);
  if (!session) {
    const fallback = testFallbackLabel?.trim();
    if (process.env.NODE_ENV === 'test' && process.env.AUTHZ_ENFORCE_IDENTITY !== 'true' && fallback) {
      return {
        actorKey: fallback.toLowerCase(),
        actorEmail: fallback.includes('@') ? fallback.toLowerCase() : fallback,
        displayNameSnapshot: fallback,
        isAdmin: true,
        method: 'local',
      };
    }
    throw serviceError('Authentication required', 401);
  }

  const approval = await resolveUserApproval(session.username);
  if (approval.blocked) {
    throw serviceError(getBlockedUserMessage(), 403);
  }
  if (approval.approvalRequired && !approval.approved && !approval.isAdmin) {
    throw serviceError('User is awaiting approval', 403);
  }

  const profile = await getAuthDisplayProfile(session.username);
  return {
    actorKey: session.username.trim().toLowerCase(),
    actorEmail: profile.email,
    displayNameSnapshot: profile.displayNameSnapshot,
    isAdmin: approval.isAdmin,
    method: session.method,
  };
}
