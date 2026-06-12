import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAdminOfficeContext } from '../context/AdminOfficeContext.js';
import ThemeToggle from './ThemeToggle.js';
import { IconButton } from './ui/IconButton.js';
import { MenuItem, MenuList } from './ui/Menu.js';
import pizzaLogo from '../../../assets/pizza-logo.png';
import exampleCompanyLogoSmall from '../../../assets/example-company-logo-small.png';
import { withBasePath } from '../config.js';
import type { AuthMethod } from '../../lib/types.js';

interface HeaderProps {
  nickname: string | null;
  authMethod?: AuthMethod | null;
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

function AccountAvatar({ label, authMethod }: { label: string; authMethod?: AuthMethod | null }) {
  const [imageUnavailable, setImageUnavailable] = useState(false);
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || label.slice(0, 1).toUpperCase();

  if (authMethod !== 'entra' || imageUnavailable) {
    return (
      <span
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[0.65rem] font-semibold text-white"
        aria-hidden="true"
      >
        {initials}
      </span>
    );
  }

  return (
    <img
      src={withBasePath('/api/auth/me/avatar')}
      alt=""
      className="h-6 w-6 shrink-0 rounded-full bg-accent-soft object-cover"
      onError={() => setImageUnavailable(true)}
      aria-hidden="true"
    />
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
  authMethod = null,
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
    <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 shadow-sm">
      {/* Left: App title */}
      <Link
        to="/"
        className="flex items-center gap-2 text-xl font-bold text-fg hover:text-accent"
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
              ? 'text-accent'
              : 'text-fg-muted hover:text-accent'
          }`}
        >
          <MenuIcon />
          Manage Menus
        </Link>

        <Link
          to="/shopping"
          className={`flex items-center gap-1.5 text-sm font-medium ${
            location.pathname === '/shopping'
              ? 'text-accent'
              : 'text-fg-muted hover:text-accent'
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
            className="rounded border border-border bg-surface-muted px-2 py-1 text-xs font-medium text-fg hover:bg-surface focus:border-accent focus:outline-none"
          >
            {officeLocations.map((office) => (
              <option key={office.id} value={office.id}>
                {office.name}
              </option>
            ))}
          </select>
        )}

        <ThemeToggle />

        <IconButton
          onClick={onToggleNotifications}
          title={notificationsEnabled ? 'Notifications: On' : 'Notifications: Off'}
          aria-label={notificationsEnabled ? 'Notifications: On' : 'Notifications: Off'}
          aria-pressed={notificationsEnabled}
        >
          {notificationsEnabled ? <BellIcon /> : <BellOffIcon />}
        </IconButton>

        {nickname && (
          <div className="relative" ref={accountRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex items-center gap-2 rounded-full bg-accent-soft/70 px-3 py-1 text-sm font-medium text-accent-fg hover:bg-accent-soft"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <span className="relative inline-flex">
                <AccountAvatar label={nickname} authMethod={authMethod} />
                {hasPendingApprovals && (
                  <span className="absolute -right-1.5 -top-1.5 inline-flex h-3 w-3 rounded-full bg-red-500" />
                )}
              </span>
              <span>{nickname}</span>
              <ChevronDownIcon open={menuOpen} />
            </button>

            {menuOpen && (
              <MenuList className="w-52">
                <MenuItem
                  as={Link}
                  to="/settings"
                  onClick={() => setMenuOpen(false)}
                >
                  <SettingsIcon />
                  Settings
                </MenuItem>

                {showAdminItem && (
                  <MenuItem
                    as={Link}
                    to="/admin"
                    onClick={() => setMenuOpen(false)}
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
                  </MenuItem>
                )}

                {onLogout && (
                  <MenuItem
                    onClick={() => {
                      setMenuOpen(false);
                      onLogout();
                    }}
                  >
                    <LogoutIcon />
                    Logout
                  </MenuItem>
                )}
              </MenuList>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
