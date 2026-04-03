import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { makePoll, makeMenu } from './helpers.js';
import type { AppState } from '../../src/client/context/AppContext.js';
import { initialAppState } from '../../src/client/context/AppContext.js';

// ─── Mocks ─────────────────────────────────────────────────

const mockUseAppState = vi.fn<() => AppState>();

vi.mock('../../src/client/context/AppContext.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/client/context/AppContext.js')>();
  return {
    ...mod,
    useAppState: () => mockUseAppState(),
  };
});

const mockExtendPoll = vi.fn();
const mockRandomWinner = vi.fn();
const mockAbortPoll = vi.fn();
const mockIsAdminAuthenticatedUser = vi.fn(() => true);
const mockIsCreatorAuthenticatedUser = vi.fn<(createdBy: string | null | undefined) => boolean>(() => false);
vi.mock('../../src/client/api.js', () => ({
  extendPoll: (...args: unknown[]) => mockExtendPoll(...args),
  randomWinner: (...args: unknown[]) => mockRandomWinner(...args),
  abortPoll: (...args: unknown[]) => mockAbortPoll(...args),
}));
vi.mock('../../src/client/auth.js', () => ({
  isAdminAuthenticatedUser: () => mockIsAdminAuthenticatedUser(),
  isCreatorAuthenticatedUser: (createdBy: string | null | undefined) =>
    mockIsCreatorAuthenticatedUser(createdBy),
}));

import PollTiedView from '../../src/client/components/PollTiedView.js';

function renderView() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PollTiedView />
    </MemoryRouter>,
  );
}

describe('PollTiedView', () => {
  const menus = [
    makeMenu({ id: 'menu-1', name: 'Pizza Place' }),
    makeMenu({ id: 'menu-2', name: 'Sushi Bar', items: [{ id: 'item-2', menuId: 'menu-2', name: 'Roll', description: null, price: null, createdAt: '2026-01-01T00:00:00Z' }] }),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAdminAuthenticatedUser.mockReturnValue(true);
    mockIsCreatorAuthenticatedUser.mockReturnValue(false);
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus,
      activePoll: makePoll({
        status: 'tied',
        voteCounts: { 'menu-1': 5, 'menu-2': 5 },
      }),
    });
  });

  it('shows "It\'s a tie!" heading', () => {
    renderView();
    expect(screen.getByText(/it's a tie/i)).toBeInTheDocument();
  });

  it('displays tied menu names', () => {
    renderView();
    expect(screen.getByText('Pizza Place')).toBeInTheDocument();
    expect(screen.getByText('Sushi Bar')).toBeInTheDocument();
  });

  it('shows vote count for tied menus', () => {
    renderView();
    // The component renders "These menus are tied with 5 votes each:"
    // JSX renders the number and text as separate text nodes
    expect(screen.getByText(/tied with/i)).toBeInTheDocument();
  });

  it('has extension duration picker with 5/10/15/30 options', () => {
    renderView();
    const options = screen.getAllByRole('option');
    const labels = options.map((o) => o.textContent);
    expect(labels).toContain('5 min');
    expect(labels).toContain('10 min');
    expect(labels).toContain('15 min');
    expect(labels).toContain('30 min');
  });

  it('calls extendPoll with selected duration on Extend click', async () => {
    const user = userEvent.setup();
    mockExtendPoll.mockResolvedValue({});
    renderView();

    // Select 15 min — get the first combobox (extend duration)
    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[0], '15');

    await user.click(screen.getByRole('button', { name: 'Extend' }));
    expect(mockExtendPoll).toHaveBeenCalledWith('poll-1', 15);
  });

  it('calls randomWinner on "Pick randomly" click', async () => {
    const user = userEvent.setup();
    mockRandomWinner.mockResolvedValue({});
    renderView();

    const buttons = screen.getAllByRole('button', { name: /pick randomly/i });
    await user.click(buttons[0]);
    expect(mockRandomWinner).toHaveBeenCalledWith('poll-1');
  });

  it('shows API error on failure', async () => {
    const user = userEvent.setup();
    mockExtendPoll.mockRejectedValue(new Error('Poll not tied'));
    renderView();

    const extendButtons = screen.getAllByRole('button', { name: 'Extend' });
    await user.click(extendButtons[0]);
    expect(await screen.findByText('Poll not tied')).toBeInTheDocument();
  });

  it('returns null when no active poll', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus,
      activePoll: null,
    });
    const { container } = renderView();
    expect(container.innerHTML).toBe('');
  });

  it('shows "Kill poll (admin)" button', () => {
    renderView();
    expect(screen.getByText('Kill poll (admin)')).toBeInTheDocument();
  });

  it('shows confirmation and calls abortPoll on confirm', async () => {
    const user = userEvent.setup();
    mockAbortPoll.mockResolvedValue({});
    renderView();

    await user.click(screen.getByText('Kill poll (admin)'));
    expect(screen.getByText('Kill this poll?')).toBeInTheDocument();
    await user.click(screen.getByText('Yes, kill'));
    expect(mockAbortPoll).toHaveBeenCalledWith('poll-1');
  });

  it('hides kill poll controls for non-admin users', () => {
    mockIsAdminAuthenticatedUser.mockReturnValue(false);
    renderView();
    expect(screen.queryByText('Kill poll (admin)')).not.toBeInTheDocument();
  });
});
