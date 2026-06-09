import { useState, type FormEvent } from 'react';
import { useAdminOfficeContext } from '../context/AdminOfficeContext.js';

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
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <p className="mt-2 text-sm text-gray-600">
          Manage your personal preferences for Team Lunch.
        </p>

        {allowRename && (
          <section className="mt-6 border-t border-gray-100 pt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Nickname</h2>
            <p className="mt-1 text-sm text-gray-500">
              This is the name shown next to your votes and orders.
            </p>
            <form className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start" onSubmit={handleNicknameSubmit}>
              <div className="flex-1">
                <input
                  type="text"
                  aria-label="Nickname"
                  value={nicknameDraft}
                  onChange={(event) => {
                    setNicknameDraft(event.target.value);
                    setNicknameTouched(true);
                    setSavedNickname(null);
                  }}
                  maxLength={NICKNAME_MAX_LENGTH}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                />
                {nicknameError && nicknameTouched && (
                  <p className="mt-1 text-xs text-red-600">{nicknameError}</p>
                )}
                {savedNickname !== null && trimmedNickname === savedNickname && (
                  <p className="mt-1 text-xs text-emerald-600">Nickname saved.</p>
                )}
              </div>
              <button
                type="submit"
                disabled={!!nicknameError || nicknameUnchanged}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save
              </button>
            </form>
          </section>
        )}

        <section className="mt-6 border-t border-gray-100 pt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Office</h2>
          <p className="mt-1 text-sm text-gray-500">
            The office location used for polls, menus, and orders.
          </p>
          {canSwitchOfficeLocation && officeLocations.length > 0 ? (
            <select
              aria-label="Office location"
              value={selectedOfficeLocationId ?? ''}
              onChange={(event) => setSelectedOfficeLocationId(event.target.value)}
              className="mt-3 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none sm:w-64"
            >
              {officeLocations.map((officeLocation) => (
                <option key={officeLocation.id} value={officeLocation.id}>
                  {officeLocation.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="mt-3 text-sm font-medium text-gray-900">
              {selectedOfficeName ?? 'No office assigned.'}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
