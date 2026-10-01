import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from './testRender.js';
import { MemoryRouter } from 'react-router-dom';
import Administration from '../../src/client/pages/Administration.js';
import type { OfficeLocation } from '../../src/lib/types.js';
import { setupUser } from './helpers.js';

function makeOffice(overrides: Partial<OfficeLocation> & Pick<OfficeLocation, 'id' | 'key' | 'name'>): OfficeLocation {
  return {
    orderingIntervalWeeks: 1,
    timeZone: 'UTC',
    orderingAnchorDate: '2026-02-23',
    ...overrides,
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

const baseAdminConfig = {
  authenticated: true,
  isAdmin: true,
  user: { username: 'admin@company.com', method: 'entra' as const },
  officeLocation: null,
  officeLocations: [makeOffice({ id: 'office-1', key: 'default', name: 'Default Office' })],
  pendingApprovals: [] as Array<{ email: string; requestedAt: string }>,
  users: [] as Array<{
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
  }>,
};

function renderAdministration() {
  return render(
    <MemoryRouter>
      <Administration />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Administration page', () => {
  it('shows Administration heading', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) return jsonResponse({ auth: baseAdminConfig });
      return jsonResponse({ error: 'not found' }, 404);
    }));

    renderAdministration();
    expect(await screen.findByRole('heading', { name: /administration/i })).toBeInTheDocument();
  });

  it('shows pending approvals section', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) {
        return jsonResponse({
          auth: {
            ...baseAdminConfig,
            pendingApprovals: [{ email: 'new.user@company.com', requestedAt: '2026-03-03T10:00:00Z' }],
          },
        });
      }
      return jsonResponse({ error: 'not found' }, 404);
    }));

    renderAdministration();
    expect(await screen.findByText('Pending approvals')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /decline/i })).toBeInTheDocument();
  });

  it('creates a local user and shows generated password', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) return jsonResponse({ auth: baseAdminConfig });
      if (url.endsWith('/api/auth/local/users/generate')) {
        expect(init?.method).toBe('POST');
        expect(String(init?.body)).toContain('"officeLocationId":"office-1"');
        return jsonResponse({ email: 'new.user@company.com', password: 'TmpPass!234', generated: true });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = setupUser();
    renderAdministration();

    await screen.findByRole('heading', { name: /administration/i });
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
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) return jsonResponse({ auth: baseAdminConfig });
      return jsonResponse({ error: 'not found' }, 404);
    }));

    const user = setupUser();
    renderAdministration();

    await screen.findByRole('heading', { name: /administration/i });
    await user.type(screen.getByPlaceholderText('Email'), 'new.user@company.com');
    await user.type(screen.getByPlaceholderText(/password \(leave empty to auto-generate\)/i), 'short');

    expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create local user/i })).toBeDisabled();
  });

  it('declines a pending user and refreshes data', async () => {
    let approvalPending = true;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) {
        return jsonResponse({
          auth: {
            ...baseAdminConfig,
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

    const user = setupUser();
    renderAdministration();

    await screen.findByText('Pending approvals');
    await user.click(screen.getByRole('button', { name: /decline/i }));
    expect(await screen.findByText(/no pending users/i)).toBeInTheDocument();
  });

  it('creates a new office location', async () => {
    let offices = [makeOffice({ id: 'office-1', key: 'default', name: 'Default Office' })];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) {
        return jsonResponse({ auth: { ...baseAdminConfig, officeLocations: offices } });
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

    const user = setupUser();
    renderAdministration();

    await screen.findByRole('heading', { name: /administration/i });
    await user.type(screen.getByPlaceholderText(/new office location/i), 'Berlin');
    await user.click(screen.getByRole('button', { name: /add office/i }));

    expect(await screen.findByText(/key: berlin · active/i)).toBeInTheDocument();
  });

  it('renames and deactivates an office location', async () => {
    let office = makeOffice({ id: 'office-2', key: 'berlin', name: 'Berlin' });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) {
        return jsonResponse({
          auth: {
            ...baseAdminConfig,
            officeLocations: [makeOffice({ id: 'office-1', key: 'default', name: 'Default Office' }), office],
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

    const user = setupUser();
    renderAdministration();

    await screen.findByRole('heading', { name: /administration/i });
    await user.clear(screen.getByRole('textbox', { name: /office name for berlin/i }));
    await user.type(screen.getByRole('textbox', { name: /office name for berlin/i }), 'Berlin HQ');
    await user.click(screen.getByRole('button', { name: /rename office berlin/i }));

    expect(await screen.findByDisplayValue('Berlin HQ')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /deactivate office berlin/i }));
    expect(await screen.findByText(/key: berlin · inactive/i)).toBeInTheDocument();
  });

  it('updates office scheduling defaults', async () => {
    let office = makeOffice({ id: 'office-2', key: 'berlin', name: 'Berlin', defaultFoodSelectionDurationMinutes: 30 });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) {
        return jsonResponse({
          auth: {
            ...baseAdminConfig,
            officeLocations: [makeOffice({ id: 'office-1', key: 'default', name: 'Default Office' }), office],
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

    const user = setupUser();
    renderAdministration();

    await screen.findByRole('heading', { name: /administration/i });
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

function mockOffices(initial = [makeOffice({ id: 'office-1', key: 'default', name: 'Default Office' })]) {
    let offices = initial;
    const saves = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/auth/config')) {
        return jsonResponse({ auth: { ...baseAdminConfig, officeLocations: offices } });
      }
      const office = offices.find((entry) => url.endsWith(`/api/auth/offices/${entry.id}/settings`));
      if (office && init?.method === 'POST') {
        const payload = JSON.parse(String(init.body));
        saves(office.id, payload);
        const updated = { ...office, ...payload };
        offices = offices.map((entry) => entry.id === office.id ? updated : entry);
        return jsonResponse({ office: updated });
      }
      return jsonResponse({ error: 'not found' }, 404);
    }));
    return saves;
}

describe('Administration ordering policy persistence', () => {
  it.each([0, 1, 2, 3, 4])('saves and reloads interval %s with timezone and future Monday', async (weeks) => {
    const saves = mockOffices();
    const user = setupUser();
    const view = renderAdministration();
    const interval = await screen.findByLabelText('Ordering interval for default');
    expect(within(interval).getAllByRole('option').map((option) => option.textContent))
      .toEqual(['Unrestricted', '1 week', '2 weeks', '3 weeks', '4 weeks']);
    const save = screen.getByLabelText('Save office settings for default');
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Ordering anchor date for default'), { target: { value: '2099-03-02' } });
    fireEvent.change(screen.getByLabelText('Office timezone for default'), { target: { value: 'Europe/Vienna' } });
    await user.selectOptions(interval, String(weeks));
    await user.click(save);
    await waitFor(() => expect(save).toBeDisabled());
    expect(saves).toHaveBeenCalledWith('office-1', {
      autoStartPollEnabled: false,
      autoStartPollWeekdays: [],
      autoStartPollFinishTime: null,
      defaultFoodSelectionDurationMinutes: 30,
      orderingIntervalWeeks: weeks,
      timeZone: 'Europe/Vienna',
      ...(weeks === 0 ? {} : { orderingAnchorDate: '2099-03-02' }),
    });
    view.unmount();
    renderAdministration();
    expect(await screen.findByLabelText('Ordering interval for default')).toHaveValue(String(weeks));
    expect(screen.getByLabelText('Office timezone for default')).toHaveValue('Europe/Vienna');
    expect(screen.getByLabelText('Ordering anchor date for default'))
      .toHaveValue(weeks === 0 ? '2026-02-23' : '2099-03-02');
    expect(screen.getByLabelText('Save office settings for default')).toBeDisabled();
  });

  it('detects changes and reversions independently for all policy fields', async () => {
    mockOffices();
    const user = setupUser();
    renderAdministration();
    const interval = await screen.findByLabelText('Ordering interval for default');
    const save = screen.getByLabelText('Save office settings for default');
    await user.selectOptions(interval, '2');
    expect(save).toBeEnabled();
    await user.selectOptions(interval, '1');
    expect(save).toBeDisabled();
    for (const [label, changed, original] of [
      ['Office timezone for default', 'Europe/Vienna', 'UTC'],
      ['Ordering anchor date for default', '2099-03-02', '2026-02-23'],
    ]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value: changed } });
      expect(save).toBeEnabled();
      fireEvent.change(screen.getByLabelText(label), { target: { value: original } });
      expect(save).toBeDisabled();
    }
  });

});

describe('Administration ordering policy validation', () => {
  it.each(['', 'Mars/Olympus', '+02:00'])('rejects invalid timezone %j even while unrestricted', async (zone) => {
    const saves = mockOffices();
    const user = setupUser();
    renderAdministration();
    await user.selectOptions(await screen.findByLabelText('Ordering interval for default'), '0');
    fireEvent.change(screen.getByLabelText('Office timezone for default'), { target: { value: zone } });
    expect(screen.getByRole('alert')).toHaveTextContent('valid IANA timezone');
    await user.click(screen.getByLabelText('Save office settings for default'));
    expect(saves).not.toHaveBeenCalled();
  });

  it.each(['', '2026-02-24', '2026-02-30', '0000-01-03', '2026-2-23'])('rejects invalid restricted anchor %j', async (anchor) => {
    const saves = mockOffices();
    const user = setupUser();
    renderAdministration();
    await screen.findByLabelText('Ordering interval for default');
    fireEvent.change(screen.getByLabelText('Ordering anchor date for default'), { target: { value: anchor } });
    expect(screen.getByRole('alert')).toHaveTextContent('valid Monday calendar date');
    await user.click(screen.getByLabelText('Save office settings for default'));
    expect(saves).not.toHaveBeenCalled();
  });

  it('rejects an unsupported interval rather than treating an empty choice as Unrestricted', async () => {
    const saves = mockOffices();
    renderAdministration();
    const interval = await screen.findByLabelText('Ordering interval for default');
    fireEvent.change(interval, { target: { value: '5' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Choose Unrestricted or 1, 2, 3, or 4 weeks');
    expect(screen.getByLabelText('Save office settings for default')).toBeDisabled();
    expect(saves).not.toHaveBeenCalled();
  });

});

describe('Administration ordering policy anchor retention', () => {
  it('retains an unsaved anchor across disabling, saving timezone, and re-enabling', async () => {
    const saves = mockOffices();
    const user = setupUser();
    renderAdministration();
    const interval = await screen.findByLabelText('Ordering interval for default');
    const anchor = screen.getByLabelText('Ordering anchor date for default');
    const save = screen.getByLabelText('Save office settings for default');
    fireEvent.change(anchor, { target: { value: '2099-03-02' } });
    await user.selectOptions(interval, '0');
    expect(anchor).toBeDisabled();
    expect(anchor).toHaveAccessibleDescription(/Not evaluated while Unrestricted/);
    expect(screen.getByLabelText('Office timezone for default')).toBeEnabled();
    await user.click(save);
    await waitFor(() => expect(save).toBeDisabled());
    expect(anchor).toHaveValue('2099-03-02');
    fireEvent.change(screen.getByLabelText('Office timezone for default'), { target: { value: 'Asia/Kathmandu' } });
    expect(save).toBeEnabled();
    await user.click(save);
    await waitFor(() => expect(save).toBeDisabled());
    expect(saves.mock.calls[1][1]).toMatchObject({ orderingIntervalWeeks: 0, timeZone: 'Asia/Kathmandu' });
    expect(saves.mock.calls[1][1]).not.toHaveProperty('orderingAnchorDate');
    await user.selectOptions(interval, '2');
    expect(anchor).toBeEnabled();
    expect(anchor).toHaveValue('2099-03-02');
    await user.click(save);
    await waitFor(() => expect(save).toBeDisabled());
    expect(saves.mock.calls[2][1]).toMatchObject({ orderingIntervalWeeks: 2, orderingAnchorDate: '2099-03-02' });
  });

  it('ignores invalid retained anchors while unrestricted but validates them on re-enabling', async () => {
    const saves = mockOffices();
    const user = setupUser();
    renderAdministration();
    const interval = await screen.findByLabelText('Ordering interval for default');
    fireEvent.change(screen.getByLabelText('Ordering anchor date for default'), { target: { value: '2026-02-24' } });
    await user.selectOptions(interval, '0');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const save = screen.getByLabelText('Save office settings for default');
    await user.click(save);
    await waitFor(() => expect(save).toBeDisabled());
    await user.selectOptions(interval, '1');
    expect(screen.getByLabelText('Ordering anchor date for default')).toHaveValue('2026-02-24');
    expect(screen.getByRole('alert')).toHaveTextContent('valid Monday calendar date');
    expect(save).toBeDisabled();
    expect(saves).toHaveBeenCalledTimes(1);
  });

});

describe('Administration ordering policy isolation and access', () => {
  it('keeps office drafts and saved policies isolated across refreshes', async () => {
    const saves = mockOffices([
      makeOffice({ id: 'office-1', key: 'default', name: 'Default Office' }),
      makeOffice({ id: 'office-2', key: 'berlin', name: 'Berlin', orderingIntervalWeeks: 4, timeZone: 'Europe/Berlin' }),
    ]);
    const user = setupUser();
    renderAdministration();
    await user.selectOptions(await screen.findByLabelText('Ordering interval for default'), '2');
    fireEvent.change(screen.getByLabelText('Office timezone for berlin'), { target: { value: 'Europe/Vienna' } });
    await user.click(screen.getByLabelText('Save office settings for berlin'));
    await waitFor(() => expect(screen.getByLabelText('Save office settings for berlin')).toBeDisabled());
    expect(screen.getByLabelText('Ordering interval for default')).toHaveValue('2');
    expect(screen.getByLabelText('Office timezone for default')).toHaveValue('UTC');
    expect(screen.getByLabelText('Save office settings for default')).toBeEnabled();
    expect(saves).toHaveBeenCalledTimes(1);
    expect(saves).toHaveBeenCalledWith('office-2', expect.objectContaining({ orderingIntervalWeeks: 4, timeZone: 'Europe/Vienna' }));
    await user.click(screen.getByLabelText('Save office settings for default'));
    await waitFor(() => expect(screen.getByLabelText('Save office settings for default')).toBeDisabled());
    expect(screen.getByLabelText('Ordering interval for berlin')).toHaveValue('4');
    expect(screen.getByLabelText('Office timezone for berlin')).toHaveValue('Europe/Vienna');
  });

  it('does not expose settings or send mutations for non-admin users', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ auth: { ...baseAdminConfig, isAdmin: false } }));
    vi.stubGlobal('fetch', fetchMock);
    renderAdministration();
    expect(await screen.findByText(/access denied/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Ordering interval for default')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Save office settings for default')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls).toHaveLength(1);
  });
});

describe('Administration user management', () => {
  it('promotes a listed user to admin', async () => {
    let promoted = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) {
        return jsonResponse({
          auth: {
            ...baseAdminConfig,
            users: [{
              email: 'member@company.com',
              approved: true,
              blocked: false,
              isAdmin: promoted,
              officeLocationId: 'office-1',
              officeLocationKey: 'default',
              officeLocationName: 'Default Office',
              assignedOfficeLocationIds: ['office-1'],
              assignedOfficeLocations: [{ id: 'office-1', key: 'default', name: 'Default Office', isActive: true }],
              requestedAt: '2026-03-04T07:00:00Z',
              approvedAt: '2026-03-04T07:10:00Z',
              blockedAt: null,
              updatedAt: '2026-03-04T07:10:00Z',
            }],
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

    const user = setupUser();
    renderAdministration();

    await screen.findByRole('heading', { name: /administration/i });
    await user.click(screen.getByRole('button', { name: /promote/i }));
    expect(await screen.findByRole('button', { name: /demote/i })).toBeInTheDocument();
  });

  it('assigns an office to a listed user', async () => {
    let assignedOfficeId = 'office-1';
    let assignedOfficeIds = ['office-1'];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) {
        return jsonResponse({
          auth: {
            ...baseAdminConfig,
            officeLocations: [
              makeOffice({ id: 'office-1', key: 'default', name: 'Default Office' }),
              makeOffice({ id: 'office-2', key: 'berlin', name: 'Berlin' }),
            ],
            users: [{
              email: 'member@company.com',
              approved: true,
              blocked: false,
              isAdmin: false,
              officeLocationId: assignedOfficeId,
              officeLocationKey: assignedOfficeId === 'office-2' ? 'berlin' : 'default',
              officeLocationName: assignedOfficeId === 'office-2' ? 'Berlin' : 'Default Office',
              assignedOfficeLocationIds: assignedOfficeIds,
              assignedOfficeLocations: assignedOfficeIds.map((id) => ({
                id,
                key: id === 'office-2' ? 'berlin' : 'default',
                name: id === 'office-2' ? 'Berlin' : 'Default Office',
                isActive: true,
              })),
              requestedAt: '2026-03-04T07:00:00Z',
              approvedAt: '2026-03-04T07:10:00Z',
              blockedAt: null,
              updatedAt: '2026-03-04T07:10:00Z',
            }],
          },
        });
      }
      if (url.endsWith('/api/auth/users/assign-offices')) {
        expect(init?.method).toBe('POST');
        expect(String(init?.body)).toContain('"officeLocationIds":["office-1","office-2"]');
        expect(String(init?.body)).toContain('"preferredOfficeLocationId":"office-2"');
        assignedOfficeId = 'office-2';
        assignedOfficeIds = ['office-1', 'office-2'];
        return jsonResponse({ email: 'member@company.com', officeLocationIds: ['office-1', 'office-2'], preferredOfficeLocationId: 'office-2' });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = setupUser();
    renderAdministration();

    await screen.findByRole('heading', { name: /administration/i });
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
            ...baseAdminConfig,
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
        userState = { ...userState, officeLocationId: 'office-2', officeLocationKey: 'berlin', officeLocationName: 'Berlin', assignedOfficeLocationIds: ['office-2'], assignedOfficeLocations: [{ id: 'office-2', key: 'berlin', name: 'Berlin', isActive: true }] };
        return jsonResponse({ email: userState.email, officeLocationIds: ['office-2'], preferredOfficeLocationId: 'office-2' });
      }
      if (url.endsWith('/api/auth/users/demote')) {
        expect(String(init?.body)).toContain('"email":"floating.admin@company.com"');
        expect(String(init?.body)).toContain('"officeLocationId":"office-2"');
        userState = { ...userState, isAdmin: false };
        return jsonResponse({ email: userState.email, demoted: true });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = setupUser();
    renderAdministration();

    await screen.findByRole('heading', { name: /administration/i });
    await user.click(screen.getByRole('checkbox', { name: /berlin membership for floating.admin@company.com/i }));
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
            ...baseAdminConfig,
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
        userState = { ...userState, officeLocationId: 'office-2', officeLocationKey: 'berlin', officeLocationName: 'Berlin', assignedOfficeLocationIds: ['office-2'], assignedOfficeLocations: [{ id: 'office-2', key: 'berlin', name: 'Berlin', isActive: true }] };
        return jsonResponse({ email: userState.email, officeLocationIds: ['office-2'], preferredOfficeLocationId: 'office-2' });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = setupUser();
    renderAdministration();

    await screen.findByRole('heading', { name: /administration/i });
    await user.click(screen.getByRole('checkbox', { name: /berlin membership for jwall@company.com/i }));
    await user.click(screen.getByRole('button', { name: /save offices/i }));

    expect(await screen.findByText(/preferred office: berlin/i)).toBeInTheDocument();
  });

  it('blocks and unblocks a listed user', async () => {
    let blocked = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) {
        return jsonResponse({
          auth: {
            ...baseAdminConfig,
            users: [{
              email: 'member@company.com',
              approved: true,
              blocked,
              isAdmin: false,
              officeLocationId: 'office-1',
              officeLocationKey: 'default',
              officeLocationName: 'Default Office',
              assignedOfficeLocationIds: ['office-1'],
              assignedOfficeLocations: [{ id: 'office-1', key: 'default', name: 'Default Office', isActive: true }],
              requestedAt: '2026-03-04T07:00:00Z',
              approvedAt: '2026-03-04T07:10:00Z',
              blockedAt: blocked ? '2026-03-05T07:10:00Z' : null,
              updatedAt: '2026-03-05T07:10:00Z',
            }],
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

    const user = setupUser();
    renderAdministration();

    await screen.findByRole('heading', { name: /administration/i });
    await user.click(screen.getByRole('button', { name: /^block$/i }));
    expect(await screen.findByRole('button', { name: /^unblock$/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^unblock$/i }));
    expect(await screen.findByRole('button', { name: /^block$/i })).toBeInTheDocument();
  });

  it('lets admins edit a local user email', async () => {
    let email = 'guest@company.com';
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) {
        return jsonResponse({
          auth: {
            ...baseAdminConfig,
            users: [{
              email,
              displayName: 'Guest',
              displayNameSource: 'local',
              localAccount: true,
              protectedBootstrapAdmin: false,
              approved: true,
              blocked: false,
              isAdmin: false,
              officeLocationId: 'office-1',
              officeLocationKey: 'default',
              officeLocationName: 'Default Office',
              assignedOfficeLocationIds: ['office-1'],
              assignedOfficeLocations: [{ id: 'office-1', key: 'default', name: 'Default Office', isActive: true }],
              requestedAt: '2026-03-04T07:00:00Z',
              approvedAt: '2026-03-04T07:10:00Z',
              blockedAt: null,
              updatedAt: '2026-03-04T07:10:00Z',
            }],
          },
        });
      }
      if (url.endsWith('/api/auth/users/email')) {
        expect(init?.method).toBe('PUT');
        expect(String(init?.body)).toContain('"email":"guest@company.com"');
        expect(String(init?.body)).toContain('"newEmail":"renamed@company.com"');
        email = 'renamed@company.com';
        return jsonResponse({ email, previousEmail: 'guest@company.com' });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = setupUser();
    renderAdministration();

    await screen.findByRole('heading', { name: /administration/i });
    const emailInput = screen.getByRole('textbox', { name: /account email for guest@company.com/i });
    await user.clear(emailInput);
    await user.type(emailInput, 'renamed@company.com');
    await user.click(screen.getByRole('button', { name: /save email/i }));

    expect(await screen.findByText('renamed@company.com')).toBeInTheDocument();
  });

  it('updates current auth profile cache when admin edits own display name', async () => {
    let displayName = 'Admin';
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) {
        return jsonResponse({
          auth: {
            ...baseAdminConfig,
            user: { username: 'admin@company.com', method: 'local' as const, displayName },
            users: [{
              email: 'admin@company.com',
              displayName,
              displayNameSource: 'local',
              localAccount: true,
              protectedBootstrapAdmin: true,
              approved: true,
              blocked: false,
              isAdmin: true,
              officeLocationId: 'office-1',
              officeLocationKey: 'default',
              officeLocationName: 'Default Office',
              assignedOfficeLocationIds: ['office-1'],
              assignedOfficeLocations: [{ id: 'office-1', key: 'default', name: 'Default Office', isActive: true }],
              requestedAt: '2026-03-04T07:00:00Z',
              approvedAt: '2026-03-04T07:10:00Z',
              blockedAt: null,
              updatedAt: '2026-03-04T07:10:00Z',
            }],
          },
        });
      }
      if (url.endsWith('/api/auth/users/display-name')) {
        expect(init?.method).toBe('PUT');
        expect(String(init?.body)).toContain('"email":"admin@company.com"');
        expect(String(init?.body)).toContain('"displayName":"Admin Renamed"');
        displayName = 'Admin Renamed';
        return jsonResponse({ email: 'admin@company.com', displayName, displayNameSource: 'local' });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('team_lunch_actor_key', 'admin@company.com');
    localStorage.setItem('team_lunch_display_name', 'Admin');
    const profileUpdated = vi.fn();
    window.addEventListener('team_lunch_auth_profile_updated', profileUpdated);

    const user = setupUser();
    renderAdministration();

    await screen.findByRole('heading', { name: /administration/i });
    const displayNameInput = screen.getByRole('textbox', { name: /display name for admin@company.com/i });
    await user.clear(displayNameInput);
    await user.type(displayNameInput, 'Admin Renamed');
    await user.click(screen.getByRole('button', { name: /save name/i }));

    expect(await screen.findByText(/display name: admin renamed/i)).toBeInTheDocument();
    expect(localStorage.getItem('team_lunch_display_name')).toBe('Admin Renamed');
    expect(profileUpdated).toHaveBeenCalledTimes(1);
    window.removeEventListener('team_lunch_auth_profile_updated', profileUpdated);
  });

  it('lets admins delete a local user after confirmation', async () => {
    let users = [{
      email: 'guest@company.com',
      displayName: 'Guest',
      displayNameSource: 'local',
      localAccount: true,
      protectedBootstrapAdmin: false,
      approved: true,
      blocked: false,
      isAdmin: false,
      officeLocationId: 'office-1',
      officeLocationKey: 'default',
      officeLocationName: 'Default Office',
      assignedOfficeLocationIds: ['office-1'],
      assignedOfficeLocations: [{ id: 'office-1', key: 'default', name: 'Default Office', isActive: true }],
      requestedAt: '2026-03-04T07:00:00Z',
      approvedAt: '2026-03-04T07:10:00Z',
      blockedAt: null,
      updatedAt: '2026-03-04T07:10:00Z',
    }];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) {
        return jsonResponse({ auth: { ...baseAdminConfig, users } });
      }
      if (url.endsWith('/api/auth/users')) {
        expect(init?.method).toBe('DELETE');
        expect(String(init?.body)).toContain('"email":"guest@company.com"');
        users = [];
        return jsonResponse({ email: 'guest@company.com', deleted: true });
      }
      return jsonResponse({ error: 'not found' }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = setupUser();
    renderAdministration();

    await screen.findByRole('heading', { name: /administration/i });
    await user.click(screen.getByRole('button', { name: /delete local account/i }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /delete local account/i }),
    );

    expect(await screen.findByText(/no users yet/i)).toBeInTheDocument();
  });

  it('keeps Entra account management read-only', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/auth/config')) {
        return jsonResponse({
          auth: {
            ...baseAdminConfig,
            users: [{
              email: 'entra@company.com',
              displayName: 'Entra User',
              displayNameSource: 'entra',
              localAccount: false,
              protectedBootstrapAdmin: false,
              approved: true,
              blocked: false,
              isAdmin: false,
              officeLocationId: 'office-1',
              officeLocationKey: 'default',
              officeLocationName: 'Default Office',
              assignedOfficeLocationIds: ['office-1'],
              assignedOfficeLocations: [{ id: 'office-1', key: 'default', name: 'Default Office', isActive: true }],
              requestedAt: '2026-03-04T07:00:00Z',
              approvedAt: '2026-03-04T07:10:00Z',
              blockedAt: null,
              updatedAt: '2026-03-04T07:10:00Z',
            }],
          },
        });
      }
      return jsonResponse({ error: 'not found' }, 404);
    }));

    renderAdministration();

    await screen.findByRole('heading', { name: /administration/i });
    expect(screen.getByRole('textbox', { name: /account email for entra@company.com/i })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: /display name for entra@company.com/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /delete local account/i })).toBeDisabled();
  });
});
