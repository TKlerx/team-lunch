import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { withBasePath } from '../config.js';
import type { OfficeLocation, OfficeWeekday } from '../../lib/types.js';

type AuthMethod = 'entra' | 'local';

type AdminConfigResponse = {
  auth: {
    authenticated: boolean;
    isAdmin: boolean;
    user: { username: string; method: AuthMethod } | null;
    officeLocation: { id: string; key: string; name: string } | null;
    officeLocations: OfficeLocation[];
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
};

const LOCAL_PASSWORD_MIN_LENGTH = 8;
const LOCAL_PASSWORD_MAX_LENGTH = 200;

const OFFICE_WEEKDAY_OPTIONS: Array<{ value: OfficeWeekday; label: string }> = [
  { value: 'monday', label: 'Mon' },
  { value: 'tuesday', label: 'Tue' },
  { value: 'wednesday', label: 'Wed' },
  { value: 'thursday', label: 'Thu' },
  { value: 'friday', label: 'Fri' },
  { value: 'saturday', label: 'Sat' },
  { value: 'sunday', label: 'Sun' },
];
const FOOD_DURATIONS = [1, 5, 10, 15, 20, 25, 30] as const;

type OfficeSettingsDraft = {
  autoStartPollEnabled: boolean;
  autoStartPollWeekdays: OfficeWeekday[];
  autoStartPollFinishTime: string;
  defaultFoodSelectionDurationMinutes: number;
};

async function fetchAdminConfig(): Promise<AdminConfigResponse> {
  const response = await fetch(withBasePath('/api/auth/config'), { credentials: 'include' });
  if (!response.ok) {
    throw new Error('Failed to load admin config');
  }
  return response.json() as Promise<AdminConfigResponse>;
}

function getPreferredOfficeLocationId(
  officeLocations: OfficeLocation[],
  current?: string | null,
): string {
  if (current && officeLocations.some((l) => l.id === current && l.isActive)) {
    return current;
  }
  return officeLocations.find((l) => l.isActive)?.id ?? '';
}

function getSelectedUserOfficeLocationId(
  officeLocations: OfficeLocation[],
  current?: string | null,
): string {
  if (current && officeLocations.some((l) => l.id === current && l.isActive)) {
    return current;
  }
  return '';
}

function orderWeekdays(weekdays: OfficeWeekday[]): OfficeWeekday[] {
  return OFFICE_WEEKDAY_OPTIONS.map((o) => o.value).filter((w) => weekdays.includes(w));
}

function getOfficeNameDrafts(officeLocations: OfficeLocation[]): Record<string, string> {
  return Object.fromEntries(officeLocations.map((l) => [l.id, l.name]));
}

function getOfficeSettingsDrafts(
  officeLocations: OfficeLocation[],
  current: Record<string, OfficeSettingsDraft>,
): Record<string, OfficeSettingsDraft> {
  return Object.fromEntries(
    officeLocations.map((l) => [
      l.id,
      current[l.id] || {
        autoStartPollEnabled: l.autoStartPollEnabled,
        autoStartPollWeekdays: orderWeekdays(l.autoStartPollWeekdays),
        autoStartPollFinishTime: l.autoStartPollFinishTime ?? '',
        defaultFoodSelectionDurationMinutes: l.defaultFoodSelectionDurationMinutes,
      },
    ]),
  );
}

function getSelectedUserOfficeMemberships(
  users: AdminConfigResponse['auth']['users'],
  current: Record<string, string[]>,
): Record<string, string[]> {
  return Object.fromEntries(
    users.map((u) => [u.email, current[u.email] || u.assignedOfficeLocationIds || []]),
  );
}

export default function Administration() {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<AdminConfigResponse['auth'] | null>(null);
  const [error, setError] = useState('');
  const [updatingApprovalEmail, setUpdatingApprovalEmail] = useState<string | null>(null);
  const [updatingUserRoleEmail, setUpdatingUserRoleEmail] = useState<string | null>(null);
  const [newLocalUserEmail, setNewLocalUserEmail] = useState('');
  const [newLocalUserPassword, setNewLocalUserPassword] = useState('');
  const [newLocalUserOfficeLocationId, setNewLocalUserOfficeLocationId] = useState('');
  const [newOfficeName, setNewOfficeName] = useState('');
  const [creatingLocalUser, setCreatingLocalUser] = useState(false);
  const [creatingOffice, setCreatingOffice] = useState(false);
  const [selectedApprovalOffices, setSelectedApprovalOffices] = useState<Record<string, string>>({});
  const [selectedUserOffices, setSelectedUserOffices] = useState<Record<string, string>>({});
  const [selectedUserOfficeMemberships, setSelectedUserOfficeMemberships] = useState<
    Record<string, string[]>
  >({});
  const [officeNameDrafts, setOfficeNameDrafts] = useState<Record<string, string>>({});
  const [officeSettingsDrafts, setOfficeSettingsDrafts] = useState<Record<string, OfficeSettingsDraft>>({});
  const [updatingOfficeId, setUpdatingOfficeId] = useState<string | null>(null);
  const [createdLocalUser, setCreatedLocalUser] = useState<{
    email: string;
    password: string;
    generated: boolean;
  } | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const payload = await fetchAdminConfig();
        applyConfig(payload.auth);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load admin data');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const applyConfig = (auth: AdminConfigResponse['auth']) => {
    setConfig(auth);
    setNewLocalUserOfficeLocationId((current) =>
      getPreferredOfficeLocationId(auth.officeLocations, current),
    );
    setSelectedApprovalOffices((current) =>
      Object.fromEntries(
        auth.pendingApprovals.map((entry) => [
          entry.email,
          current[entry.email] || getPreferredOfficeLocationId(auth.officeLocations),
        ]),
      ),
    );
    setSelectedUserOffices((current) =>
      Object.fromEntries(
        auth.users.map((entry) => [
          entry.email,
          current[entry.email] ||
            getSelectedUserOfficeLocationId(auth.officeLocations, entry.officeLocationId),
        ]),
      ),
    );
    setSelectedUserOfficeMemberships((current) =>
      getSelectedUserOfficeMemberships(auth.users, current),
    );
    setOfficeNameDrafts(getOfficeNameDrafts(auth.officeLocations));
    setOfficeSettingsDrafts((current) => getOfficeSettingsDrafts(auth.officeLocations, current));
  };

  const refreshConfig = async () => {
    const payload = await fetchAdminConfig();
    applyConfig(payload.auth);
  };

  const localUserPasswordValidationError = useMemo(() => {
    const trimmed = newLocalUserPassword.trim();
    if (!trimmed) return '';
    if (trimmed.length < LOCAL_PASSWORD_MIN_LENGTH) {
      return `Password must be at least ${LOCAL_PASSWORD_MIN_LENGTH} characters.`;
    }
    if (trimmed.length > LOCAL_PASSWORD_MAX_LENGTH) {
      return `Password must be at most ${LOCAL_PASSWORD_MAX_LENGTH} characters.`;
    }
    return '';
  }, [newLocalUserPassword]);

  const handleApproveUser = async (email: string) => {
    setUpdatingApprovalEmail(email);
    setError('');
    try {
      const officeLocationId = selectedApprovalOffices[email];
      if (!officeLocationId) throw new Error('Office location is required');
      const response = await fetch(withBasePath('/api/auth/users/approve'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, officeLocationId }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || 'Failed to approve user');
      }
      await refreshConfig();
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : 'Approval failed');
    } finally {
      setUpdatingApprovalEmail(null);
    }
  };

  const handleDeclineUser = async (email: string) => {
    setUpdatingApprovalEmail(email);
    setError('');
    try {
      const response = await fetch(withBasePath('/api/auth/users/decline'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || 'Failed to decline user');
      }
      await refreshConfig();
    } catch (declineError) {
      setError(declineError instanceof Error ? declineError.message : 'Decline failed');
    } finally {
      setUpdatingApprovalEmail(null);
    }
  };

  const handleCreateLocalUser = async (event: FormEvent) => {
    event.preventDefault();
    if (localUserPasswordValidationError) {
      setError(localUserPasswordValidationError);
      return;
    }
    setCreatingLocalUser(true);
    setCreatedLocalUser(null);
    setError('');
    try {
      const response = await fetch(withBasePath('/api/auth/local/users/generate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: newLocalUserEmail.trim(),
          password: newLocalUserPassword.trim() || undefined,
          officeLocationId: newLocalUserOfficeLocationId || undefined,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { email?: string; password?: string; generated?: boolean; error?: string }
        | null;
      if (
        !response.ok ||
        !payload ||
        typeof payload.email !== 'string' ||
        typeof payload.password !== 'string'
      ) {
        throw new Error(payload?.error || 'Failed to create local user');
      }
      setCreatedLocalUser({ email: payload.email, password: payload.password, generated: !!payload.generated });
      setNewLocalUserPassword('');
      setNewLocalUserEmail('');
      await refreshConfig();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create local user');
    } finally {
      setCreatingLocalUser(false);
    }
  };

  const handlePromoteUser = async (email: string) => {
    setUpdatingUserRoleEmail(email);
    setError('');
    try {
      const response = await fetch(withBasePath('/api/auth/users/promote'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || 'Failed to promote user');
      }
      await refreshConfig();
    } catch (roleError) {
      setError(roleError instanceof Error ? roleError.message : 'Role update failed');
    } finally {
      setUpdatingUserRoleEmail(null);
    }
  };

  const handleDemoteUser = async (email: string) => {
    setUpdatingUserRoleEmail(email);
    setError('');
    try {
      const selectedOfficeLocationId = selectedUserOffices[email];
      const response = await fetch(withBasePath('/api/auth/users/demote'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, officeLocationId: selectedOfficeLocationId || undefined }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || 'Failed to demote user');
      }
      await refreshConfig();
    } catch (roleError) {
      setError(roleError instanceof Error ? roleError.message : 'Role update failed');
    } finally {
      setUpdatingUserRoleEmail(null);
    }
  };

  const handleBlockUser = async (email: string) => {
    setUpdatingUserRoleEmail(email);
    setError('');
    try {
      const response = await fetch(withBasePath('/api/auth/users/block'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || 'Failed to block user');
      }
      await refreshConfig();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'User status update failed');
    } finally {
      setUpdatingUserRoleEmail(null);
    }
  };

  const handleUnblockUser = async (email: string) => {
    setUpdatingUserRoleEmail(email);
    setError('');
    try {
      const response = await fetch(withBasePath('/api/auth/users/unblock'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || 'Failed to unblock user');
      }
      await refreshConfig();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'User status update failed');
    } finally {
      setUpdatingUserRoleEmail(null);
    }
  };

  const handleAssignOffice = async (email: string) => {
    setUpdatingUserRoleEmail(email);
    setError('');
    try {
      const officeLocationIds = selectedUserOfficeMemberships[email] ?? [];
      const preferredOfficeLocationId = selectedUserOffices[email] || undefined;
      const response = await fetch(withBasePath('/api/auth/users/assign-offices'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, officeLocationIds, preferredOfficeLocationId }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || 'Failed to assign offices');
      }
      await refreshConfig();
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : 'Office assignment failed');
    } finally {
      setUpdatingUserRoleEmail(null);
    }
  };

  const handleCreateOffice = async (event: FormEvent) => {
    event.preventDefault();
    setCreatingOffice(true);
    setError('');
    try {
      const response = await fetch(withBasePath('/api/auth/offices'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newOfficeName.trim() }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || 'Failed to create office');
      }
      setNewOfficeName('');
      await refreshConfig();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Office creation failed');
    } finally {
      setCreatingOffice(false);
    }
  };

  const handleRenameOffice = async (officeId: string) => {
    setUpdatingOfficeId(officeId);
    setError('');
    try {
      const response = await fetch(withBasePath(`/api/auth/offices/${officeId}/rename`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: officeNameDrafts[officeId]?.trim() ?? '' }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || 'Failed to rename office');
      }
      await refreshConfig();
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : 'Office rename failed');
    } finally {
      setUpdatingOfficeId(null);
    }
  };

  const handleDeactivateOffice = async (officeId: string) => {
    setUpdatingOfficeId(officeId);
    setError('');
    try {
      const response = await fetch(withBasePath(`/api/auth/offices/${officeId}/deactivate`), {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || 'Failed to deactivate office');
      }
      await refreshConfig();
    } catch (deactivateError) {
      setError(deactivateError instanceof Error ? deactivateError.message : 'Office deactivation failed');
    } finally {
      setUpdatingOfficeId(null);
    }
  };

  const handleUpdateOfficeSettings = async (officeId: string) => {
    setUpdatingOfficeId(officeId);
    setError('');
    try {
      const draft = officeSettingsDrafts[officeId];
      const response = await fetch(withBasePath(`/api/auth/offices/${officeId}/settings`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          autoStartPollEnabled: draft?.autoStartPollEnabled ?? false,
          autoStartPollWeekdays: draft?.autoStartPollWeekdays ?? [],
          autoStartPollFinishTime: draft?.autoStartPollFinishTime?.trim() || null,
          defaultFoodSelectionDurationMinutes: draft?.defaultFoodSelectionDurationMinutes ?? 30,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || 'Failed to update office settings');
      }
      await refreshConfig();
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : 'Office settings update failed');
    } finally {
      setUpdatingOfficeId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
        Loading...
      </div>
    );
  }

  if (error && !config) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4 lg:px-6">
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </div>
    );
  }

  if (!config?.isAdmin) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4 lg:px-6">
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Access denied.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-4 lg:px-6">
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 p-6 pb-4">
          <h1 className="text-2xl font-semibold text-gray-900">Administration</h1>
          <p className="mt-1 text-sm text-gray-600">Approve access requests and manage users and offices.</p>
          {error && (
            <div className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="space-y-4 p-6">

          <div className="rounded border border-gray-200 bg-gray-50 p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Pending approvals</h2>
            {config.pendingApprovals.length === 0 ? (
              <p className="text-sm text-gray-600">No pending users.</p>
            ) : (
              <ul className="space-y-2">
                {config.pendingApprovals.map((entry) => (
                  <li
                    key={entry.email}
                    className="rounded border border-gray-200 bg-white px-3 py-2 text-sm"
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <span className="text-gray-800">{entry.email}</span>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={selectedApprovalOffices[entry.email] ?? ''}
                          onChange={(event) =>
                            setSelectedApprovalOffices((current) => ({
                              ...current,
                              [entry.email]: event.target.value,
                            }))
                          }
                          className="rounded border border-gray-300 px-2 py-1 text-xs"
                        >
                          <option value="">Select office</option>
                          {config.officeLocations.filter((l) => l.isActive).map((l) => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={updatingApprovalEmail === entry.email || !selectedApprovalOffices[entry.email]}
                          onClick={() => void handleApproveUser(entry.email)}
                          className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
                        >
                          {updatingApprovalEmail === entry.email ? 'Updating...' : 'Approve'}
                        </button>
                        <button
                          type="button"
                          disabled={updatingApprovalEmail === entry.email}
                          onClick={() => void handleDeclineUser(entry.email)}
                          className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
                        >
                          {updatingApprovalEmail === entry.email ? 'Updating...' : 'Decline'}
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded border border-gray-200 bg-gray-50 p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Create local user</h2>
            <form onSubmit={(event) => void handleCreateLocalUser(event)} className="space-y-3">
              <input
                type="email"
                value={newLocalUserEmail}
                onChange={(event) => setNewLocalUserEmail(event.target.value)}
                placeholder="Email"
                required
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              <select
                aria-label="Office location for new local user"
                value={newLocalUserOfficeLocationId}
                onChange={(event) => setNewLocalUserOfficeLocationId(event.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">Select office location</option>
                {config.officeLocations.filter((l) => l.isActive).map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
              <input
                type="text"
                value={newLocalUserPassword}
                onChange={(event) => setNewLocalUserPassword(event.target.value)}
                placeholder="Password (leave empty to auto-generate)"
                aria-invalid={!!localUserPasswordValidationError}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              {localUserPasswordValidationError && (
                <p className="text-xs text-red-600">{localUserPasswordValidationError}</p>
              )}
              <button
                type="submit"
                disabled={creatingLocalUser || !!localUserPasswordValidationError || !newLocalUserOfficeLocationId}
                className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {creatingLocalUser ? 'Creating...' : 'Create local user'}
              </button>
            </form>
            {createdLocalUser && (
              <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                <div className="font-medium">Credentials created for {createdLocalUser.email}</div>
                <div className="mt-1 break-all">
                  Temporary password: <code>{createdLocalUser.password}</code>
                </div>
                {createdLocalUser.generated && (
                  <div className="mt-1 text-xs text-blue-700">
                    Password was auto-generated. Share it securely once.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded border border-gray-200 bg-gray-50 p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Office locations</h2>
            <form onSubmit={(event) => void handleCreateOffice(event)} className="mb-3 flex gap-2">
              <input
                type="text"
                value={newOfficeName}
                onChange={(event) => setNewOfficeName(event.target.value)}
                placeholder="New office location"
                className="min-w-0 flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={creatingOffice || !newOfficeName.trim()}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {creatingOffice ? 'Creating...' : 'Add office'}
              </button>
            </form>
            <ul className="space-y-2">
              {config.officeLocations.map((location) => {
                const settingsDraft = officeSettingsDrafts[location.id] ?? {
                  autoStartPollEnabled: location.autoStartPollEnabled,
                  autoStartPollWeekdays: location.autoStartPollWeekdays,
                  autoStartPollFinishTime: location.autoStartPollFinishTime ?? '',
                  defaultFoodSelectionDurationMinutes: location.defaultFoodSelectionDurationMinutes,
                };
                const settingsChanged =
                  settingsDraft.autoStartPollEnabled !== location.autoStartPollEnabled ||
                  settingsDraft.autoStartPollFinishTime !== (location.autoStartPollFinishTime ?? '') ||
                  settingsDraft.defaultFoodSelectionDurationMinutes !== location.defaultFoodSelectionDurationMinutes ||
                  settingsDraft.autoStartPollWeekdays.join('|') !== location.autoStartPollWeekdays.join('|');

                return (
                  <li key={location.id} className="rounded border border-gray-200 bg-white px-3 py-3 text-sm">
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-800">{location.name}</p>
                          <p className="text-xs text-gray-500">
                            Key: {location.key} · {location.isActive ? 'Active' : 'Inactive'}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 md:flex-row">
                        <input
                          type="text"
                          aria-label={`Office name for ${location.key}`}
                          value={officeNameDrafts[location.id] ?? ''}
                          onChange={(event) =>
                            setOfficeNameDrafts((current) => ({
                              ...current,
                              [location.id]: event.target.value,
                            }))
                          }
                          className="min-w-0 flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            aria-label={`Rename office ${location.key}`}
                            disabled={
                              updatingOfficeId === location.id ||
                              !officeNameDrafts[location.id]?.trim() ||
                              officeNameDrafts[location.id]?.trim() === location.name
                            }
                            onClick={() => void handleRenameOffice(location.id)}
                            className="rounded border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-60"
                          >
                            {updatingOfficeId === location.id ? 'Updating...' : 'Rename'}
                          </button>
                          <button
                            type="button"
                            aria-label={`Deactivate office ${location.key}`}
                            disabled={
                              updatingOfficeId === location.id ||
                              !location.isActive ||
                              location.key === 'default'
                            }
                            onClick={() => void handleDeactivateOffice(location.id)}
                            className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                          >
                            {updatingOfficeId === location.id ? 'Updating...' : 'Deactivate'}
                          </button>
                        </div>
                      </div>

                      <div className="rounded border border-slate-200 bg-slate-50 p-3">
                        <div className="flex flex-col gap-3">
                          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                            <input
                              type="checkbox"
                              aria-label={`Enable scheduled poll for ${location.key}`}
                              checked={settingsDraft.autoStartPollEnabled}
                              disabled={updatingOfficeId === location.id || !location.isActive}
                              onChange={(event) =>
                                setOfficeSettingsDrafts((current) => ({
                                  ...current,
                                  [location.id]: {
                                    ...(current[location.id] ?? settingsDraft),
                                    autoStartPollEnabled: event.target.checked,
                                  },
                                }))
                              }
                            />
                            Auto-start lunch poll
                          </label>

                          <div className="grid gap-3 lg:grid-cols-2">
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Weekdays</p>
                              <div className="flex flex-wrap gap-2">
                                {OFFICE_WEEKDAY_OPTIONS.map((weekday) => {
                                  const checked = settingsDraft.autoStartPollWeekdays.includes(weekday.value);
                                  return (
                                    <label key={weekday.value} className="flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700">
                                      <input
                                        type="checkbox"
                                        aria-label={`${weekday.label} auto poll for ${location.key}`}
                                        checked={checked}
                                        disabled={
                                          updatingOfficeId === location.id ||
                                          !location.isActive ||
                                          !settingsDraft.autoStartPollEnabled
                                        }
                                        onChange={(event) =>
                                          setOfficeSettingsDrafts((current) => {
                                            const currentDraft = current[location.id] ?? settingsDraft;
                                            const nextWeekdays = orderWeekdays(
                                              event.target.checked
                                                ? [...currentDraft.autoStartPollWeekdays, weekday.value]
                                                : currentDraft.autoStartPollWeekdays.filter((v) => v !== weekday.value),
                                            );
                                            return {
                                              ...current,
                                              [location.id]: { ...currentDraft, autoStartPollWeekdays: nextWeekdays },
                                            };
                                          })
                                        }
                                      />
                                      <span>{weekday.label}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>

                            <label className="text-sm text-slate-700">
                              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Poll should finish by
                              </span>
                              <input
                                type="time"
                                aria-label={`Auto-start finish time for ${location.key}`}
                                value={settingsDraft.autoStartPollFinishTime}
                                disabled={
                                  updatingOfficeId === location.id ||
                                  !location.isActive ||
                                  !settingsDraft.autoStartPollEnabled
                                }
                                onChange={(event) =>
                                  setOfficeSettingsDrafts((current) => ({
                                    ...current,
                                    [location.id]: {
                                      ...(current[location.id] ?? settingsDraft),
                                      autoStartPollFinishTime: event.target.value,
                                    },
                                  }))
                                }
                                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100"
                              />
                            </label>
                          </div>

                          <label className="text-sm text-slate-700">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Default food-selection duration
                            </span>
                            <select
                              aria-label={`Default food selection duration for ${location.key}`}
                              value={settingsDraft.defaultFoodSelectionDurationMinutes}
                              disabled={updatingOfficeId === location.id}
                              onChange={(event) =>
                                setOfficeSettingsDrafts((current) => ({
                                  ...current,
                                  [location.id]: {
                                    ...(current[location.id] ?? settingsDraft),
                                    defaultFoodSelectionDurationMinutes: Number(event.target.value),
                                  },
                                }))
                              }
                              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                            >
                              {FOOD_DURATIONS.map((d) => (
                                <option key={d} value={d}>{d} min</option>
                              ))}
                            </select>
                          </label>

                          <div className="flex justify-end">
                            <button
                              type="button"
                              aria-label={`Save office settings for ${location.key}`}
                              disabled={updatingOfficeId === location.id || !location.isActive || !settingsChanged}
                              onClick={() => void handleUpdateOfficeSettings(location.id)}
                              className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                            >
                              {updatingOfficeId === location.id ? 'Updating...' : 'Save settings'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded border border-gray-200 bg-gray-50 p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Users</h2>
            {config.users.length === 0 ? (
              <p className="text-sm text-gray-600">No users yet.</p>
            ) : (
              <ul className="space-y-2">
                {config.users.map((entry) => {
                  const isCurrentUser = config.user?.username === entry.email;
                  return (
                    <li key={entry.email} className="rounded border border-gray-200 bg-white px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-gray-800">{entry.email}</p>
                          <p className="text-xs text-gray-500">
                            {entry.blocked ? 'Blocked' : entry.approved ? 'Approved' : 'Pending'} ·{' '}
                            {entry.isAdmin ? 'Admin' : 'User'}
                          </p>
                          <p className="text-xs text-gray-500">
                            Preferred office: {entry.officeLocationName ?? 'Unassigned'}
                          </p>
                          <p className="text-xs text-gray-500">
                            Assigned offices:{' '}
                            {entry.assignedOfficeLocations.length > 0
                              ? entry.assignedOfficeLocations.map((l) => l.name).join(', ')
                              : 'None'}
                          </p>
                        </div>
                        <div className="flex max-w-xl flex-col gap-2">
                          <div className="flex flex-wrap gap-2">
                            {config.officeLocations
                              .filter((l) => l.isActive)
                              .map((location) => {
                                const selectedMemberships = selectedUserOfficeMemberships[entry.email] ?? [];
                                const checked = selectedMemberships.includes(location.id);
                                return (
                                  <label key={location.id} className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700">
                                    <input
                                      type="checkbox"
                                      aria-label={`${location.name} membership for ${entry.email}`}
                                      checked={checked}
                                      disabled={updatingUserRoleEmail === entry.email}
                                      onChange={(event) =>
                                        setSelectedUserOfficeMemberships((current) => {
                                          const currentMemberships = current[entry.email] ?? [];
                                          const nextMemberships = event.target.checked
                                            ? [...currentMemberships, location.id]
                                            : currentMemberships.filter((id) => id !== location.id);

                                          setSelectedUserOffices((currentPreferred) => {
                                            const currentOffice = currentPreferred[entry.email];
                                            if (event.target.checked) {
                                              return { ...currentPreferred, [entry.email]: currentOffice || location.id };
                                            }
                                            if (currentOffice === location.id) {
                                              return { ...currentPreferred, [entry.email]: nextMemberships[0] ?? '' };
                                            }
                                            return currentPreferred;
                                          });

                                          return { ...current, [entry.email]: nextMemberships };
                                        })
                                      }
                                    />
                                    <span>{location.name}</span>
                                  </label>
                                );
                              })}
                          </div>
                          <select
                            aria-label={`Preferred office for ${entry.email}`}
                            value={selectedUserOffices[entry.email] ?? ''}
                            onChange={(event) =>
                              setSelectedUserOffices((current) => ({
                                ...current,
                                [entry.email]: event.target.value,
                              }))
                            }
                            disabled={
                              updatingUserRoleEmail === entry.email ||
                              (selectedUserOfficeMemberships[entry.email] ?? []).length === 0
                            }
                            className="rounded border border-gray-300 px-2 py-1 text-xs"
                          >
                            <option value="">Select preferred office</option>
                            {config.officeLocations
                              .filter((l) =>
                                (selectedUserOfficeMemberships[entry.email] ?? []).includes(l.id),
                              )
                              .map((l) => (
                                <option key={l.id} value={l.id}>{l.name}</option>
                              ))}
                          </select>
                          <button
                            type="button"
                            disabled={
                              updatingUserRoleEmail === entry.email ||
                              ((selectedUserOfficeMemberships[entry.email] ?? []).length === 0 && !entry.isAdmin) ||
                              (((selectedUserOfficeMemberships[entry.email] ?? []).join('|') ===
                                entry.assignedOfficeLocationIds.join('|')) &&
                                (selectedUserOffices[entry.email] ?? '') === (entry.officeLocationId ?? ''))
                            }
                            onClick={() => void handleAssignOffice(entry.email)}
                            className="rounded border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-60"
                          >
                            {updatingUserRoleEmail === entry.email ? 'Updating...' : 'Save offices'}
                          </button>
                          {entry.isAdmin ? (
                            <button
                              type="button"
                              disabled={updatingUserRoleEmail === entry.email || isCurrentUser || entry.blocked}
                              onClick={() => void handleDemoteUser(entry.email)}
                              className="rounded border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                            >
                              {updatingUserRoleEmail === entry.email ? 'Updating...' : 'Demote'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={updatingUserRoleEmail === entry.email || entry.blocked}
                              onClick={() => void handlePromoteUser(entry.email)}
                              className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                            >
                              {updatingUserRoleEmail === entry.email ? 'Updating...' : 'Promote'}
                            </button>
                          )}
                          {entry.blocked ? (
                            <button
                              type="button"
                              disabled={updatingUserRoleEmail === entry.email}
                              onClick={() => void handleUnblockUser(entry.email)}
                              className="rounded border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                            >
                              {updatingUserRoleEmail === entry.email ? 'Updating...' : 'Unblock'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={updatingUserRoleEmail === entry.email || isCurrentUser}
                              onClick={() => void handleBlockUser(entry.email)}
                              className="rounded bg-rose-600 px-3 py-1 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-60"
                            >
                              {updatingUserRoleEmail === entry.email ? 'Updating...' : 'Block'}
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
