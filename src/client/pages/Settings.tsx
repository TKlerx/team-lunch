import { useEffect, useState, type FormEvent } from 'react';
import { useAdminOfficeContext } from '../context/AdminOfficeContext.js';
import { withBasePath } from '../config.js';
import { Section } from '../components/ui/Section.js';
import { Input } from '../components/ui/Input.js';
import { Select } from '../components/ui/Select.js';
import { Button } from '../components/ui/Button.js';
import * as api from '../api.js';
import type { AppVersionResponse, UserPreferences } from '../../lib/types.js';
import {
  ACTOR_KEY_STORAGE_KEY,
  AUTH_METHOD_STORAGE_KEY,
  AUTH_PROFILE_UPDATED_EVENT,
  DISPLAY_NAME_STORAGE_KEY,
  setAuthenticatedDisplayName,
} from '../auth.js';

const DISPLAY_NAME_MAX_GRAPHEMES = 64;
const EMPTY_PREFERENCES: UserPreferences = {
  userKey: '',
  allergies: [],
  dislikes: [],
  updatedAt: new Date(0).toISOString(),
};

function parsePreferenceTerms(value: string): string[] {
  return value
    .split(/[,\n;]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function countGraphemes(value: string): number {
  const segmenter = 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  return segmenter ? [...segmenter.segment(value)].length : [...value].length;
}

function getDisplayNameError(value: string): string {
  if (countGraphemes(value.trim()) > DISPLAY_NAME_MAX_GRAPHEMES) {
    return `Display name must be at most ${DISPLAY_NAME_MAX_GRAPHEMES} characters.`;
  }
  if (/[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069\u200B-\u200F\uFEFF<>&"]/.test(value)) {
    return 'Display name contains unsupported characters.';
  }
  return '';
}

export default function Settings() {
  const {
    canSwitchOfficeLocation,
    officeLocations,
    selectedOfficeLocationId,
    setSelectedOfficeLocationId,
  } = useAdminOfficeContext();

  const [officeLocationDraft, setOfficeLocationDraft] = useState(selectedOfficeLocationId ?? '');
  const [preferences, setPreferences] = useState<UserPreferences>(EMPTY_PREFERENCES);
  const [allergiesDraft, setAllergiesDraft] = useState('');
  const [dislikesDraft, setDislikesDraft] = useState('');
  const [preferencesLoading, setPreferencesLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsSavedMessage, setSettingsSavedMessage] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [authMethod, setAuthMethod] = useState('');
  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [displayNameTouched, setDisplayNameTouched] = useState(false);
  const [appVersion, setAppVersion] = useState<AppVersionResponse | null>(null);

  const officeUnchanged = officeLocationDraft === (selectedOfficeLocationId ?? '');
  const allergyTerms = parsePreferenceTerms(allergiesDraft);
  const dislikeTerms = parsePreferenceTerms(dislikesDraft);
  const preferencesUnchanged =
    allergyTerms.join('\u0000') === preferences.allergies.join('\u0000') &&
    dislikeTerms.join('\u0000') === preferences.dislikes.join('\u0000');
  const storedDisplayName = localStorage.getItem(DISPLAY_NAME_STORAGE_KEY) ?? '';
  const displayNameError = getDisplayNameError(displayNameDraft);
  const displayNameUnchanged = displayNameDraft.trim() === storedDisplayName;
  const canEditDisplayName = authMethod === 'local';
  const settingsUnchanged =
    (!canEditDisplayName || displayNameUnchanged) &&
    officeUnchanged &&
    preferencesUnchanged;

  const resetDrafts = () => {
    setOfficeLocationDraft(selectedOfficeLocationId ?? '');
    setAllergiesDraft(preferences.allergies.join(', '));
    setDislikesDraft(preferences.dislikes.join(', '));
    setDisplayNameDraft(storedDisplayName);
    setDisplayNameTouched(false);
    setSettingsError('');
    setSettingsSavedMessage('');
  };

  const selectedOfficeName =
    officeLocations.find((location) => location.id === selectedOfficeLocationId)?.name ?? null;

  useEffect(() => {
    setAccountEmail(localStorage.getItem(ACTOR_KEY_STORAGE_KEY) ?? '');
    setAuthMethod(localStorage.getItem(AUTH_METHOD_STORAGE_KEY) ?? '');
    setDisplayNameDraft(localStorage.getItem(DISPLAY_NAME_STORAGE_KEY) ?? '');
    setDisplayNameTouched(false);
  }, []);

  useEffect(() => {
    const handleAuthProfileUpdated = () => {
      const nextDisplayName = localStorage.getItem(DISPLAY_NAME_STORAGE_KEY) ?? '';
      if (!displayNameTouched) {
        setDisplayNameDraft(nextDisplayName);
      }
    };
    window.addEventListener(AUTH_PROFILE_UPDATED_EVENT, handleAuthProfileUpdated);
    return () => {
      window.removeEventListener(AUTH_PROFILE_UPDATED_EVENT, handleAuthProfileUpdated);
    };
  }, [displayNameTouched]);

  useEffect(() => {
    setOfficeLocationDraft(selectedOfficeLocationId ?? '');
  }, [selectedOfficeLocationId]);

  useEffect(() => {
    let cancelled = false;
    const loadAppVersion = async () => {
      try {
        const loaded = await api.fetchAppVersion();
        if (!cancelled) {
          setAppVersion(loaded);
        }
      } catch {
        if (!cancelled) {
          setAppVersion(null);
        }
      }
    };
    void loadAppVersion();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!accountEmail) {
      setPreferences(EMPTY_PREFERENCES);
      setAllergiesDraft('');
      setDislikesDraft('');
      return;
    }

    let cancelled = false;
    const loadPreferences = async () => {
      setPreferencesLoading(true);
      setSettingsError('');
      setSettingsSavedMessage('');
      try {
        const loaded = await api.getUserPreferences(accountEmail);
        if (cancelled) return;
        setPreferences(loaded);
        setAllergiesDraft(loaded.allergies.join(', '));
        setDislikesDraft(loaded.dislikes.join(', '));
      } catch (err) {
        if (cancelled) return;
        setSettingsError((err as Error).message);
      } finally {
        if (!cancelled) {
          setPreferencesLoading(false);
        }
      }
    };
    void loadPreferences();
    return () => {
      cancelled = true;
    };
  }, [accountEmail]);

  const handleSettingsSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if ((canEditDisplayName && displayNameError) || settingsUnchanged) {
      return;
    }

    setSettingsSaving(true);
    setSettingsError('');
    setSettingsSavedMessage('');
    try {
      if (canSwitchOfficeLocation && !officeUnchanged && officeLocationDraft) {
        setSelectedOfficeLocationId(officeLocationDraft);
      }

      if (canEditDisplayName && !displayNameUnchanged) {
        const response = await fetch(withBasePath('/api/auth/me/display-name'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ displayName: displayNameDraft.trim() || null }),
        });
        const payload = (await response.json().catch(() => null)) as {
          displayName?: string | null;
          displayNameSnapshot?: string;
          error?: string;
        } | null;
        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to update display name');
        }
        const nextDisplay = payload?.displayName ?? '';
        setAuthenticatedDisplayName(nextDisplay);
        setDisplayNameDraft(nextDisplay);
      }

      if (accountEmail && !preferencesUnchanged) {
        const saved = await api.updateUserPreferences(
          accountEmail,
          allergyTerms,
          dislikeTerms,
        );
        setPreferences(saved);
        setAllergiesDraft(saved.allergies.join(', '));
        setDislikesDraft(saved.dislikes.join(', '));
      }

      setSettingsSavedMessage('Settings saved.');
    } catch (err) {
      setSettingsError((err as Error).message);
    } finally {
      setSettingsSaving(false);
    }
  };

  const foodAlertsDescription =
    preferences.allergies.length > 0 || preferences.dislikes.length > 0
      ? 'These terms are checked against menu item names and descriptions during food selection.'
      : 'Add ingredients you need to avoid or usually prefer not to eat.';
  const versionLabel = appVersion
    ? [
        appVersion.version,
        appVersion.gitSha,
        appVersion.dirty ? 'dirty' : null,
        appVersion.buildTime,
      ].filter(Boolean).join(' | ')
    : 'Unavailable';

  return (
    <div className="w-full p-6">
      <form className="max-w-4xl" onSubmit={handleSettingsSubmit}>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-fg">Settings</h1>
          <p className="mt-2 text-sm text-fg-muted">
            Manage your personal preferences for Team Lunch.
          </p>
        </div>

        <Section
          title="Account"
          description="Your account identity and the name shown in lunch votes and orders."
          className="mt-6"
        >
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-fg-muted">Account</p>
              <p className="text-sm font-medium text-fg">{accountEmail || 'Unknown account'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-fg-muted">Authentication</p>
              <p className="text-sm text-fg">
                {authMethod === 'entra'
                  ? 'Microsoft Entra'
                  : authMethod === 'local'
                    ? 'Local account'
                    : 'Unknown'}
              </p>
            </div>
            <label className="block text-xs font-medium text-fg">
              Display name
              <Input
                aria-label="Display name"
                value={displayNameDraft}
                disabled={!canEditDisplayName}
                onChange={(event) => {
                  setDisplayNameDraft(event.target.value);
                  setDisplayNameTouched(true);
                  setSettingsSavedMessage('');
                }}
                maxLength={128}
                className="mt-1"
              />
            </label>
            {displayNameError && displayNameTouched ? (
              <p className="text-xs text-danger-fg">{displayNameError}</p>
            ) : null}
            <p className="text-xs text-fg-muted">
              {canEditDisplayName
                ? 'This name appears in lunch votes and orders.'
                : 'This name is managed by Microsoft Entra.'}
            </p>
            {!displayNameDraft.trim() ? (
              <p className="text-xs text-fg-muted">Your account email is displayed until a name is set.</p>
            ) : null}
          </div>
        </Section>

        <Section
          title="Office"
          description="The office location used for polls, menus, and orders."
          className="mt-6"
        >
          {canSwitchOfficeLocation && officeLocations.length > 0 ? (
            <Select
              aria-label="Office location"
              value={officeLocationDraft}
              onChange={(event) => {
                setOfficeLocationDraft(event.target.value);
                setSettingsSavedMessage('');
              }}
              className="w-full sm:w-64"
            >
              {officeLocations.map((officeLocation) => (
                <option key={officeLocation.id} value={officeLocation.id}>
                  {officeLocation.name}
                </option>
              ))}
            </Select>
          ) : (
            <p className="text-sm font-medium text-fg">
              {selectedOfficeName ?? 'No office assigned.'}
            </p>
          )}
        </Section>

        <Section
          title="Ingredient Preferences"
          description={foodAlertsDescription}
          className="mt-6"
        >
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs font-medium text-fg">
                Ingredients to avoid
                <textarea
                  value={allergiesDraft}
                  onChange={(event) => {
                    setAllergiesDraft(event.target.value);
                    setSettingsSavedMessage('');
                  }}
                  rows={4}
                  className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
                  placeholder="e.g. peanuts, shrimp, milk"
                  aria-label="Ingredients to avoid"
                  disabled={!accountEmail || preferencesLoading || settingsSaving}
                />
              </label>
              <label className="text-xs font-medium text-fg">
                Less preferred ingredients
                <textarea
                  value={dislikesDraft}
                  onChange={(event) => {
                    setDislikesDraft(event.target.value);
                    setSettingsSavedMessage('');
                  }}
                  rows={4}
                  className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
                  placeholder="e.g. mushrooms, onions"
                  aria-label="Less preferred ingredients"
                  disabled={!accountEmail || preferencesLoading || settingsSaving}
                />
              </label>
            </div>
            <p className="text-xs text-fg-muted">
              Separate terms with commas, semicolons, or new lines.
            </p>
          </div>
        </Section>

        <Section
          title="Version"
          description="Build metadata for support and fault tracking."
          className="mt-6"
        >
          <dl className="grid gap-2 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
            <dt className="font-medium text-fg-muted">App</dt>
            <dd className="break-all font-mono text-xs text-fg" data-testid="app-version">
              {versionLabel}
            </dd>
            {appVersion?.gitBranch ? (
              <>
                <dt className="font-medium text-fg-muted">Branch</dt>
                <dd className="break-all font-mono text-xs text-fg">{appVersion.gitBranch}</dd>
              </>
            ) : null}
            <dt className="font-medium text-fg-muted">Runtime</dt>
            <dd className="break-all font-mono text-xs text-fg">
              {appVersion ? `${appVersion.environment} | ${appVersion.nodeVersion}` : 'Unavailable'}
            </dd>
          </dl>
        </Section>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <Button
            type="submit"
            disabled={
              settingsSaving ||
              preferencesLoading ||
              settingsUnchanged ||
              (canEditDisplayName && !!displayNameError)
            }
          >
            {settingsSaving ? 'Saving...' : 'Save settings'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={resetDrafts}
            disabled={settingsSaving || settingsUnchanged}
          >
            Cancel
          </Button>
          {settingsSavedMessage ? (
            <span className="text-xs text-success-fg">{settingsSavedMessage}</span>
          ) : null}
          {settingsError ? (
            <span className="text-xs text-danger-fg">{settingsError}</span>
          ) : null}
        </div>
      </form>
    </div>
  );
}
