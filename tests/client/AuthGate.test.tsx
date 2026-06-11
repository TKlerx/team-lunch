import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import AuthGate from '../../src/client/components/AuthGate.js';
import type { OfficeLocation } from '../../src/lib/types.js';

type AuthState = {
  entraEnabled: boolean;
  localEnabled: boolean;
  authenticated: boolean;
  user: { username: string; method: 'entra' | 'local' } | null;
  officeLocation: { id: string; key: string; name: string } | null;
  officeLocations: Array<{ id: string; key: string; name: string; isActive: boolean }>;
  accessibleOfficeLocations: Array<{ id: string; key: string; name: string; isActive: boolean }>;
  approvalRequired: boolean;
  approved: boolean;
  blocked: boolean;
  isAdmin: boolean;
  role: 'admin' | 'user' | null;
  pendingApprovals: Array<{ email: string; requestedAt: string }>;
};

function makeOffice(overrides: Partial<OfficeLocation> & Pick<OfficeLocation, 'id' | 'key' | 'name'>): OfficeLocation {
  return {
    id: overrides.id,
    key: overrides.key,
    name: overrides.name,
    isActive: overrides.isActive ?? true,
    autoStartPollEnabled: overrides.autoStartPollEnabled ?? false,
    autoStartPollWeekdays: overrides.autoStartPollWeekdays ?? [],
    autoStartPollFinishTime: overrides.autoStartPollFinishTime ?? null,
    defaultFoodSelectionDurationMinutes: overrides.defaultFoodSelectionDurationMinutes ?? 30,
    createdAt: overrides.createdAt ?? '2026-03-01T00:00:00Z',
    updatedAt: overrides.updatedAt ?? '2026-03-01T00:00:00Z',
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const baseAuthState: AuthState = {
  entraEnabled: true,
  localEnabled: true,
  authenticated: true,
  user: { username: 'admin@company.com', method: 'entra' },
  officeLocation: null,
  officeLocations: [makeOffice({ id: 'office-1', key: 'default', name: 'Default Office' })],
  accessibleOfficeLocations: [{ id: 'office-1', key: 'default', name: 'Default Office', isActive: true }],
  approvalRequired: true,
  approved: true,
  blocked: false,
  isAdmin: true,
  role: 'admin',
  pendingApprovals: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AuthGate sign-in methods', () => {
  it('clears stale auth markers and renders open app when auth is not configured', async () => {
    localStorage.setItem('team_lunch_auth_method', 'entra');
    localStorage.setItem('team_lunch_auth_role', 'admin');
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) {
        return jsonResponse({
          auth: {
            ...baseAuthState,
            entraEnabled: false,
            localEnabled: false,
            authenticated: false,
            user: null,
            approvalRequired: false,
            approved: false,
            isAdmin: false,
            role: null,
          },
        });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthGate>
        <div>App content</div>
      </AuthGate>,
    );

    expect(await screen.findByText('App content')).toBeInTheDocument();
    expect(localStorage.getItem('team_lunch_auth_method')).toBeNull();
    expect(localStorage.getItem('team_lunch_auth_role')).toBeNull();
  });

  it('shows SSO button and local username/password form together when both are enabled', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) {
        return jsonResponse({
          auth: {
            entraEnabled: true,
            localEnabled: true,
            authenticated: false,
            user: null,
            officeLocation: null,
            officeLocations: [makeOffice({ id: 'office-1', key: 'default', name: 'Default Office' })],
            accessibleOfficeLocations: [{ id: 'office-1', key: 'default', name: 'Default Office', isActive: true }],
            approvalRequired: false,
            approved: false,
            blocked: false,
            isAdmin: false,
            role: null,
            pendingApprovals: [],
          },
        });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthGate>
        <div>App content</div>
      </AuthGate>,
    );

    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue with microsoft/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/username/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/password/i)).toBeInTheDocument();
  });

  it('disables Microsoft login and still shows the local username/password form when Entra is disabled', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) {
        return jsonResponse({
          auth: {
            entraEnabled: false,
            localEnabled: true,
            authenticated: false,
            user: null,
            officeLocation: null,
            officeLocations: [makeOffice({ id: 'office-1', key: 'default', name: 'Default Office' })],
            accessibleOfficeLocations: [{ id: 'office-1', key: 'default', name: 'Default Office', isActive: true }],
            approvalRequired: false,
            approved: false,
            blocked: false,
            isAdmin: false,
            role: null,
            pendingApprovals: [],
          },
        });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthGate>
        <div>App content</div>
      </AuthGate>,
    );

    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue with microsoft/i })).toBeDisabled();
    expect(screen.getByText(/microsoft entra sign-in is not configured/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/username/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/password/i)).toBeInTheDocument();
  });

  it('shows an authentication error when auth config cannot be loaded', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) {
        throw new Error('Failed to load authentication config');
      }
      return jsonResponse({ error: 'not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthGate>
        <div>App content</div>
      </AuthGate>,
    );

    expect(await screen.findByText(/failed to load authentication config/i)).toBeInTheDocument();
    expect(screen.queryByText(/app content/i)).not.toBeInTheDocument();
  });
});

describe('AuthGate authenticated access', () => {
  it('renders children for an authenticated, approved user', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) {
        return jsonResponse({ auth: baseAuthState });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthGate>
        <div>App content</div>
      </AuthGate>,
    );

    expect(await screen.findByText('App content')).toBeInTheDocument();
  });

  it('shows pending approval count in context for admin accounts', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) {
        return jsonResponse({
          auth: {
            ...baseAuthState,
            pendingApprovals: [{ email: 'new.user@company.com', requestedAt: '2026-03-03T10:00:00Z' }],
          },
        });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthGate>
        <div>App content</div>
      </AuthGate>,
    );

    expect(await screen.findByText('App content')).toBeInTheDocument();
  });
});

describe('AuthGate blocking states', () => {
  it('shows blocked access screen for blocked authenticated user', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) {
        return jsonResponse({
          auth: {
            entraEnabled: true,
            localEnabled: true,
            authenticated: true,
            user: { username: 'blocked@company.com', method: 'entra' },
            officeLocation: null,
            officeLocations: [makeOffice({ id: 'office-1', key: 'default', name: 'Default Office' })],
            accessibleOfficeLocations: [{ id: 'office-1', key: 'default', name: 'Default Office', isActive: true }],
            approvalRequired: true,
            approved: false,
            blocked: true,
            isAdmin: false,
            role: 'user',
            pendingApprovals: [],
          },
        });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthGate>
        <div>App content</div>
      </AuthGate>,
    );

    expect(await screen.findByText(/access blocked/i)).toBeInTheDocument();
    expect(screen.getByText(/blocked@company\.com/i)).toBeInTheDocument();
  });
});
