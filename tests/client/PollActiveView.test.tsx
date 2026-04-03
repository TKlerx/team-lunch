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

vi.mock('../../src/client/hooks/useNickname.js', () => ({
  useNickname: () => ({
    nickname: 'Alice',
    updateNickname: vi.fn(),
    clearNickname: vi.fn(),
  }),
}));

const mockIsAdminAuthenticatedUser = vi.fn(() => true);
const mockIsCreatorAuthenticatedUser = vi.fn<(createdBy: string | null | undefined) => boolean>(() => false);
vi.mock('../../src/client/auth.js', () => ({
  isAdminAuthenticatedUser: () => mockIsAdminAuthenticatedUser(),
  isCreatorAuthenticatedUser: (createdBy: string | null | undefined) =>
    mockIsCreatorAuthenticatedUser(createdBy),
}));

const mockUseCountdown = vi.fn<() => number>();
vi.mock('../../src/client/hooks/useCountdown.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/client/hooks/useCountdown.js')>();
  return {
    ...mod,
    useCountdown: () => mockUseCountdown(),
  };
});

const mockCastVote = vi.fn();
const mockWithdrawVote = vi.fn();
const mockEndPoll = vi.fn();
const mockAbortPoll = vi.fn();
const mockUpdatePollTimer = vi.fn();
vi.mock('../../src/client/api.js', () => ({
  castVote: (...args: unknown[]) => mockCastVote(...args),
  withdrawVote: (...args: unknown[]) => mockWithdrawVote(...args),
  endPoll: (...args: unknown[]) => mockEndPoll(...args),
  abortPoll: (...args: unknown[]) => mockAbortPoll(...args),
  updatePollTimer: (...args: unknown[]) => mockUpdatePollTimer(...args),
}));

import PollActiveView from '../../src/client/components/PollActiveView.js';

function renderView() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PollActiveView />
    </MemoryRouter>,
  );
}

describe('PollActiveView', () => {
  const menus = [
    makeMenu({ id: 'menu-1', name: 'Pizza Place' }),
    makeMenu({ id: 'menu-2', name: 'Sushi Bar', items: [{ id: 'item-2', menuId: 'menu-2', name: 'California Roll', description: null, price: null, createdAt: '2026-01-01T00:00:00Z' }] }),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAdminAuthenticatedUser.mockReturnValue(true);
    mockIsCreatorAuthenticatedUser.mockReturnValue(false);
    mockUseCountdown.mockReturnValue(1800); // 30 min
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus,
      activePoll: makePoll({
        voteCounts: { 'menu-1': 3, 'menu-2': 1 },
        votes: [
          { id: 'v1', pollId: 'poll-1', menuId: 'menu-1', menuName: 'Pizza Place', nickname: 'Alice', castAt: '2026-01-01T12:05:00Z' },
        ],
      }),
    });
  });

  it('shows the poll description', () => {
    renderView();
    expect(screen.getByText(/cuisine poll:\s*where to eat\?/i)).toBeInTheDocument();
  });

  it('displays formatted countdown time', () => {
    renderView();
    // useCountdown returns 1800 → formatTime(1800) = "30:00"
    expect(screen.getAllByText('30:00').length).toBeGreaterThanOrEqual(1);
  });

  it('renders vote histogram with menu names and counts', () => {
    renderView();
    // Menu names appear both in histogram and voting panel
    expect(screen.getAllByText('Pizza Place').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Sushi Bar').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders voting panel with menu buttons', () => {
    renderView();
    // The voting panel should show buttons for each menu
    // Alice has voted for menu-1, so it should show a check
    const pizzaBtn = screen.getAllByRole('button').find((btn) =>
      btn.textContent?.includes('Pizza Place'),
    );
    const sushiBtn = screen.getAllByRole('button').find((btn) =>
      btn.textContent?.includes('Sushi Bar'),
    );
    expect(pizzaBtn).toBeDefined();
    expect(sushiBtn).toBeDefined();
    // Pizza Place should show as voted (✓ prefix)
    expect(pizzaBtn?.textContent).toContain('✓');
  });

  it('calls castVote when clicking an unvoted menu', async () => {
    const user = userEvent.setup();
    mockCastVote.mockResolvedValue({});
    renderView();

    const sushiBtn = screen.getAllByRole('button').find((btn) =>
      btn.textContent?.includes('Sushi Bar') && !btn.textContent?.includes('✓'),
    );
    expect(sushiBtn).toBeDefined();
    await user.click(sushiBtn!);

    expect(mockCastVote).toHaveBeenCalledWith('poll-1', 'menu-2', 'Alice');
  });

  it('calls withdrawVote when clicking a voted menu', async () => {
    const user = userEvent.setup();
    mockWithdrawVote.mockResolvedValue({});
    renderView();

    const pizzaBtn = screen.getAllByRole('button').find((btn) =>
      btn.textContent?.includes('✓') && btn.textContent?.includes('Pizza Place'),
    );
    expect(pizzaBtn).toBeDefined();
    await user.click(pizzaBtn!);

    expect(mockWithdrawVote).toHaveBeenCalledWith('poll-1', 'menu-1', 'Alice');
  });

  it('shows "sit this one out" button to collapse voting panel', async () => {
    const user = userEvent.setup();
    renderView();

    const sitOut = screen.getByText(/sit this one out/i);
    expect(sitOut).toBeInTheDocument();

    await user.click(sitOut);
    expect(screen.getByText('Show voting panel')).toBeInTheDocument();
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

  it('calls abortPoll API from timer menu kill poll action', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockAbortPoll.mockResolvedValue({});
    renderView();

    await user.click(screen.getByRole('button', { name: /poll timer actions/i }));
    await user.click(screen.getByRole('button', { name: /kill poll \(admin\)/i }));

    expect(mockAbortPoll).toHaveBeenCalledWith('poll-1');
    confirmSpy.mockRestore();
  });

  it('hides kill poll action for non-admin users', async () => {
    const user = userEvent.setup();
    mockIsAdminAuthenticatedUser.mockReturnValue(false);
    renderView();

    await user.click(screen.getByRole('button', { name: /poll timer actions/i }));
    expect(screen.queryByRole('button', { name: /kill poll \(admin\)/i })).not.toBeInTheDocument();
  });

  it('ends poll from timer menu confirm completion action', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockEndPoll.mockResolvedValue({});
    renderView();

    await user.click(screen.getByRole('button', { name: /poll timer actions/i }));
    await user.click(screen.getByRole('button', { name: /confirm completion/i }));

    expect(mockEndPoll).toHaveBeenCalledWith('poll-1');
    confirmSpy.mockRestore();
  });

  it('updates poll timer from preset entry in timer menu', async () => {
    const user = userEvent.setup();
    mockUpdatePollTimer.mockResolvedValue({});
    renderView();

    await user.click(screen.getByRole('button', { name: /poll timer actions/i }));
    await user.click(screen.getByRole('button', { name: /^15 min$/i }));

    expect(mockUpdatePollTimer).toHaveBeenCalledWith('poll-1', 15);
  });

  it('updates poll timer from manual minutes input', async () => {
    const user = userEvent.setup();
    mockUpdatePollTimer.mockResolvedValue({});
    renderView();

    await user.click(screen.getByRole('button', { name: /poll timer actions/i }));
    await user.type(screen.getByLabelText(/poll manual minutes remaining/i), '37{enter}');

    expect(mockUpdatePollTimer).toHaveBeenCalledWith('poll-1', 37);
  });

  it('closes timer menu when clicking outside', async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole('button', { name: /poll timer actions/i }));
    expect(screen.getByRole('button', { name: /confirm completion/i })).toBeInTheDocument();

    await user.click(screen.getByText('Your votes'));

    expect(screen.queryByRole('button', { name: /confirm completion/i })).not.toBeInTheDocument();
  });

  it('shows a completion call to action when the poll timer has expired', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockEndPoll.mockResolvedValue({});
    mockUseCountdown.mockReturnValue(0);

    renderView();

    expect(screen.getByText(/voting time is up/i)).toBeInTheDocument();
    expect(screen.getByText(/finalize the result so everyone can move on to meal selection/i)).toBeInTheDocument();

    const ctaButton = screen.getAllByRole('button', { name: /confirm completion/i })[0];
    await user.click(ctaButton);

    expect(mockEndPoll).toHaveBeenCalledWith('poll-1');
    expect(screen.getByText(/voting is closed\. review the result and complete the poll\./i)).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it('shows a waiting message instead of the CTA for non-admins after expiry', () => {
    mockUseCountdown.mockReturnValue(0);
    mockIsAdminAuthenticatedUser.mockReturnValue(false);

    renderView();

    expect(screen.getByText(/waiting for an organizer to confirm the result/i)).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /confirm completion/i })).toHaveLength(0);
  });
});
