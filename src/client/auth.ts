import { appBasePath } from './config.js';

export const ACTOR_KEY_STORAGE_KEY = 'team_lunch_actor_key';
export const DISPLAY_NAME_STORAGE_KEY = 'team_lunch_display_name';
export const AUTH_METHOD_STORAGE_KEY = 'team_lunch_auth_method';
export const AUTH_ROLE_STORAGE_KEY = 'team_lunch_auth_role';
export const AUTH_PROFILE_UPDATED_EVENT = 'team_lunch_auth_profile_updated';

export function getRouterBasename(): string | undefined {
  return appBasePath || undefined;
}

export function isExternalAuthEnabled(): boolean {
  return localStorage.getItem(AUTH_METHOD_STORAGE_KEY) !== null;
}

export function isAdminAuthenticatedUser(): boolean {
  if (!isExternalAuthEnabled()) {
    return true;
  }
  return localStorage.getItem(AUTH_ROLE_STORAGE_KEY) === 'admin';
}

export function getAuthenticatedActorKey(): string | null {
  const value = localStorage.getItem(ACTOR_KEY_STORAGE_KEY)?.trim().toLowerCase() ?? '';
  return value.length > 0 ? value : null;
}

export function getAuthenticatedDisplayLabel(): string | null {
  const displayName = localStorage.getItem(DISPLAY_NAME_STORAGE_KEY)?.trim() ?? '';
  if (displayName.length > 0) {
    return displayName;
  }
  const actor = localStorage.getItem(ACTOR_KEY_STORAGE_KEY)?.trim() ?? '';
  return actor.length > 0 ? actor : null;
}

export function getAuthenticatedAuthMethod(): 'entra' | 'local' | null {
  const value = localStorage.getItem(AUTH_METHOD_STORAGE_KEY);
  return value === 'entra' || value === 'local' ? value : null;
}

export function setAuthenticatedDisplayName(displayName: string | null | undefined): void {
  const normalized = displayName?.trim() ?? '';
  if (normalized.length > 0) {
    localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, normalized);
  } else {
    localStorage.removeItem(DISPLAY_NAME_STORAGE_KEY);
  }
  window.dispatchEvent(new Event(AUTH_PROFILE_UPDATED_EVENT));
}

export function isCreatorAuthenticatedUser(createdBy: string | null | undefined): boolean {
  if (!isExternalAuthEnabled()) {
    return true;
  }

  const actorKey = getAuthenticatedActorKey();
  const normalizedCreatedBy = createdBy?.trim().toLowerCase() ?? '';
  return actorKey !== null && normalizedCreatedBy.length > 0 && actorKey === normalizedCreatedBy;
}
