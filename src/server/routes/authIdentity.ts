import { getAuthSessionFromCookieHeader, type AuthMethod } from '../services/authSession.js';
import {
  getAuthDisplayProfile,
  getBlockedUserMessage,
  resolveUserApproval,
} from '../services/authAccess.js';
import { localAuthUserExists } from '../services/localAuth.js';
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
): Promise<AuthenticatedActor> {
  const session = getAuthSessionFromCookieHeader(cookieHeader);
  if (!session) {
    throw serviceError('Authentication required', 401);
  }
  if (session.method === 'local' && !(await localAuthUserExists(session.username))) {
    throw serviceError('Session expired', 401);
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
