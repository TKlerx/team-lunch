import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import NicknameModal from './NicknameModal.js';
import pizzaLogo from '../../../assets/pizza-logo.png';
import exampleCompanyLogoSmall from '../../../assets/example-company-logo-small.png';

interface HeaderProps {
  nickname: string | null;
  onRename: (newName: string) => void;
  allowRename?: boolean;
  notificationsEnabled: boolean;
  onToggleNotifications: () => void;
  onLogout?: () => void;
  officeLocations?: Array<{ id: string; key: string; name: string; isActive: boolean }>;
  selectedOfficeLocationId?: string | null;
  onSelectOfficeLocation?: (officeLocationId: string) => void;
}

export default function Header({
  nickname,
  onRename,
  allowRename = true,
  notificationsEnabled,
  onToggleNotifications,
  onLogout,
  officeLocations = [],
  selectedOfficeLocationId = null,
  onSelectOfficeLocation,
}: HeaderProps) {
  const [renameOpen, setRenameOpen] = useState(false);
  const location = useLocation();

  return (
    <>
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        {/* Left: App title */}
        <Link
          to="/"
          className="flex items-center gap-2 text-xl font-bold text-gray-900 hover:text-blue-600"
        >
          <img src={pizzaLogo} alt="Pizza logo" className="h-8 w-8" />
          <img
            src={exampleCompanyLogoSmall}
            alt="Example company logo"
            className="relative top-[3px] block h-7 w-auto self-center"
          />
          <span>Team Lunch</span>
        </Link>

        {/* Right: nav + nickname */}
        <div className="flex items-center gap-4">
          {officeLocations.length > 0 && selectedOfficeLocationId && onSelectOfficeLocation && (
              <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
                <span>Office</span>
                <select
                  aria-label="Office context"
                  value={selectedOfficeLocationId}
                  onChange={(event) => onSelectOfficeLocation(event.target.value)}
                  className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700"
                >
                  {officeLocations.map((officeLocation) => (
                    <option key={officeLocation.id} value={officeLocation.id}>
                      {officeLocation.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

          <button
            type="button"
            onClick={onToggleNotifications}
            className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
            title="Toggle phase notifications"
          >
            Notifications: {notificationsEnabled ? 'On' : 'Off'}
          </button>

          <Link
            to="/menus"
            className={`text-sm font-medium ${
              location.pathname === '/menus'
                ? 'text-blue-600'
                : 'text-gray-600 hover:text-blue-600'
            }`}
          >
            Manage Menus
          </Link>

          <Link
            to="/shopping"
            className={`text-sm font-medium ${
              location.pathname === '/shopping'
                ? 'text-blue-600'
                : 'text-gray-600 hover:text-blue-600'
            }`}
          >
            Shopping List
          </Link>

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
            >
              Logout
            </button>
          )}

          {nickname && allowRename && (
            <button
              type="button"
              onClick={() => setRenameOpen(true)}
              className="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700 hover:bg-blue-200"
              title="Click to rename"
            >
              {nickname}
            </button>
          )}
          {nickname && !allowRename && (
            <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700">
              {nickname}
            </span>
          )}
        </div>
      </header>

      <NicknameModal
        open={renameOpen && allowRename}
        initialValue={nickname ?? ''}
        title="Rename"
        onSubmit={(name) => {
          onRename(name);
          setRenameOpen(false);
        }}
        onCancel={() => setRenameOpen(false)}
      />
    </>
  );
}
