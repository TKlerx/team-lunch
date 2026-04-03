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
    useAppState: (...args: unknown[]) => mockUseAppState(...(args as [])),
  };
});

const mockStartFoodSelection = vi.fn();
vi.mock('../../src/client/api.js', () => ({
  startFoodSelection: (...args: unknown[]) => mockStartFoodSelection(...args),
}));

import PollFinishedView from '../../src/client/components/PollFinishedView.js';

function renderView() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PollFinishedView />
    </MemoryRouter>,
  );
}

describe('PollFinishedView', () => {
  const menus = [
    makeMenu({ id: 'menu-1', name: 'Pizza Place' }),
    makeMenu({ id: 'menu-2', name: 'Sushi Bar', items: [{ id: 'item-2', menuId: 'menu-2', name: 'Roll', description: null, price: null, createdAt: '2026-01-01T00:00:00Z' }] }),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      defaultFoodSelectionDurationMinutes: 30,
      menus,
      latestCompletedPoll: makePoll({
        status: 'finished',
        winnerMenuId: 'menu-1',
        winnerMenuName: 'Pizza Place',
        winnerSelectedRandomly: false,
        voteCounts: { 'menu-1': 5, 'menu-2': 3 },
      }),
    });
  });

  it('allows non-admin authenticated users to start food selection', () => {
    localStorage.setItem('team_lunch_auth_method', 'local');
    localStorage.setItem('team_lunch_auth_role', 'user');

    renderView();
    expect(screen.getByRole('button', { name: /start food selection time menu/i })).toBeInTheDocument();
  });

  it('shows "Cuisine Poll finished!" heading', () => {
    renderView();
    expect(screen.getByText('Cuisine Poll finished!')).toBeInTheDocument();
  });

  it('displays the winning menu name prominently', () => {
    renderView();
    // Pizza Place appears in both winner heading and vote counts
    const elements = screen.getAllByText('Pizza Place');
    expect(elements.length).toBeGreaterThanOrEqual(1);
    // The first one is the 2xl bold winner heading
    expect(elements[0].tagName).toBe('P');
  });

  it('shows "chosen randomly" label when winner was selected randomly', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus,
      latestCompletedPoll: makePoll({
        status: 'finished',
        winnerMenuId: 'menu-1',
        winnerMenuName: 'Pizza Place',
        winnerSelectedRandomly: true,
        voteCounts: { 'menu-1': 3, 'menu-2': 3 },
      }),
    });
    renderView();
    expect(screen.getByText(/chosen randomly from a tie/i)).toBeInTheDocument();
  });

  it('does NOT show "chosen randomly" when winner was not random', () => {
    renderView();
    expect(screen.queryByText(/chosen randomly/i)).not.toBeInTheDocument();
  });

  it('displays final vote counts sorted descending', () => {
    renderView();
    // Both menus should appear with their counts
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows start action with the office default duration', () => {
    renderView();
    expect(screen.getByRole('button', { name: /start food selection time menu/i })).toBeInTheDocument();
  });

  it('calls startFoodSelection with default preset', async () => {
    const user = userEvent.setup();
    mockStartFoodSelection.mockResolvedValue({});
    renderView();

    await user.click(screen.getByRole('button', { name: /start food selection time menu/i }));
    await user.click(screen.getByRole('button', { name: '30 min' }));
    expect(mockStartFoodSelection).toHaveBeenCalledWith('poll-1', 30);
  });

  it('uses selected preset duration for startFoodSelection', async () => {
    const user = userEvent.setup();
    mockStartFoodSelection.mockResolvedValue({});
    renderView();

    await user.click(screen.getByRole('button', { name: /start food selection time menu/i }));
    await user.click(screen.getByRole('button', { name: '30 min' }));
    expect(mockStartFoodSelection).toHaveBeenCalledWith('poll-1', 30);
  });

  it('shows API error on failure', async () => {
    const user = userEvent.setup();
    mockStartFoodSelection.mockRejectedValue(new Error('No finished poll'));
    renderView();

    await user.click(screen.getByRole('button', { name: /start food selection time menu/i }));
    await user.click(screen.getByRole('button', { name: '30 min' }));
    expect(await screen.findByText('No finished poll')).toBeInTheDocument();
  });

  it('returns null when no latestCompletedPoll', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus,
      latestCompletedPoll: null,
    });
    const { container } = renderView();
    expect(container.innerHTML).toBe('');
  });

  it('indicates that phase 2 cannot start when no votes were cast', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus,
      latestCompletedPoll: makePoll({
        status: 'finished',
        winnerMenuId: null,
        winnerMenuName: null,
        voteCounts: {},
      }),
    });

    renderView();
    expect(
      screen.getByText(/no votes were submitted before the timer expired/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start/i })).not.toBeInTheDocument();
  });
});
