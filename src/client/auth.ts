import { appBasePath } from './config.js';

export function getRouterBasename(): string | undefined {
  return appBasePath || undefined;
}

export function isExternalAuthEnabled(): boolean {
  return localStorage.getItem('team_lunch_auth_method') !== null;
}

export function isAdminAuthenticatedUser(): boolean {
  if (!isExternalAuthEnabled()) {
    return true;
  }
  return localStorage.getItem('team_lunch_auth_role') === 'admin';
}

export function getAuthenticatedActorKey(): string | null {
  const value = localStorage.getItem('team_lunch_actor_key')?.trim().toLowerCase() ?? '';
  return value.length > 0 ? value : null;
}

export function getAuthenticatedDisplayLabel(): string | null {
  const displayName = localStorage.getItem('team_lunch_display_name')?.trim() ?? '';
  if (displayName.length > 0) {
    return displayName;
  }
  const actor = localStorage.getItem('team_lunch_actor_key')?.trim() ?? '';
  return actor.length > 0 ? actor : null;
}

export function getAuthenticatedAuthMethod(): 'entra' | 'local' | null {
  const value = localStorage.getItem('team_lunch_auth_method');
  return value === 'entra' || value === 'local' ? value : null;
}

export function isCreatorAuthenticatedUser(createdBy: string | null | undefined): boolean {
  if (!isExternalAuthEnabled()) {
    return true;
  }

  const actorKey = getAuthenticatedActorKey();
  const normalizedCreatedBy = createdBy?.trim().toLowerCase() ?? '';
  return actorKey !== null && normalizedCreatedBy.length > 0 && actorKey === normalizedCreatedBy;
}
