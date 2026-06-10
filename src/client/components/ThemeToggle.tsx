import { useEffect, useRef, useState } from 'react';
import { useTheme, type Theme } from '../context/ThemeContext.js';
import { IconButton } from './ui/IconButton.js';
import { MenuItem, MenuList } from './ui/Menu.js';
import { cn } from '../lib/cn.js';

const iconBaseProps = {
  'aria-hidden': true,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function SunIcon({ className }: { className?: string }) {
  return (
    <svg {...iconBaseProps} className={cn('h-4 w-4', className)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg {...iconBaseProps} className={cn('h-4 w-4', className)}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function MonitorIcon({ className }: { className?: string }) {
  return (
    <svg {...iconBaseProps} className={cn('h-4 w-4', className)}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg {...iconBaseProps} className="h-4 w-4">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

const OPTIONS: { value: Theme; label: string; Icon: typeof SunIcon }[] = [
  { value: 'light', label: 'Light', Icon: SunIcon },
  { value: 'dark', label: 'Dark', Icon: MoonIcon },
  { value: 'system', label: 'System', Icon: MonitorIcon },
];

const TRIGGER_ICON: Record<Theme, typeof SunIcon> = {
  light: SunIcon,
  dark: MoonIcon,
  system: MonitorIcon,
};

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const TriggerIcon = TRIGGER_ICON[theme];
  const currentLabel = OPTIONS.find((option) => option.value === theme)?.label ?? 'Theme';

  return (
    <div className="relative" ref={containerRef}>
      <IconButton
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Theme: ${currentLabel}`}
        aria-label={`Theme: ${currentLabel}`}
      >
        <TriggerIcon />
      </IconButton>

      {open && (
        <MenuList className="w-40">
          {OPTIONS.map(({ value, label, Icon }) => {
            const active = theme === value;
            return (
              <MenuItem
                key={value}
                onClick={() => {
                  setTheme(value);
                  setOpen(false);
                }}
                aria-checked={active}
                className={cn(active && 'text-accent-fg')}
              >
                <Icon />
                <span className="flex-1">{label}</span>
                {active && <CheckIcon />}
              </MenuItem>
            );
          })}
        </MenuList>
      )}
    </div>
  );
}
