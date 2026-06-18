import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Header from '../../src/client/components/Header.js';
import type { AuthMethod } from '../../src/lib/types.js';

function renderHeader(
  nickname: string | null = 'Alice',
  notificationsEnabled = true,
  onToggleNotifications = vi.fn(),
  onLogout?: () => void,
  isAdmin = false,
  pendingApprovalCount = 0,
  authMethod: AuthMethod | null = 'local',
) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Header
        nickname={nickname}
        authMethod={authMethod}
        notificationsEnabled={notificationsEnabled}
        onToggleNotifications={onToggleNotifications}
        onLogout={onLogout}
        isAdmin={isAdmin}
        pendingApprovalCount={pendingApprovalCount}
      />
    </MemoryRouter>,
  );
}

describe('Header', () => {
  it('shows the app title "Team Lunch"', () => {
    renderHeader();
    expect(screen.getByText('Team Lunch')).toBeInTheDocument();
  });

  it('stacks the shell on small screens', () => {
    renderHeader();
    const shell = screen.getByRole('banner').firstElementChild as HTMLElement | null;
    expect(shell).not.toBeNull();
    expect(shell).toHaveClass('flex-col');
    expect(shell).toHaveClass('lg:flex-row');
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

  it('shows "Shopping List" navigation link', () => {
    renderHeader();
    const link = screen.getByRole('link', { name: /shopping list/i });
    expect(link).toHaveAttribute('href', '/shopping-list');
  });

  it('shows notifications toggle with enabled state', () => {
    renderHeader('Alice', true);
    expect(screen.getByRole('button', { name: /notifications: on/i })).toBeInTheDocument();
  });

  it('calls onToggleNotifications when clicking notifications toggle', async () => {
    const user = userEvent.setup();
    const onToggleNotifications = vi.fn();
    renderHeader('Alice', false, onToggleNotifications);

    await user.click(screen.getByRole('button', { name: /notifications: off/i }));
    expect(onToggleNotifications).toHaveBeenCalledTimes(1);
  });

  it('shows nickname button when nickname is set', () => {
    renderHeader('Alice');
    expect(screen.getByRole('button', { name: /alice/i })).toBeInTheDocument();
  });

  it('renders generic initials for local/manual account avatars', () => {
    const { container } = renderHeader('Guest User', true, vi.fn(), undefined, false, 0, 'local');

    expect(container.querySelector('img[src$="/api/auth/me/avatar"]')).not.toBeInTheDocument();
    expect(screen.getByText('GU')).toBeInTheDocument();
  });

  it('loads the backend avatar endpoint for Entra account avatars', () => {
    const { container } = renderHeader('Alice Example', true, vi.fn(), undefined, false, 0, 'entra');

    const avatar = container.querySelector('img[src$="/api/auth/me/avatar"]');
    expect(avatar).toBeInTheDocument();
  });

  it('does not show nickname button when nickname is null', () => {
    renderHeader(null);
    expect(screen.queryByRole('button', { name: /alice/i })).not.toBeInTheDocument();
  });

  it('opens account dropdown when clicking nickname button', async () => {
    const user = userEvent.setup();
    renderHeader('Alice');

    await user.click(screen.getByRole('button', { name: /alice/i }));
    expect(screen.getByRole('menuitem', { name: /settings/i })).toBeInTheDocument();
  });

  it('Settings menu item links to /settings', async () => {
    const user = userEvent.setup();
    renderHeader('Alice');

    await user.click(screen.getByRole('button', { name: /alice/i }));
    expect(screen.getByRole('menuitem', { name: /settings/i })).toHaveAttribute('href', '/settings');
  });

  it('shows logout button in dropdown when onLogout is provided', async () => {
    const user = userEvent.setup();
    renderHeader('Alice', true, vi.fn(), vi.fn());

    await user.click(screen.getByRole('button', { name: /alice/i }));
    expect(screen.getByRole('menuitem', { name: /logout/i })).toBeInTheDocument();
  });

  it('calls onLogout when clicking logout in dropdown', async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    renderHeader('Alice', true, vi.fn(), onLogout);

    await user.click(screen.getByRole('button', { name: /alice/i }));
    await user.click(screen.getByRole('menuitem', { name: /logout/i }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('does not show logout button in dropdown when onLogout is not provided', async () => {
    const user = userEvent.setup();
    renderHeader('Alice');

    await user.click(screen.getByRole('button', { name: /alice/i }));
    expect(screen.queryByRole('menuitem', { name: /logout/i })).not.toBeInTheDocument();
  });

  it('shows Administration link in dropdown when isAdmin is true', async () => {
    const user = userEvent.setup();
    renderHeader('Alice', true, vi.fn(), undefined, true);

    await user.click(screen.getByRole('button', { name: /alice/i }));
    expect(screen.getByRole('menuitem', { name: /administration/i })).toBeInTheDocument();
  });

  it('Administration link in dropdown points to /admin', async () => {
    const user = userEvent.setup();
    renderHeader('Alice', true, vi.fn(), undefined, true);

    await user.click(screen.getByRole('button', { name: /alice/i }));
    expect(screen.getByRole('menuitem', { name: /administration/i })).toHaveAttribute('href', '/admin');
  });

  it('shows pending approval count badge in Administration menu item', async () => {
    const user = userEvent.setup();
    renderHeader('Alice', true, vi.fn(), undefined, true, 3);

    await user.click(screen.getByRole('button', { name: /alice/i }));
    expect(screen.getByLabelText(/3 pending approvals/i)).toBeInTheDocument();
  });

  it('closes dropdown when Escape is pressed', async () => {
    const user = userEvent.setup();
    renderHeader('Alice');

    await user.click(screen.getByRole('button', { name: /alice/i }));
    expect(screen.getByRole('menuitem', { name: /settings/i })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menuitem', { name: /settings/i })).not.toBeInTheDocument();
  });
});
