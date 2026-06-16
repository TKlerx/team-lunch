import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { withBasePath } from '../config.js';
import { AdminOfficeProvider } from '../context/AdminOfficeContext.js';
import { Button } from './ui/Button.js';
import { Card } from './ui/Card.js';
import { Input } from './ui/Input.js';
import { Panel } from './ui/Panel.js';
import type { AuthConfigResponse, AuthMethod } from '../../lib/types.js';
import {
  ACTOR_KEY_STORAGE_KEY,
  AUTH_METHOD_STORAGE_KEY,
  AUTH_ROLE_STORAGE_KEY,
  DISPLAY_NAME_STORAGE_KEY,
} from '../auth.js';

interface AuthGateProps {
  children: ReactNode;
}

async function fetchAuthConfig(): Promise<AuthConfigResponse> {
  const response = await fetch(withBasePath('/api/auth/config'), { credentials: 'include' });
  if (!response.ok) {
    throw new Error('Failed to load authentication config');
  }
  return response.json() as Promise<AuthConfigResponse>;
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
          localStorage.setItem(ACTOR_KEY_STORAGE_KEY, payload.auth.user.username);
          if (payload.auth.user.displayName) {
            localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, payload.auth.user.displayName);
          } else {
            localStorage.removeItem(DISPLAY_NAME_STORAGE_KEY);
          }
          localStorage.setItem(AUTH_METHOD_STORAGE_KEY, payload.auth.user.method);
          if (payload.auth.role) {
            localStorage.setItem(AUTH_ROLE_STORAGE_KEY, payload.auth.role);
          } else {
            localStorage.removeItem(AUTH_ROLE_STORAGE_KEY);
          }
        } else {
          localStorage.removeItem(AUTH_ROLE_STORAGE_KEY);
        }
        if (!payload.auth.entraEnabled && !payload.auth.localEnabled) {
          localStorage.removeItem(AUTH_METHOD_STORAGE_KEY);
          localStorage.removeItem(AUTH_ROLE_STORAGE_KEY);
          localStorage.removeItem(ACTOR_KEY_STORAGE_KEY);
          localStorage.removeItem(DISPLAY_NAME_STORAGE_KEY);
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
        | { username?: string; method?: AuthMethod; displayName?: string | null; error?: string }
        | null;
      if (!response.ok || !payload || typeof payload.username !== 'string') {
        throw new Error(payload?.error || 'Invalid username or password');
      }
      localStorage.setItem(ACTOR_KEY_STORAGE_KEY, payload.username);
      if (payload.displayName) {
        localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, payload.displayName);
      } else {
        localStorage.removeItem(DISPLAY_NAME_STORAGE_KEY);
      }
      localStorage.setItem(AUTH_METHOD_STORAGE_KEY, payload.method ?? 'local');
      window.location.href = withBasePath('/');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted text-sm text-fg-muted">
        Loading authentication...
      </div>
    );
  }

  if (config?.databaseUnavailable) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted p-4">
        <Card className="w-full max-w-xl border-danger p-6">
          <h2 className="mb-2 text-lg font-semibold text-fg">Database unavailable</h2>
          <p className="text-sm text-fg-muted">
            {authWarning ||
              'The database is unavailable, so no sign-in method can be used right now. Start the database (e.g. the database container) and reload this page.'}
          </p>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted p-4">
        <div className="w-full max-w-md rounded border border-danger bg-danger-soft p-4 text-sm text-danger-fg">
          {error}
        </div>
      </div>
    );
  }

  if (!authAvailable) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted p-4">
        <Card className="w-full max-w-xl border-danger p-6">
          <h2 className="mb-2 text-lg font-semibold text-fg">Authentication setup required</h2>
          <p className="text-sm text-fg-muted">
            Configure Microsoft Entra sign-in or create DB-managed local accounts before using Team Lunch.
          </p>
          {authWarning && (
            <div className="mt-4 rounded border border-warning bg-warning-soft p-3 text-sm text-warning-fg">
              {authWarning}
            </div>
          )}
        </Card>
      </div>
    );
  }

  if (config?.authenticated && config.blocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted p-4">
        <Card className="w-full max-w-xl border-danger p-6">
          <h2 className="mb-2 text-lg font-semibold text-fg">Access blocked</h2>
          <p className="mb-4 text-sm text-fg-muted">
            Your account has been blocked by an administrator. Contact the app administrator if this is unexpected.
          </p>
          <div className="rounded border border-danger bg-danger-soft p-4 text-sm text-danger-fg">
            Signed in as {config.user?.username ?? 'unknown user'}.
          </div>
        </Card>
      </div>
    );
  }

  if (config?.authenticated && config.approvalRequired && !config.approved && !config.isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted p-4">
        <Card className="w-full max-w-xl p-6">
          <h2 className="mb-2 text-lg font-semibold text-fg">Welcome</h2>
          <p className="mb-4 text-sm text-fg-muted">
            Your account is awaiting admin approval. Please contact your lunch app administrator.
          </p>
          <Panel>
            <h3 className="mb-3 text-sm font-semibold text-fg">Access status</h3>
            <p className="text-sm text-fg-muted">Pending approval by administrator.</p>
            {config.officeLocation ? (
              <p className="mt-2 text-xs text-fg-muted">
                Assigned office: {config.officeLocation.name}
              </p>
            ) : null}
          </Panel>
        </Card>
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
    <div className="flex min-h-screen items-center justify-center bg-surface-muted p-4">
      <Card className="w-full max-w-md p-6">
        <h2 className="mb-4 text-lg font-semibold text-fg">Sign in</h2>
        {authWarning && (
          <div className="mb-4 rounded border border-warning bg-warning-soft p-3 text-sm text-warning-fg">
            {authWarning}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded border border-danger bg-danger-soft p-3 text-sm text-danger-fg">
            {error}
          </div>
        )}

        <div className={showDualAuth ? 'grid gap-4 md:grid-cols-2' : 'space-y-3'}>
          {showMicrosoftLogin && (
            <div className="space-y-2 rounded border border-border p-3">
              <p className="text-sm font-medium text-fg">Microsoft SSO</p>
              <Button
                onClick={() => {
                  if (!microsoftConfigured) return;
                  localStorage.setItem(AUTH_METHOD_STORAGE_KEY, 'entra');
                  window.location.href = withBasePath('/api/auth/entra/login');
                }}
                disabled={!microsoftConfigured}
                title={!microsoftConfigured ? 'Microsoft Entra sign-in is not configured' : undefined}
                className="w-full"
              >
                Continue with Microsoft
              </Button>
              {!microsoftConfigured && (
                <p className="text-xs text-fg-muted">
                  Microsoft Entra sign-in is not configured for this deployment.
                </p>
              )}
            </div>
          )}

          {showLocalLogin && (
            <form
              onSubmit={(event) => void handleLocalLogin(event)}
              className="space-y-3 rounded border border-border p-3"
            >
              <p className="text-sm font-medium text-fg">Local account</p>
              <Input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Username"
              />
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
              />
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? 'Signing in...' : 'Sign in'}
              </Button>
            </form>
          )}
        </div>

        {!showMicrosoftLogin && !showLocalLogin && (
          <p className="text-sm text-fg-muted">No authentication methods are currently available.</p>
        )}
      </Card>
    </div>
  );
}
