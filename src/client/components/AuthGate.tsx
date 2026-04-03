import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { withBasePath } from '../config.js';
import { AdminOfficeProvider } from '../context/AdminOfficeContext.js';
import type { OfficeLocation, OfficeWeekday } from '../../lib/types.js';

type AuthMethod = 'entra' | 'local';

type AuthConfigResponse = {
  auth: {
    entraEnabled: boolean;
    localEnabled: boolean;
    authenticated: boolean;
    warning?: string;
    user: { username: string; method: AuthMethod } | null;
    officeLocation: { id: string; key: string; name: string } | null;
    officeLocations: OfficeLocation[];
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
};

interface AuthGateProps {
  children: ReactNode;
}

const NICKNAME_STORAGE_KEY = 'team_lunch_nickname';
const AUTH_METHOD_STORAGE_KEY = 'team_lunch_auth_method';
const AUTH_ROLE_STORAGE_KEY = 'team_lunch_auth_role';
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

async function fetchAuthConfig(): Promise<AuthConfigResponse> {
  const response = await fetch(withBasePath('/api/auth/config'), { credentials: 'include' });
  if (!response.ok) {
    throw new Error('Failed to load authentication config');
  }
  return response.json() as Promise<AuthConfigResponse>;
}

function getPreferredOfficeLocationId(
  auth: AuthConfigResponse['auth'],
  currentOfficeLocationId?: string | null,
): string {
  if (
    currentOfficeLocationId &&
    auth.officeLocations.some((location) => location.id === currentOfficeLocationId && location.isActive)
  ) {
    return currentOfficeLocationId;
  }

  return auth.officeLocations.find((location) => location.isActive)?.id ?? '';
}

function getSelectedUserOfficeLocationId(
  auth: AuthConfigResponse['auth'],
  currentOfficeLocationId?: string | null,
): string {
  if (
    currentOfficeLocationId &&
    auth.officeLocations.some((location) => location.id === currentOfficeLocationId && location.isActive)
  ) {
    return currentOfficeLocationId;
  }

  return '';
}

function getOfficeNameDrafts(auth: AuthConfigResponse['auth']): Record<string, string> {
  return Object.fromEntries(auth.officeLocations.map((location) => [location.id, location.name]));
}

function orderWeekdays(weekdays: OfficeWeekday[]): OfficeWeekday[] {
  return OFFICE_WEEKDAY_OPTIONS.map((option) => option.value).filter((weekday) =>
    weekdays.includes(weekday),
  );
}

function getOfficeSettingsDrafts(
  auth: AuthConfigResponse['auth'],
  currentDrafts: Record<string, OfficeSettingsDraft>,
): Record<string, OfficeSettingsDraft> {
  return Object.fromEntries(
    auth.officeLocations.map((location) => [
      location.id,
      currentDrafts[location.id] || {
        autoStartPollEnabled: location.autoStartPollEnabled,
        autoStartPollWeekdays: orderWeekdays(location.autoStartPollWeekdays),
        autoStartPollFinishTime: location.autoStartPollFinishTime ?? '',
        defaultFoodSelectionDurationMinutes: location.defaultFoodSelectionDurationMinutes,
      },
    ]),
  );
}

function getSelectedUserOfficeMemberships(
  auth: AuthConfigResponse['auth'],
  currentMemberships: Record<string, string[]>,
): Record<string, string[]> {
  return Object.fromEntries(
    auth.users.map((entry) => [
      entry.email,
      currentMemberships[entry.email] || entry.assignedOfficeLocationIds || [],
    ]),
  );
}

export default function AuthGate({ children }: AuthGateProps) {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<AuthConfigResponse['auth'] | null>(null);
  const [error, setError] = useState('');
  const [authWarning, setAuthWarning] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [updatingApprovalEmail, setUpdatingApprovalEmail] = useState<string | null>(null);
  const [updatingUserRoleEmail, setUpdatingUserRoleEmail] = useState<string | null>(null);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
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
  const [officeSettingsDrafts, setOfficeSettingsDrafts] = useState<Record<string, OfficeSettingsDraft>>(
    {},
  );
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
      setAuthWarning('');
      try {
        const payload = await fetchAuthConfig();
        setConfig(payload.auth);
        setAuthWarning(payload.auth.warning ?? '');
        setNewLocalUserOfficeLocationId((current) =>
          getPreferredOfficeLocationId(payload.auth, current),
        );
        setSelectedApprovalOffices((current) =>
          Object.fromEntries(
            payload.auth.pendingApprovals.map((entry) => [
              entry.email,
              current[entry.email] || getPreferredOfficeLocationId(payload.auth),
            ]),
          ),
        );
        setSelectedUserOffices((current) =>
          Object.fromEntries(
            payload.auth.users.map((entry) => [
              entry.email,
              current[entry.email] || getSelectedUserOfficeLocationId(payload.auth, entry.officeLocationId),
            ]),
          ),
        );
        setSelectedUserOfficeMemberships((current) =>
          getSelectedUserOfficeMemberships(payload.auth, current),
        );
        setOfficeNameDrafts(getOfficeNameDrafts(payload.auth));
        setOfficeSettingsDrafts((current) => getOfficeSettingsDrafts(payload.auth, current));
        setAdminPanelOpen(
          payload.auth.authenticated && payload.auth.isAdmin && payload.auth.pendingApprovals.length > 0,
        );
        if (payload.auth.authenticated && payload.auth.user) {
          localStorage.setItem(NICKNAME_STORAGE_KEY, payload.auth.user.username);
          localStorage.setItem(AUTH_METHOD_STORAGE_KEY, payload.auth.user.method);
          if (payload.auth.role) {
            localStorage.setItem(AUTH_ROLE_STORAGE_KEY, payload.auth.role);
          } else {
            localStorage.removeItem(AUTH_ROLE_STORAGE_KEY);
          }
        } else if (!payload.auth.entraEnabled && payload.auth.localEnabled) {
          localStorage.removeItem(AUTH_ROLE_STORAGE_KEY);
        } else {
          localStorage.removeItem(AUTH_ROLE_STORAGE_KEY);
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Authentication unavailable');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const authAvailable = useMemo(() => {
    if (!config) return false;
    return config.entraEnabled || config.localEnabled;
  }, [config]);
  const localUserPasswordValidationError = useMemo(() => {
    const trimmed = newLocalUserPassword.trim();
    if (!trimmed) {
      return '';
    }
    if (trimmed.length < LOCAL_PASSWORD_MIN_LENGTH) {
      return `Password must be at least ${LOCAL_PASSWORD_MIN_LENGTH} characters.`;
    }
    if (trimmed.length > LOCAL_PASSWORD_MAX_LENGTH) {
      return `Password must be at most ${LOCAL_PASSWORD_MAX_LENGTH} characters.`;
    }
    return '';
  }, [newLocalUserPassword]);

  const refreshConfig = async () => {
    const payload = await fetchAuthConfig();
    setConfig(payload.auth);
    setAuthWarning(payload.auth.warning ?? '');
    setNewLocalUserOfficeLocationId((current) =>
      getPreferredOfficeLocationId(payload.auth, current),
    );
    setSelectedApprovalOffices((current) =>
      Object.fromEntries(
        payload.auth.pendingApprovals.map((entry) => [
          entry.email,
          current[entry.email] || getPreferredOfficeLocationId(payload.auth),
        ]),
      ),
    );
    setSelectedUserOffices((current) =>
      Object.fromEntries(
        payload.auth.users.map((entry) => [
          entry.email,
          current[entry.email] || getSelectedUserOfficeLocationId(payload.auth, entry.officeLocationId),
        ]),
      ),
    );
    setSelectedUserOfficeMemberships((current) =>
      getSelectedUserOfficeMemberships(payload.auth, current),
    );
    setOfficeNameDrafts(getOfficeNameDrafts(payload.auth));
    setOfficeSettingsDrafts((current) => getOfficeSettingsDrafts(payload.auth, current));
    if (payload.auth.authenticated && payload.auth.isAdmin && payload.auth.pendingApprovals.length > 0) {
      setAdminPanelOpen(true);
    }
    if (payload.auth.authenticated && payload.auth.user) {
      localStorage.setItem(NICKNAME_STORAGE_KEY, payload.auth.user.username);
      localStorage.setItem(AUTH_METHOD_STORAGE_KEY, payload.auth.user.method);
      if (payload.auth.role) {
        localStorage.setItem(AUTH_ROLE_STORAGE_KEY, payload.auth.role);
      } else {
        localStorage.removeItem(AUTH_ROLE_STORAGE_KEY);
      }
    } else {
      localStorage.removeItem(AUTH_ROLE_STORAGE_KEY);
    }
  };

  const handleLocalLogin = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(withBasePath('/api/auth/local/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { username?: string; method?: AuthMethod; error?: string }
        | null;
      if (!response.ok || !payload || typeof payload.username !== 'string') {
        throw new Error(payload?.error || 'Invalid username or password');
      }

      localStorage.setItem(NICKNAME_STORAGE_KEY, payload.username);
      localStorage.setItem(AUTH_METHOD_STORAGE_KEY, payload.method ?? 'local');
      window.location.reload();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveUser = async (email: string) => {
    setUpdatingApprovalEmail(email);
    setError('');
    try {
      const officeLocationId = selectedApprovalOffices[email];
      if (!officeLocationId) {
        throw new Error('Office location is required');
      }
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

      setCreatedLocalUser({
        email: payload.email,
        password: payload.password,
        generated: !!payload.generated,
      });
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
        body: JSON.stringify({
          email,
          officeLocationId: selectedOfficeLocationId || undefined,
        }),
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
      setError(
        deactivateError instanceof Error ? deactivateError.message : 'Office deactivation failed',
      );
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
          defaultFoodSelectionDurationMinutes:
            draft?.defaultFoodSelectionDurationMinutes ?? 30,
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
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-sm text-gray-700">
        Loading authentication...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!authAvailable) {
    return <>{children}</>;
  }

  if (config?.authenticated && config.blocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-xl rounded-lg border border-red-200 bg-white p-6 shadow-sm">
          <h2 className="mb-2 text-lg font-semibold text-gray-900">Access blocked</h2>
          <p className="mb-4 text-sm text-gray-700">
            Your account has been blocked by an administrator. Contact the app administrator if this is unexpected.
          </p>
          <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Signed in as {config.user?.username ?? 'unknown user'}.
          </div>
        </div>
      </div>
    );
  }

  if (config?.authenticated && config.approvalRequired && !config.approved && !config.isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-2 text-lg font-semibold text-gray-900">Welcome</h2>
          <p className="mb-4 text-sm text-gray-700">
            Your account is awaiting admin approval. Please contact your lunch app administrator.
          </p>
          {error && (
            <div className="mb-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="rounded border border-gray-200 bg-gray-50 p-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">
              Access status
            </h3>
            <p className="text-sm text-gray-600">Pending approval by administrator.</p>
            {config.officeLocation ? (
              <p className="mt-2 text-xs text-gray-500">
                Assigned office: {config.officeLocation.name}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (config?.authenticated && config.isAdmin && adminPanelOpen) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-2 text-lg font-semibold text-gray-900">Admin panel</h2>
          <p className="mb-4 text-sm text-gray-700">Approve access requests and create local users.</p>
          {error && (
            <div className="mb-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mb-4 rounded border border-gray-200 bg-gray-50 p-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Pending approvals</h3>
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
                          {config.officeLocations.filter((location) => location.isActive).map((location) => (
                            <option key={location.id} value={location.id}>
                              {location.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={
                            updatingApprovalEmail === entry.email ||
                            !selectedApprovalOffices[entry.email]
                          }
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
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Create local user</h3>
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
                {config.officeLocations.filter((location) => location.isActive).map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
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
                disabled={
                  creatingLocalUser ||
                  !!localUserPasswordValidationError ||
                  !newLocalUserOfficeLocationId
                }
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

          <div className="mt-4 rounded border border-gray-200 bg-gray-50 p-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Office locations</h3>
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
                  settingsDraft.defaultFoodSelectionDurationMinutes !==
                    location.defaultFoodSelectionDurationMinutes ||
                  settingsDraft.autoStartPollWeekdays.join('|') !==
                    location.autoStartPollWeekdays.join('|');

                return (
                  <li
                    key={location.id}
                    className="rounded border border-gray-200 bg-white px-3 py-3 text-sm"
                  >
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
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Weekdays
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {OFFICE_WEEKDAY_OPTIONS.map((weekday) => {
                                  const checked = settingsDraft.autoStartPollWeekdays.includes(
                                    weekday.value,
                                  );
                                  return (
                                    <label
                                      key={weekday.value}
                                      className="flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700"
                                    >
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
                                                : currentDraft.autoStartPollWeekdays.filter(
                                                    (value) => value !== weekday.value,
                                                  ),
                                            );
                                            return {
                                              ...current,
                                              [location.id]: {
                                                ...currentDraft,
                                                autoStartPollWeekdays: nextWeekdays,
                                              },
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
                              {FOOD_DURATIONS.map((duration) => (
                                <option key={duration} value={duration}>
                                  {duration} min
                                </option>
                              ))}
                            </select>
                          </label>

                          <div className="flex justify-end">
                            <button
                              type="button"
                              aria-label={`Save office settings for ${location.key}`}
                              disabled={
                                updatingOfficeId === location.id ||
                                !location.isActive ||
                                !settingsChanged
                              }
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

          <div className="mt-4 rounded border border-gray-200 bg-gray-50 p-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Users</h3>
            {config.users.length === 0 ? (
              <p className="text-sm text-gray-600">No users yet.</p>
            ) : (
              <ul className="space-y-2">
                {config.users.map((entry) => {
                  const isCurrentUser = config.user?.username === entry.email;
                  return (
                    <li
                      key={entry.email}
                      className="rounded border border-gray-200 bg-white px-3 py-2 text-sm"
                    >
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
                              ? entry.assignedOfficeLocations.map((location) => location.name).join(', ')
                              : 'None'}
                          </p>
                        </div>
                        <div className="flex max-w-xl flex-col gap-2">
                          <div className="flex flex-wrap gap-2">
                            {config.officeLocations
                              .filter((location) => location.isActive)
                              .map((location) => {
                                const selectedMemberships = selectedUserOfficeMemberships[entry.email] ?? [];
                                const checked = selectedMemberships.includes(location.id);
                                return (
                                  <label
                                    key={location.id}
                                    className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700"
                                  >
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
                                            : currentMemberships.filter((officeId) => officeId !== location.id);

                                          setSelectedUserOffices((currentPreferred) => {
                                            const currentOffice = currentPreferred[entry.email];
                                            if (event.target.checked) {
                                              return {
                                                ...currentPreferred,
                                                [entry.email]: currentOffice || location.id,
                                              };
                                            }
                                            if (currentOffice === location.id) {
                                              return {
                                                ...currentPreferred,
                                                [entry.email]: nextMemberships[0] ?? '',
                                              };
                                            }
                                            return currentPreferred;
                                          });

                                          return {
                                            ...current,
                                            [entry.email]: nextMemberships,
                                          };
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
                              .filter((location) =>
                                (selectedUserOfficeMemberships[entry.email] ?? []).includes(location.id),
                              )
                              .map((location) => (
                                <option key={location.id} value={location.id}>
                                  {location.name}
                                </option>
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
                              disabled={
                                updatingUserRoleEmail === entry.email || isCurrentUser || entry.blocked
                              }
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

          <button
            type="button"
            onClick={() => {
              setAdminPanelOpen(false);
            }}
            className="mt-4 w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Continue to app
          </button>
        </div>
      </div>
    );
  }

  if (config?.authenticated && config.approved) {
    return (
      <AdminOfficeProvider
        authenticated={config.authenticated}
        isAdmin={config.isAdmin}
        officeLocationId={config.officeLocation?.id ?? null}
        officeLocations={config.isAdmin ? config.officeLocations : config.accessibleOfficeLocations}
      >
        <>
          {children}
          {config.officeLocation && !config.isAdmin && (
            <div className="fixed bottom-4 left-4 z-40 rounded border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 shadow">
              Office: {config.officeLocation.name}
            </div>
          )}
          {config.isAdmin && (
            <button
              type="button"
              onClick={() => {
                setAdminPanelOpen(true);
              }}
              className="fixed bottom-4 right-4 z-50 rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow hover:bg-slate-800"
            >
              Admin panel
            </button>
          )}
        </>
      </AdminOfficeProvider>
    );
  }

  const showDualAuth = !!(config?.entraEnabled && config.localEnabled);
  const showLocalLogin = !!config?.localEnabled;
  const microsoftConfigured = !!config?.entraEnabled;
  const showMicrosoftLogin = microsoftConfigured || showLocalLogin;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Sign in</h2>
        {authWarning && (
          <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {authWarning}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className={showDualAuth ? 'grid gap-4 md:grid-cols-2' : 'space-y-3'}>
          {showMicrosoftLogin && (
            <div className="space-y-2 rounded border border-gray-200 p-3">
              <p className="text-sm font-medium text-gray-700">Microsoft SSO</p>
              <button
                type="button"
                onClick={() => {
                  if (!microsoftConfigured) {
                    return;
                  }
                  localStorage.setItem(AUTH_METHOD_STORAGE_KEY, 'entra');
                  window.location.href = withBasePath('/api/auth/entra/login');
                }}
                disabled={!microsoftConfigured}
                title={!microsoftConfigured ? 'Microsoft Entra sign-in is not configured' : undefined}
                className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                Continue with Microsoft
              </button>
              {!microsoftConfigured && (
                <p className="text-xs text-gray-500">
                  Microsoft Entra sign-in is not configured for this deployment.
                </p>
              )}
            </div>
          )}

          {showLocalLogin && (
            <form
              onSubmit={(event) => void handleLocalLogin(event)}
              className="space-y-3 rounded border border-gray-200 p-3"
            >
              <p className="text-sm font-medium text-gray-700">Local account</p>
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Username"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {submitting ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
          )}
        </div>

        {!showMicrosoftLogin && !showLocalLogin && (
          <p className="text-sm text-gray-600">No authentication methods are currently available.</p>
        )}
      </div>
    </div>
  );
}
