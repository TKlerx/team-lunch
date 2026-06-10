import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, useTheme } from '../../src/client/context/ThemeContext.js';

// Controllable matchMedia('(prefers-color-scheme: dark)') mock.
const media = {
  matches: false,
  listeners: new Set<(e: MediaQueryListEvent) => void>(),
  addEventListener(_: string, cb: (e: MediaQueryListEvent) => void) {
    this.listeners.add(cb);
  },
  removeEventListener(_: string, cb: (e: MediaQueryListEvent) => void) {
    this.listeners.delete(cb);
  },
  set(matches: boolean) {
    this.matches = matches;
    for (const cb of this.listeners) cb({ matches } as MediaQueryListEvent);
  },
};

function Probe() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button onClick={() => setTheme('light')}>light</button>
      <button onClick={() => setTheme('dark')}>dark</button>
      <button onClick={() => setTheme('system')}>system</button>
    </div>
  );
}

const isDark = () => document.documentElement.classList.contains('dark');

describe('ThemeProvider', () => {
  beforeEach(() => {
    media.matches = false;
    media.listeners.clear();
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    vi.stubGlobal('matchMedia', () => media as unknown as MediaQueryList);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to system and resolves to the OS preference', () => {
    media.matches = true; // OS prefers dark
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme')).toHaveTextContent('system');
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');
    expect(isDark()).toBe(true);
  });

  it('applies an explicit choice and persists it', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'dark' }));
    expect(isDark()).toBe(true);
    expect(localStorage.getItem('team_lunch_theme')).toBe('dark');

    await user.click(screen.getByRole('button', { name: 'light' }));
    expect(isDark()).toBe(false);
    expect(localStorage.getItem('team_lunch_theme')).toBe('light');
  });

  it('follows live OS changes while on system', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'system' }));
    expect(isDark()).toBe(false);

    act(() => media.set(true)); // OS switches to dark
    expect(isDark()).toBe(true);
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');

    act(() => media.set(false)); // OS switches back to light
    expect(isDark()).toBe(false);
  });

  it('restores a persisted choice on mount', () => {
    localStorage.setItem('team_lunch_theme', 'dark');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(isDark()).toBe(true);
  });
});
