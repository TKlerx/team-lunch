import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  users: Array<{
    email: string;
    approved: boolean;
    blocked: boolean;
    isAdmin: boolean;
    officeLocationId: string | null;
    officeLocationKey: string | null;
    officeLocationName: string | null;
    assignedOfficeLocationIds: string[];
    assignedOfficeLocations: Array<{ id: string; key: string; name: string; isActive: boolean }>;
    requestedAt: string;
    approvedAt: string | null;
    blockedAt: string | null;
    updatedAt: string;
  }>;
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

const baseAdminState: AuthState = {
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
  users: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AuthGate admin panel', () => {
  it('lets authenticated admin open the admin panel from the app', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) {
        return jsonResponse({ auth: baseAdminState });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(
      <AuthGate>
        <div>App content</div>
      </AuthGate>,
    );

    expect(await screen.findByText('App content')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /admin panel/i }));
    expect(await screen.findByRole('heading', { name: /create local user/i })).toBeInTheDocument();
  });

  it('shows pending approvals immediately for admin accounts', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) {
        return jsonResponse({
          auth: {
            ...baseAdminState,
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

    expect(await screen.findByText('Pending approvals')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /decline/i })).toBeInTheDocument();
  });

  it('creates a local user from admin panel and shows generated password', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) {
        return jsonResponse({ auth: baseAdminState });
      }
      if (url.endsWith('/api/auth/local/users/generate')) {
        expect(init?.method).toBe('POST');
        expect(String(init?.body)).toContain('"officeLocationId":"office-1"');
        return jsonResponse({
          email: 'new.user@company.com',
          password: 'TmpPass!234',
          generated: true,
        });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(
      <AuthGate>
        <div>App content</div>
      </AuthGate>,
    );

    await screen.findByText('App content');
    await user.click(screen.getByRole('button', { name: /admin panel/i }));
    await user.type(screen.getByPlaceholderText('Email'), 'new.user@company.com');
    await user.selectOptions(
      screen.getByRole('combobox', { name: /office location for new local user/i }),
      'office-1',
    );
    await user.click(screen.getByRole('button', { name: /create local user/i }));

    expect(await screen.findByText(/credentials created for new.user@company.com/i)).toBeInTheDocument();
    expect(screen.getByText(/TmpPass!234/i)).toBeInTheDocument();
  }, 15000);

  it('shows inline validation for short local-user password and blocks submit', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) {
        return jsonResponse({ auth: baseAdminState });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(
      <AuthGate>
        <div>App content</div>
      </AuthGate>,
    );

    await screen.findByText('App content');
    await user.click(screen.getByRole('button', { name: /admin panel/i }));
    await user.type(screen.getByPlaceholderText('Email'), 'new.user@company.com');
    await user.type(screen.getByPlaceholderText(/password \(leave empty to auto-generate\)/i), 'short');

    expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create local user/i })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('declines a pending user and refreshes admin panel data', async () => {
    let approvalPending = true;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) {
        return jsonResponse({
          auth: {
            ...baseAdminState,
            pendingApprovals: approvalPending
              ? [{ email: 'new.user@company.com', requestedAt: '2026-03-03T10:00:00Z' }]
              : [],
          },
        });
      }
      if (url.endsWith('/api/auth/users/decline')) {
        expect(init?.method).toBe('POST');
        approvalPending = false;
        return jsonResponse({ email: 'new.user@company.com', declined: true });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(
      <AuthGate>
        <div>App content</div>
      </AuthGate>,
    );

    await screen.findByText('Pending approvals');
    await user.click(screen.getByRole('button', { name: /decline/i }));

    expect(await screen.findByText(/no pending users/i)).toBeInTheDocument();
  });

  it('creates a new office location from the admin panel', async () => {
    let offices = [makeOffice({ id: 'office-1', key: 'default', name: 'Default Office' })];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) {
        return jsonResponse({
          auth: {
            ...baseAdminState,
            officeLocations: offices,
          },
        });
      }
      if (url.endsWith('/api/auth/offices')) {
        expect(init?.method).toBe('POST');
        expect(String(init?.body)).toContain('"name":"Berlin"');
        offices = [...offices, makeOffice({ id: 'office-2', key: 'berlin', name: 'Berlin' })];
        return jsonResponse({ office: offices[1] });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(
      <AuthGate>
        <div>App content</div>
      </AuthGate>,
    );

    await screen.findByText('App content');
    await user.click(screen.getByRole('button', { name: /admin panel/i }));
    await user.type(screen.getByPlaceholderText(/new office location/i), 'Berlin');
    await user.click(screen.getByRole('button', { name: /add office/i }));

    expect(await screen.findByText(/key: berlin · active/i)).toBeInTheDocument();
  });

  it('renames and deactivates an office location from the admin panel', async () => {
    let office = makeOffice({ id: 'office-2', key: 'berlin', name: 'Berlin' });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) {
        return jsonResponse({
          auth: {
            ...baseAdminState,
            officeLocations: [
              makeOffice({ id: 'office-1', key: 'default', name: 'Default Office' }),
              office,
            ],
          },
        });
      }
      if (url.endsWith('/api/auth/offices/office-2/rename')) {
        expect(init?.method).toBe('POST');
        expect(String(init?.body)).toContain('"name":"Berlin HQ"');
        office = { ...office, name: 'Berlin HQ' };
        return jsonResponse({ office });
      }
      if (url.endsWith('/api/auth/offices/office-2/deactivate')) {
        expect(init?.method).toBe('POST');
        office = { ...office, isActive: false };
        return jsonResponse({ office });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(
      <AuthGate>
        <div>App content</div>
      </AuthGate>,
    );

    await screen.findByText('App content');
    await user.click(screen.getByRole('button', { name: /admin panel/i }));
    await user.clear(screen.getByRole('textbox', { name: /office name for berlin/i }));
    await user.type(screen.getByRole('textbox', { name: /office name for berlin/i }), 'Berlin HQ');
    await user.click(screen.getByRole('button', { name: /rename office berlin/i }));

    expect(await screen.findByDisplayValue('Berlin HQ')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /deactivate office berlin/i }));
    expect(await screen.findByText(/key: berlin · inactive/i)).toBeInTheDocument();
  });

  it('updates office scheduling defaults from the admin panel', async () => {
    let office = makeOffice({
      id: 'office-2',
      key: 'berlin',
      name: 'Berlin',
      defaultFoodSelectionDurationMinutes: 30,
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) {
        return jsonResponse({
          auth: {
            ...baseAdminState,
            officeLocations: [
              makeOffice({ id: 'office-1', key: 'default', name: 'Default Office' }),
              office,
            ],
          },
        });
      }
      if (url.endsWith('/api/auth/offices/office-2/settings')) {
        expect(String(init?.body)).toContain('"autoStartPollEnabled":true');
        expect(String(init?.body)).toContain('"autoStartPollWeekdays":["monday","wednesday"]');
        expect(String(init?.body)).toContain('"autoStartPollFinishTime":"11:30"');
        expect(String(init?.body)).toContain('"defaultFoodSelectionDurationMinutes":20');
        office = makeOffice({
          ...office,
          autoStartPollEnabled: true,
          autoStartPollWeekdays: ['monday', 'wednesday'],
          autoStartPollFinishTime: '11:30',
          defaultFoodSelectionDurationMinutes: 20,
        });
        return jsonResponse({ office });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(
      <AuthGate>
        <div>App content</div>
      </AuthGate>,
    );

    await screen.findByText('App content');
    await user.click(screen.getByRole('button', { name: /admin panel/i }));
    await user.click(screen.getByRole('checkbox', { name: /enable scheduled poll for berlin/i }));
    await user.click(screen.getByRole('checkbox', { name: /mon auto poll for berlin/i }));
    await user.click(screen.getByRole('checkbox', { name: /wed auto poll for berlin/i }));
    await user.type(screen.getByLabelText(/auto-start finish time for berlin/i), '11:30');
    await user.selectOptions(
      screen.getByRole('combobox', { name: /default food selection duration for berlin/i }),
      '20',
    );
    await user.click(screen.getByRole('button', { name: /save office settings for berlin/i }));

    expect(await screen.findByDisplayValue('11:30')).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: /default food selection duration for berlin/i }),
    ).toHaveValue('20');
  });
});

describe('AuthGate user role management', () => {
  it('promotes a listed user to admin from admin panel', async () => {
    let promoted = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) {
        return jsonResponse({
          auth: {
            ...baseAdminState,
            users: [
              {
                email: 'member@company.com',
                approved: true,
                blocked: false,
                isAdmin: promoted,
                officeLocationId: 'office-1',
                officeLocationKey: 'default',
                officeLocationName: 'Default Office',
                assignedOfficeLocationIds: ['office-1'],
                assignedOfficeLocations: [
                  { id: 'office-1', key: 'default', name: 'Default Office', isActive: true },
                ],
                requestedAt: '2026-03-04T07:00:00Z',
                approvedAt: '2026-03-04T07:10:00Z',
                blockedAt: null,
                updatedAt: '2026-03-04T07:10:00Z',
              },
            ],
          },
        });
      }
      if (url.endsWith('/api/auth/users/promote')) {
        expect(init?.method).toBe('POST');
        promoted = true;
        return jsonResponse({ email: 'member@company.com', promoted: true });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(
      <AuthGate>
        <div>App content</div>
      </AuthGate>,
    );

    await screen.findByText(/app content/i);
    await user.click(screen.getByRole('button', { name: /admin panel/i }));
    await user.click(screen.getByRole('button', { name: /promote/i }));
    expect(await screen.findByRole('button', { name: /demote/i })).toBeInTheDocument();
  });

  it('assigns an office to a listed user from admin panel', async () => {
    let assignedOfficeId = 'office-1';
    let assignedOfficeIds = ['office-1'];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) {
        return jsonResponse({
          auth: {
            ...baseAdminState,
            officeLocations: [
              makeOffice({ id: 'office-1', key: 'default', name: 'Default Office' }),
              makeOffice({ id: 'office-2', key: 'berlin', name: 'Berlin' }),
            ],
            users: [
              {
                email: 'member@company.com',
                approved: true,
                blocked: false,
                isAdmin: false,
                officeLocationId: assignedOfficeId,
                officeLocationKey: assignedOfficeId === 'office-2' ? 'berlin' : 'default',
                officeLocationName: assignedOfficeId === 'office-2' ? 'Berlin' : 'Default Office',
                assignedOfficeLocationIds: assignedOfficeIds,
                assignedOfficeLocations: assignedOfficeIds.map((officeId) => ({
                  id: officeId,
                  key: officeId === 'office-2' ? 'berlin' : 'default',
                  name: officeId === 'office-2' ? 'Berlin' : 'Default Office',
                  isActive: true,
                })),
                requestedAt: '2026-03-04T07:00:00Z',
                approvedAt: '2026-03-04T07:10:00Z',
                blockedAt: null,
                updatedAt: '2026-03-04T07:10:00Z',
              },
            ],
          },
        });
      }
      if (url.endsWith('/api/auth/users/assign-offices')) {
        expect(init?.method).toBe('POST');
        expect(String(init?.body)).toContain('"officeLocationIds":["office-1","office-2"]');
        expect(String(init?.body)).toContain('"preferredOfficeLocationId":"office-2"');
        assignedOfficeId = 'office-2';
        assignedOfficeIds = ['office-1', 'office-2'];
        return jsonResponse({
          email: 'member@company.com',
          officeLocationIds: ['office-1', 'office-2'],
          preferredOfficeLocationId: 'office-2',
        });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(
      <AuthGate>
        <div>App content</div>
      </AuthGate>,
    );

    await screen.findByText(/app content/i);
    await user.click(screen.getByRole('button', { name: /admin panel/i }));
    await user.click(screen.getByRole('checkbox', { name: /berlin membership for member@company.com/i }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: /preferred office for member@company.com/i }),
      'office-2',
    );
    await user.click(screen.getByRole('button', { name: /save offices/i }));

    expect(await screen.findByText(/preferred office: berlin/i)).toBeInTheDocument();
    expect(screen.getByText(/assigned offices: default office, berlin/i)).toBeInTheDocument();
  });

  it('lets admins assign an office to another admin and demote them in one flow', async () => {
    let userState = {
      email: 'floating.admin@company.com',
      approved: true,
      blocked: false,
      isAdmin: true,
      officeLocationId: null as string | null,
      officeLocationKey: null as string | null,
      officeLocationName: null as string | null,
      assignedOfficeLocationIds: [] as string[],
      assignedOfficeLocations: [] as Array<{ id: string; key: string; name: string; isActive: boolean }>,
      requestedAt: '2026-03-04T07:00:00Z',
      approvedAt: '2026-03-04T07:10:00Z',
      blockedAt: null as string | null,
      updatedAt: '2026-03-04T07:10:00Z',
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) {
        return jsonResponse({
          auth: {
            ...baseAdminState,
            officeLocations: [
              makeOffice({ id: 'office-1', key: 'default', name: 'Default Office' }),
              makeOffice({ id: 'office-2', key: 'berlin', name: 'Berlin' }),
            ],
            users: [userState],
          },
        });
      }
      if (url.endsWith('/api/auth/users/assign-offices')) {
        expect(String(init?.body)).toContain('"email":"floating.admin@company.com"');
        expect(String(init?.body)).toContain('"officeLocationIds":["office-2"]');
        expect(String(init?.body)).toContain('"preferredOfficeLocationId":"office-2"');
        userState = {
          ...userState,
          officeLocationId: 'office-2',
          officeLocationKey: 'berlin',
          officeLocationName: 'Berlin',
          assignedOfficeLocationIds: ['office-2'],
          assignedOfficeLocations: [
            { id: 'office-2', key: 'berlin', name: 'Berlin', isActive: true },
          ],
        };
        return jsonResponse({
          email: userState.email,
          officeLocationIds: ['office-2'],
          preferredOfficeLocationId: 'office-2',
        });
      }
      if (url.endsWith('/api/auth/users/demote')) {
        expect(String(init?.body)).toContain('"email":"floating.admin@company.com"');
        expect(String(init?.body)).toContain('"officeLocationId":"office-2"');
        userState = {
          ...userState,
          isAdmin: false,
          officeLocationId: 'office-2',
          officeLocationKey: 'berlin',
          officeLocationName: 'Berlin',
        };
        return jsonResponse({ email: userState.email, demoted: true });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(
      <AuthGate>
        <div>App content</div>
      </AuthGate>,
    );

    await screen.findByText(/app content/i);
    await user.click(screen.getByRole('button', { name: /admin panel/i }));
    await user.click(
      screen.getByRole('checkbox', { name: /berlin membership for floating.admin@company.com/i }),
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: /preferred office for floating.admin@company.com/i }),
      'office-2',
    );
    await user.click(screen.getByRole('button', { name: /save offices/i }));
    expect(await screen.findByText(/preferred office: berlin/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /demote/i }));
    expect(await screen.findByRole('button', { name: /promote/i })).toBeInTheDocument();
  });

  it('lets admins assign an office to an unassigned admin without manually changing the preferred-office dropdown', async () => {
    let userState = {
      email: 'jwall@company.com',
      approved: true,
      blocked: false,
      isAdmin: true,
      officeLocationId: null as string | null,
      officeLocationKey: null as string | null,
      officeLocationName: null as string | null,
      assignedOfficeLocationIds: [] as string[],
      assignedOfficeLocations: [] as Array<{ id: string; key: string; name: string; isActive: boolean }>,
      requestedAt: '2026-03-04T07:00:00Z',
      approvedAt: '2026-03-04T07:10:00Z',
      blockedAt: null as string | null,
      updatedAt: '2026-03-04T07:10:00Z',
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) {
        return jsonResponse({
          auth: {
            ...baseAdminState,
            officeLocations: [
              makeOffice({ id: 'office-1', key: 'default', name: 'Default Office' }),
              makeOffice({ id: 'office-2', key: 'berlin', name: 'Berlin' }),
            ],
            users: [userState],
          },
        });
      }
      if (url.endsWith('/api/auth/users/assign-offices')) {
        expect(String(init?.body)).toContain('"email":"jwall@company.com"');
        expect(String(init?.body)).toContain('"officeLocationIds":["office-2"]');
        expect(String(init?.body)).toContain('"preferredOfficeLocationId":"office-2"');
        userState = {
          ...userState,
          officeLocationId: 'office-2',
          officeLocationKey: 'berlin',
          officeLocationName: 'Berlin',
          assignedOfficeLocationIds: ['office-2'],
          assignedOfficeLocations: [
            { id: 'office-2', key: 'berlin', name: 'Berlin', isActive: true },
          ],
        };
        return jsonResponse({
          email: userState.email,
          officeLocationIds: ['office-2'],
          preferredOfficeLocationId: 'office-2',
        });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(
      <AuthGate>
        <div>App content</div>
      </AuthGate>,
    );

    await screen.findByText(/app content/i);
    await user.click(screen.getByRole('button', { name: /admin panel/i }));
    await user.click(screen.getByRole('checkbox', { name: /berlin membership for jwall@company.com/i }));
    await user.click(screen.getByRole('button', { name: /save offices/i }));

    expect(await screen.findByText(/preferred office: berlin/i)).toBeInTheDocument();
  });
});

describe('AuthGate sign-in methods', () => {
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
            users: [],
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
            users: [],
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
            users: [],
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

  it('blocks and unblocks a listed user from admin panel', async () => {
    let blocked = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) {
        return jsonResponse({
          auth: {
            ...baseAdminState,
            users: [
              {
                email: 'member@company.com',
                approved: true,
                blocked,
                isAdmin: false,
                officeLocationId: 'office-1',
                officeLocationKey: 'default',
                officeLocationName: 'Default Office',
                assignedOfficeLocationIds: ['office-1'],
                assignedOfficeLocations: [
                  { id: 'office-1', key: 'default', name: 'Default Office', isActive: true },
                ],
                requestedAt: '2026-03-04T07:00:00Z',
                approvedAt: '2026-03-04T07:10:00Z',
                blockedAt: blocked ? '2026-03-05T07:10:00Z' : null,
                updatedAt: '2026-03-05T07:10:00Z',
              },
            ],
          },
        });
      }
      if (url.endsWith('/api/auth/users/block')) {
        expect(init?.method).toBe('POST');
        blocked = true;
        return jsonResponse({ email: 'member@company.com', blocked: true });
      }
      if (url.endsWith('/api/auth/users/unblock')) {
        expect(init?.method).toBe('POST');
        blocked = false;
        return jsonResponse({ email: 'member@company.com', blocked: false });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(
      <AuthGate>
        <div>App content</div>
      </AuthGate>,
    );

    await screen.findByText(/app content/i);
    await user.click(screen.getByRole('button', { name: /admin panel/i }));
    await user.click(screen.getByRole('button', { name: /^block$/i }));
    expect(await screen.findByRole('button', { name: /^unblock$/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^unblock$/i }));
    expect(await screen.findByRole('button', { name: /^block$/i })).toBeInTheDocument();
  });
});
