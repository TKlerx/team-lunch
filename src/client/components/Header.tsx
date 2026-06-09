import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAdminOfficeContext } from '../context/AdminOfficeContext.js';
import pizzaLogo from '../../../assets/pizza-logo.png';
import exampleCompanyLogoSmall from '../../../assets/example-company-logo-small.png';

interface HeaderProps {
  nickname: string | null;
  notificationsEnabled: boolean;
  onToggleNotifications: () => void;
  onLogout?: () => void;
  isAdmin?: boolean;
  pendingApprovalCount?: number;
}

const iconBaseProps = {
  'aria-hidden': true,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function MenuIcon() {
  return (
    <svg {...iconBaseProps} className="h-4 w-4">
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg {...iconBaseProps} className="h-4 w-4">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg {...iconBaseProps} className="h-5 w-5">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function BellOffIcon() {
  return (
    <svg {...iconBaseProps} className="h-5 w-5">
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
      <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
      <path d="M18 8a6 6 0 0 0-9.33-5" />
      <path d="M1 1l22 22" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg {...iconBaseProps} className="h-4 w-4">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg {...iconBaseProps} className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg {...iconBaseProps} className="h-4 w-4">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg {...iconBaseProps} className="h-4 w-4">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg {...iconBaseProps} className="h-4 w-4">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export default function Header({
  nickname,
  notificationsEnabled,
  onToggleNotifications,
  onLogout,
  isAdmin = false,
  pendingApprovalCount = 0,
}: HeaderProps) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const {
    canSwitchOfficeLocation,
    officeLocations,
    selectedOfficeLocationId,
    setSelectedOfficeLocationId,
  } = useAdminOfficeContext();

  const showAdminItem = isAdmin;
  const hasPendingApprovals = showAdminItem && pendingApprovalCount > 0;
  const badgeLabel = pendingApprovalCount > 9 ? '9+' : String(pendingApprovalCount);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  return (
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

      {/* Right: nav + account */}
      <div className="flex items-center gap-4">
        <Link
          to="/menus"
          className={`flex items-center gap-1.5 text-sm font-medium ${
            location.pathname === '/menus'
              ? 'text-blue-600'
              : 'text-gray-600 hover:text-blue-600'
          }`}
        >
          <MenuIcon />
          Manage Menus
        </Link>

        <Link
          to="/shopping"
          className={`flex items-center gap-1.5 text-sm font-medium ${
            location.pathname === '/shopping'
              ? 'text-blue-600'
              : 'text-gray-600 hover:text-blue-600'
          }`}
        >
          <CartIcon />
          Shopping List
        </Link>

        {canSwitchOfficeLocation && officeLocations.length > 1 && (
          <select
            aria-label="Office location"
            value={selectedOfficeLocationId ?? ''}
            onChange={(event) => setSelectedOfficeLocationId(event.target.value)}
            className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 focus:border-blue-500 focus:outline-none"
          >
            {officeLocations.map((office) => (
              <option key={office.id} value={office.id}>
                {office.name}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={onToggleNotifications}
          className="rounded p-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          title={notificationsEnabled ? 'Notifications: On' : 'Notifications: Off'}
          aria-label={notificationsEnabled ? 'Notifications: On' : 'Notifications: Off'}
          aria-pressed={notificationsEnabled}
        >
          {notificationsEnabled ? <BellIcon /> : <BellOffIcon />}
        </button>

        {nickname && (
          <div className="relative" ref={accountRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700 hover:bg-blue-200"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <span className="relative inline-flex">
                <UserIcon />
                {hasPendingApprovals && (
                  <span className="absolute -right-1.5 -top-1.5 inline-flex h-3 w-3 rounded-full bg-red-500" />
                )}
              </span>
              <span>{nickname}</span>
              <ChevronDownIcon open={menuOpen} />
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
              >
                <Link
                  to="/settings"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  <SettingsIcon />
                  Settings
                </Link>

                {showAdminItem && (
                  <Link
                    to="/admin"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <ShieldIcon />
                    <span className="flex-1">Administration</span>
                    {hasPendingApprovals && (
                      <span
                        className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-xs font-semibold text-white"
                        aria-label={`${pendingApprovalCount} pending approvals`}
                      >
                        {badgeLabel}
                      </span>
                    )}
                  </Link>
                )}

                {onLogout && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onLogout();
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <LogoutIcon />
                    Logout
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
