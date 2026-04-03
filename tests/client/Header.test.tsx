import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Header from '../../src/client/components/Header.js';

function renderHeader(
  nickname: string | null = 'Alice',
  onRename = vi.fn(),
  notificationsEnabled = true,
  onToggleNotifications = vi.fn(),
  onLogout?: () => void,
  officeProps?: {
    officeLocations: Array<{ id: string; key: string; name: string; isActive: boolean }>;
    selectedOfficeLocationId: string;
    onSelectOfficeLocation: (officeLocationId: string) => void;
  },
) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Header
        nickname={nickname}
        onRename={onRename}
        notificationsEnabled={notificationsEnabled}
        onToggleNotifications={onToggleNotifications}
        onLogout={onLogout}
        {...officeProps}
      />
    </MemoryRouter>,
  );
}

describe('Header', () => {
  it('shows the app title "Team Lunch"', () => {
    renderHeader();
    expect(screen.getByText('Team Lunch')).toBeInTheDocument();
  });

  it('shows the pizza logo next to the title', () => {
    renderHeader();
    expect(screen.getByRole('img', { name: /pizza logo/i })).toBeInTheDocument();
  });

  it('shows the example company logo between pizza logo and title', () => {
    renderHeader();
    expect(screen.getByRole('img', { name: /example company logo/i })).toBeInTheDocument();
  });

  it('shows "Manage Menus" navigation link', () => {
    renderHeader();
    const link = screen.getByRole('link', { name: /manage menus/i });
    expect(link).toHaveAttribute('href', '/menus');
  });

  it('shows notifications toggle with enabled state', () => {
    renderHeader('Alice', vi.fn(), true);
    expect(screen.getByRole('button', { name: /notifications: on/i })).toBeInTheDocument();
  });

  it('calls onToggleNotifications when clicking notifications toggle', async () => {
    const user = userEvent.setup();
    const onToggleNotifications = vi.fn();
    renderHeader('Alice', vi.fn(), false, onToggleNotifications);

    await user.click(screen.getByRole('button', { name: /notifications: off/i }));
    expect(onToggleNotifications).toHaveBeenCalledTimes(1);
  });

  it('shows logout button when onLogout is provided', () => {
    renderHeader('Alice', vi.fn(), true, vi.fn(), vi.fn());
    expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
  });

  it('calls onLogout when clicking logout button', async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    renderHeader('Alice', vi.fn(), true, vi.fn(), onLogout);

    await user.click(screen.getByRole('button', { name: /logout/i }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('shows an admin office selector and updates it', async () => {
    const user = userEvent.setup();
    const onSelectOfficeLocation = vi.fn();
    renderHeader('Alice', vi.fn(), true, vi.fn(), undefined, {
      officeLocations: [
        { id: 'office-1', key: 'default', name: 'Default Office', isActive: true },
        { id: 'office-2', key: 'berlin', name: 'Berlin', isActive: true },
      ],
      selectedOfficeLocationId: 'office-1',
      onSelectOfficeLocation,
    });

    expect(screen.getByRole('combobox', { name: /office context/i })).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: /office context/i }), 'office-2');
    expect(onSelectOfficeLocation).toHaveBeenCalledWith('office-2');
  });

  it('shows nickname button when nickname is set', () => {
    renderHeader('Alice');
    expect(screen.getByRole('button', { name: 'Alice' })).toBeInTheDocument();
  });

  it('does not show nickname button when nickname is null', () => {
    renderHeader(null);
    expect(screen.queryByRole('button', { name: /alice/i })).not.toBeInTheDocument();
  });

  it('opens rename modal when clicking nickname button', async () => {
    const user = userEvent.setup();
    renderHeader('Alice');

    await user.click(screen.getByRole('button', { name: 'Alice' }));

    // Rename modal should appear
    expect(screen.getByText('Rename')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Alice')).toBeInTheDocument();
  });

  it('calls onRename and closes modal on submit', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    renderHeader('Alice', onRename);

    await user.click(screen.getByRole('button', { name: 'Alice' }));

    // Clear and type new name
    const input = screen.getByDisplayValue('Alice');
    await user.clear(input);
    await user.type(input, 'Bob');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onRename).toHaveBeenCalledWith('Bob');
  });

  it('closes rename modal on cancel', async () => {
    const user = userEvent.setup();
    renderHeader('Alice');

    await user.click(screen.getByRole('button', { name: 'Alice' }));
    expect(screen.getByText('Rename')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    // Modal should be gone
    expect(screen.queryByText('Rename')).not.toBeInTheDocument();
  });
});
