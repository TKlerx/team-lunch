import { useEffect, useState, type FormEvent } from 'react';
import { useAdminOfficeContext } from '../context/AdminOfficeContext.js';
import { Section } from '../components/ui/Section.js';
import { Input } from '../components/ui/Input.js';
import { Select } from '../components/ui/Select.js';
import { Button } from '../components/ui/Button.js';
import * as api from '../api.js';
import type { UserPreferences } from '../../lib/types.js';

interface SettingsProps {
  nickname: string | null;
  onRename: (newName: string) => void;
  allowRename?: boolean;
}

const NICKNAME_MIN_LENGTH = 1;
const NICKNAME_MAX_LENGTH = 30;
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

export default function Settings({ nickname, onRename, allowRename = true }: SettingsProps) {
  const {
    canSwitchOfficeLocation,
    officeLocations,
    selectedOfficeLocationId,
    setSelectedOfficeLocationId,
  } = useAdminOfficeContext();

  const [nicknameDraft, setNicknameDraft] = useState(nickname ?? '');
  const [nicknameTouched, setNicknameTouched] = useState(false);
  const [officeLocationDraft, setOfficeLocationDraft] = useState(selectedOfficeLocationId ?? '');
  const [preferences, setPreferences] = useState<UserPreferences>(EMPTY_PREFERENCES);
  const [allergiesDraft, setAllergiesDraft] = useState('');
  const [dislikesDraft, setDislikesDraft] = useState('');
  const [preferencesLoading, setPreferencesLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsSavedMessage, setSettingsSavedMessage] = useState('');

  const trimmedNickname = nicknameDraft.trim();
  const nicknameError =
    trimmedNickname.length < NICKNAME_MIN_LENGTH
      ? 'Nickname is required.'
      : trimmedNickname.length > NICKNAME_MAX_LENGTH
        ? `Nickname must be at most ${NICKNAME_MAX_LENGTH} characters.`
        : '';
  const nicknameUnchanged = trimmedNickname === (nickname ?? '');
  const officeUnchanged = officeLocationDraft === (selectedOfficeLocationId ?? '');
  const allergyTerms = parsePreferenceTerms(allergiesDraft);
  const dislikeTerms = parsePreferenceTerms(dislikesDraft);
  const preferencesUnchanged =
    allergyTerms.join('\u0000') === preferences.allergies.join('\u0000') &&
    dislikeTerms.join('\u0000') === preferences.dislikes.join('\u0000');
  const settingsUnchanged =
    (nicknameUnchanged || !allowRename) && officeUnchanged && preferencesUnchanged;

  const resetDrafts = () => {
    setNicknameDraft(nickname ?? '');
    setNicknameTouched(false);
    setOfficeLocationDraft(selectedOfficeLocationId ?? '');
    setAllergiesDraft(preferences.allergies.join(', '));
    setDislikesDraft(preferences.dislikes.join(', '));
    setSettingsError('');
    setSettingsSavedMessage('');
  };

  const selectedOfficeName =
    officeLocations.find((location) => location.id === selectedOfficeLocationId)?.name ?? null;

  useEffect(() => {
    setNicknameDraft(nickname ?? '');
    setNicknameTouched(false);
  }, [nickname]);

  useEffect(() => {
    setOfficeLocationDraft(selectedOfficeLocationId ?? '');
  }, [selectedOfficeLocationId]);

  useEffect(() => {
    if (!nickname) {
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
        const loaded = await api.getUserPreferences(nickname);
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
  }, [nickname]);

  const handleSettingsSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if ((allowRename && nicknameError) || settingsUnchanged) {
      return;
    }

    setSettingsSaving(true);
    setSettingsError('');
    setSettingsSavedMessage('');
    try {
      const effectiveNickname = allowRename ? trimmedNickname : nickname;
      if (allowRename && !nicknameUnchanged) {
        onRename(trimmedNickname);
      }

      if (canSwitchOfficeLocation && !officeUnchanged && officeLocationDraft) {
        setSelectedOfficeLocationId(officeLocationDraft);
      }

      if (effectiveNickname && !preferencesUnchanged) {
        const saved = await api.updateUserPreferences(
          effectiveNickname,
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

  return (
    <div className="w-full p-6">
      <form className="max-w-4xl" onSubmit={handleSettingsSubmit}>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-fg">Settings</h1>
          <p className="mt-2 text-sm text-fg-muted">
            Manage your personal preferences for Team Lunch.
          </p>
        </div>

        {allowRename && (
          <Section
            title="Nickname"
            description="This is the name shown next to your votes and orders."
            className="mt-6"
          >
            <Input
              aria-label="Nickname"
              value={nicknameDraft}
              onChange={(event) => {
                setNicknameDraft(event.target.value);
                setNicknameTouched(true);
                setSettingsSavedMessage('');
              }}
              maxLength={NICKNAME_MAX_LENGTH}
            />
            {nicknameError && nicknameTouched && (
              <p className="mt-1 text-xs text-danger-fg">{nicknameError}</p>
            )}
          </Section>
        )}

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
                  disabled={!nickname || preferencesLoading || settingsSaving}
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
                  disabled={!nickname || preferencesLoading || settingsSaving}
                />
              </label>
            </div>
            <p className="text-xs text-fg-muted">
              Separate terms with commas, semicolons, or new lines.
            </p>
          </div>
        </Section>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <Button
            type="submit"
            disabled={
              settingsSaving ||
              preferencesLoading ||
              settingsUnchanged ||
              (allowRename && !!nicknameError)
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
