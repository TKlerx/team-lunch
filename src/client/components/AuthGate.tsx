import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { withBasePath } from '../config.js';
import { AdminOfficeProvider } from '../context/AdminOfficeContext.js';
import type { OfficeLocation } from '../../lib/types.js';

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
  };
};

interface AuthGateProps {
  children: ReactNode;
}

const NICKNAME_STORAGE_KEY = 'team_lunch_nickname';
const AUTH_METHOD_STORAGE_KEY = 'team_lunch_auth_method';
const AUTH_ROLE_STORAGE_KEY = 'team_lunch_auth_role';

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

export default function AuthGate({ children }: AuthGateProps) {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<AuthConfigResponse['auth'] | null>(null);
  const [error, setError] = useState('');
  const [authWarning, setAuthWarning] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError('');
      setAuthWarning('');
      try {
        const payload = await fetchAuthConfig();
        setConfig(payload.auth);
        setAuthWarning(payload.auth.warning ?? '');
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
          <div className="rounded border border-gray-200 bg-gray-50 p-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Access status</h3>
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

  if (config?.authenticated && config.approved) {
    return (
      <AdminOfficeProvider
        authenticated={config.authenticated}
        isAdmin={config.isAdmin}
        officeLocationId={config.officeLocation?.id ?? null}
        officeLocations={config.isAdmin ? config.officeLocations : config.accessibleOfficeLocations}
        pendingApprovalCount={config.isAdmin ? config.pendingApprovals.length : 0}
      >
        {children}
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
                  if (!microsoftConfigured) return;
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
