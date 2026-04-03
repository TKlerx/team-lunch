function normalizeBasePath(value: string | undefined): string {
  if (!value || value === '/') {
    return '';
  }

  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.endsWith('/')
    ? withLeadingSlash.slice(0, Math.max(1, withLeadingSlash.length - 1))
    : withLeadingSlash;
}

export const appBasePath = normalizeBasePath(import.meta.env.BASE_URL);
export const ADMIN_OFFICE_LOCATION_STORAGE_KEY = 'team_lunch_admin_office_location_id';
const AUTH_ROLE_STORAGE_KEY = 'team_lunch_auth_role';

export function withBasePath(path: string): string {
  if (!path.startsWith('/')) {
    throw new Error(`Expected absolute path, got "${path}"`);
  }
  return `${appBasePath}${path}`;
}

export function getStoredAdminOfficeLocationId(): string | null {
  try {
    const role = localStorage.getItem(AUTH_ROLE_STORAGE_KEY);
    if (role !== 'admin') {
      return null;
    }

    const stored = localStorage.getItem(ADMIN_OFFICE_LOCATION_STORAGE_KEY)?.trim() ?? '';
    return stored.length > 0 ? stored : null;
  } catch {
    return null;
  }
}

export function setStoredAdminOfficeLocationId(officeLocationId: string | null): void {
  try {
    if (!officeLocationId) {
      localStorage.removeItem(ADMIN_OFFICE_LOCATION_STORAGE_KEY);
      return;
    }

    localStorage.setItem(ADMIN_OFFICE_LOCATION_STORAGE_KEY, officeLocationId);
  } catch {
    // Ignore storage failures.
  }
}

export function withOfficeLocationContext(
  path: string,
  officeLocationId?: string | null,
): string {
  const resolvedOfficeLocationId = officeLocationId?.trim() || getStoredAdminOfficeLocationId();
  const baseUrl = withBasePath(path);
  if (!resolvedOfficeLocationId) {
    return baseUrl;
  }

  const url = new URL(baseUrl, window.location.origin);
  url.searchParams.set('officeLocationId', resolvedOfficeLocationId);
  return `${url.pathname}${url.search}`;
}
