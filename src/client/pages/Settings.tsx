import { useState, type FormEvent } from 'react';
import { useAdminOfficeContext } from '../context/AdminOfficeContext.js';
import { Card } from '../components/ui/Card.js';
import { Section } from '../components/ui/Section.js';
import { Input } from '../components/ui/Input.js';
import { Select } from '../components/ui/Select.js';
import { Button } from '../components/ui/Button.js';

interface SettingsProps {
  nickname: string | null;
  onRename: (newName: string) => void;
  allowRename?: boolean;
}

const NICKNAME_MIN_LENGTH = 1;
const NICKNAME_MAX_LENGTH = 30;

export default function Settings({ nickname, onRename, allowRename = true }: SettingsProps) {
  const {
    canSwitchOfficeLocation,
    officeLocations,
    selectedOfficeLocationId,
    setSelectedOfficeLocationId,
  } = useAdminOfficeContext();

  const [nicknameDraft, setNicknameDraft] = useState(nickname ?? '');
  const [nicknameTouched, setNicknameTouched] = useState(false);
  const [savedNickname, setSavedNickname] = useState<string | null>(null);

  const trimmedNickname = nicknameDraft.trim();
  const nicknameError =
    trimmedNickname.length < NICKNAME_MIN_LENGTH
      ? 'Nickname is required.'
      : trimmedNickname.length > NICKNAME_MAX_LENGTH
        ? `Nickname must be at most ${NICKNAME_MAX_LENGTH} characters.`
        : '';
  const nicknameUnchanged = trimmedNickname === (nickname ?? '');

  const handleNicknameSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (nicknameError || nicknameUnchanged) {
      return;
    }
    onRename(trimmedNickname);
    setSavedNickname(trimmedNickname);
  };

  const selectedOfficeName =
    officeLocations.find((location) => location.id === selectedOfficeLocationId)?.name ?? null;

  return (
    <div className="mx-auto w-full max-w-3xl p-4 lg:px-6">
      <Card className="p-6">
        <h1 className="text-2xl font-semibold text-fg">Settings</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Manage your personal preferences for Team Lunch.
        </p>

        {allowRename && (
          <Section
            title="Nickname"
            description="This is the name shown next to your votes and orders."
            className="mt-6"
          >
            <form className="flex flex-col gap-3 sm:flex-row sm:items-start" onSubmit={handleNicknameSubmit}>
              <div className="flex-1">
                <Input
                  aria-label="Nickname"
                  value={nicknameDraft}
                  onChange={(event) => {
                    setNicknameDraft(event.target.value);
                    setNicknameTouched(true);
                    setSavedNickname(null);
                  }}
                  maxLength={NICKNAME_MAX_LENGTH}
                />
                {nicknameError && nicknameTouched && (
                  <p className="mt-1 text-xs text-danger-fg">{nicknameError}</p>
                )}
                {savedNickname !== null && trimmedNickname === savedNickname && (
                  <p className="mt-1 text-xs text-success-fg">Nickname saved.</p>
                )}
              </div>
              <Button type="submit" disabled={!!nicknameError || nicknameUnchanged}>
                Save
              </Button>
            </form>
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
              value={selectedOfficeLocationId ?? ''}
              onChange={(event) => setSelectedOfficeLocationId(event.target.value)}
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
      </Card>
    </div>
  );
}
