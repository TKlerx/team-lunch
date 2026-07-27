import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../../src/client/App.js';
import { makeFoodSelection, makeMenu, makePoll } from './helpers.js';
import type { Poll } from '../../src/lib/types.js';

const mockDispatch = vi.fn();
const mockUseAppState = vi.fn();
const mockUseAppPhase = vi.fn();
const mockFetchPoll = vi.hoisted(() => vi.fn());

vi.mock('../../src/client/api.js', () => ({
  fetchPoll: mockFetchPoll,
}));

vi.mock('../../src/client/hooks/useSSE.js', () => ({
  useSSE: vi.fn(),
}));

vi.mock('../../src/client/hooks/useAppPhase.js', () => ({
  useAppPhase: () => mockUseAppPhase(),
}));

vi.mock('../../src/client/context/AppContext.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/client/context/AppContext.js')>();
  return {
    ...mod,
    useAppState: () => mockUseAppState(),
    useAppDispatch: () => mockDispatch,
  };
});

vi.mock('../../src/client/components/Header.js', () => ({
  default: ({ nickname }: { nickname: string | null }) => <div data-testid="header">{nickname}</div>,
}));

vi.mock('../../src/client/pages/MainView.js', () => ({
  default: () => <div data-testid="main-view" />,
}));

vi.mock('../../src/client/pages/ManageMenus.js', () => ({
  default: () => <div data-testid="manage-menus" />,
}));

vi.mock('../../src/client/pages/ShoppingList.js', () => ({
  default: () => <div data-testid="shopping-list" />,
}));

vi.mock('../../src/client/pages/Settings.js', () => ({
  default: () => <div data-testid="settings" />,
}));

vi.mock('../../src/client/pages/Administration.js', () => ({
  default: () => <div data-testid="administration" />,
}));

vi.mock('../../src/client/components/FoodSelectionCompletedView.js', () => ({
  default: ({ isHistorical }: { isHistorical?: boolean }) => (
    <div data-testid={isHistorical ? 'historical-completed-view' : 'completed-view'} />
  ),
}));

vi.mock('../../src/client/components/PollFinishedView.js', () => ({
  default: ({ poll, readOnly }: { poll?: Poll | null; readOnly?: boolean }) => (
    <div data-testid={readOnly ? 'historical-poll-view' : 'poll-finished-view'}>
      {poll?.id ?? 'latest'}
    </div>
  ),
}));

describe('App layout with Orders rail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockFetchPoll.mockRejectedValue(new Error('Poll not found'));
    mockUseAppPhase.mockReturnValue('POLL_IDLE');
    mockUseAppState.mockReturnValue({
      activePoll: null,
      activeFoodSelection: null,
      latestCompletedPoll: null,
      latestCompletedFoodSelection: null,
      menus: [makeMenu()],
      completedFoodSelectionsHistory: [
        makeFoodSelection({
          id: 'fs-1',
          status: 'completed',
          menuName: 'Pizza Place',
          completedAt: '2026-01-01T13:20:00Z',
        }),
      ],
      dbConnected: true,
      dbReconnectAttempts: 0,
    });
  });

  it('refreshes header label after current auth profile changes in the same tab', () => {
    localStorage.setItem('team_lunch_actor_key', 'admin@example.com');
    localStorage.setItem('team_lunch_display_name', 'Admin');

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('header')).toHaveTextContent('Admin');

    act(() => {
      localStorage.setItem('team_lunch_display_name', 'Admin Renamed');
      window.dispatchEvent(new Event('team_lunch_auth_profile_updated'));
    });

    expect(screen.getByTestId('header')).toHaveTextContent('Admin Renamed');
  });

  it('renders orders rail and main view by default', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByText('Past Lunches')).toBeInTheDocument();
    expect(screen.getByTestId('main-view')).toBeInTheDocument();
  });

  it('opens historical completed view when selecting history item', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /pizza place/i }));
    expect(screen.getByTestId('historical-completed-view')).toBeInTheDocument();
  });

  it('opens historical completed view from /menus when selecting history item', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter
        initialEntries={['/menus']}

      >
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('manage-menus')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /pizza place/i }));
    expect(screen.getByTestId('historical-completed-view')).toBeInTheDocument();
  });

  it('dispatches START_NEW_TEAM_LUNCH when clicking Start new Team Lunch', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /start new team lunch/i }));
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'START_NEW_TEAM_LUNCH' });
  });

  it('shows Cuisine poll in progress... while a poll is active', () => {
    mockUseAppState.mockReturnValue({
      activePoll: { id: 'poll-1', status: 'active' },
      activeFoodSelection: null,
      latestCompletedPoll: null,
      latestCompletedFoodSelection: null,
      menus: [makeMenu()],
      completedFoodSelectionsHistory: [],
      dbConnected: true,
      dbReconnectAttempts: 0,
    });

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    const inProgressButton = screen.getByRole('button', { name: /cuisine poll in progress\.\.\./i });
    expect(inProgressButton).toBeInTheDocument();
    expect(inProgressButton).toHaveTextContent('1/3');
  });

  it('shows Food selection in progress... while food selection is active', () => {
    mockUseAppState.mockReturnValue({
      activePoll: null,
      activeFoodSelection: makeFoodSelection({ status: 'active' }),
      latestCompletedPoll: null,
      latestCompletedFoodSelection: null,
      menus: [makeMenu()],
      completedFoodSelectionsHistory: [],
      dbConnected: true,
      dbReconnectAttempts: 0,
    });

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    const inProgressButton = screen.getByRole('button', { name: /food selection in progress\.\.\./i });
    expect(inProgressButton).toBeInTheDocument();
    expect(inProgressButton).toHaveTextContent('2/3');
  });

  it('shows Awaiting lunch delivery... while delivery is active', () => {
    mockUseAppState.mockReturnValue({
      activePoll: null,
      activeFoodSelection: makeFoodSelection({
        status: 'delivering',
        etaMinutes: 60,
        etaSetAt: new Date().toISOString(),
        deliveryDueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
      latestCompletedPoll: null,
      latestCompletedFoodSelection: null,
      menus: [makeMenu()],
      completedFoodSelectionsHistory: [],
      dbConnected: true,
      dbReconnectAttempts: 0,
    });

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    const inProgressButton = screen.getByRole('button', { name: /awaiting lunch delivery\.\.\./i });
    expect(inProgressButton).toBeInTheDocument();
    expect(inProgressButton).toHaveTextContent('3/3');
  });

  it('shows ringing due-state visuals in rail when phase 3 is due', () => {
    mockUseAppState.mockReturnValue({
      activePoll: null,
      activeFoodSelection: makeFoodSelection({
        status: 'delivery_due',
        etaMinutes: 60,
        etaSetAt: new Date(Date.now() - 61 * 60 * 1000).toISOString(),
        deliveryDueAt: new Date(Date.now() - 1_000).toISOString(),
      }),
      latestCompletedPoll: null,
      latestCompletedFoodSelection: null,
      menus: [makeMenu()],
      completedFoodSelectionsHistory: [],
      dbConnected: true,
      dbReconnectAttempts: 0,
    });

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: /awaiting lunch delivery\.\.\./i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /ringing clock/i })).toBeInTheDocument();
  });

  it('navigates from /menus to the ongoing phase when clicking Cuisine poll in progress...', async () => {
    const user = userEvent.setup();
    mockUseAppState.mockReturnValue({
      activePoll: { id: 'poll-1', status: 'active' },
      activeFoodSelection: null,
      latestCompletedPoll: null,
      latestCompletedFoodSelection: null,
      menus: [makeMenu()],
      completedFoodSelectionsHistory: [],
      dbConnected: true,
      dbReconnectAttempts: 0,
    });

    render(
      <MemoryRouter
        initialEntries={['/menus']}

      >
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('manage-menus')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /cuisine poll in progress\.\.\./i }));

    expect(screen.getByTestId('main-view')).toBeInTheDocument();
    expect(mockDispatch).not.toHaveBeenCalledWith({ type: 'START_NEW_TEAM_LUNCH' });
  });

  it('allows returning from historical order to ongoing phase', async () => {
    const user = userEvent.setup();
    mockUseAppState.mockReturnValue({
      activePoll: { id: 'poll-1', status: 'active' },
      activeFoodSelection: null,
      latestCompletedPoll: null,
      latestCompletedFoodSelection: null,
      menus: [makeMenu()],
      completedFoodSelectionsHistory: [
        makeFoodSelection({
          id: 'fs-1',
          status: 'completed',
          menuName: 'Pizza Place',
          completedAt: '2026-01-01T13:20:00Z',
        }),
      ],
      dbConnected: true,
      dbReconnectAttempts: 0,
    });

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /pizza place/i }));
    expect(screen.getByTestId('historical-completed-view')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /back to ongoing team lunch/i }));
    expect(screen.getByTestId('main-view')).toBeInTheDocument();
  });

  it('disables Start new Team Lunch when no menus with items exist', () => {
    mockUseAppState.mockReturnValue({
      activePoll: null,
      activeFoodSelection: null,
      latestCompletedPoll: null,
      latestCompletedFoodSelection: null,
      menus: [],
      completedFoodSelectionsHistory: [],
      dbConnected: true,
      dbReconnectAttempts: 0,
    });

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: /start new team lunch/i })).toBeDisabled();
  });

  it('shows database connection modal when DB is unavailable', () => {
    mockUseAppState.mockReturnValue({
      activePoll: null,
      activeFoodSelection: null,
      latestCompletedPoll: null,
      latestCompletedFoodSelection: null,
      menus: [makeMenu()],
      completedFoodSelectionsHistory: [],
      dbConnected: false,
      dbReconnectAttempts: 3,
    });

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('db-connection-modal')).toBeInTheDocument();
    expect(screen.getByText(/connection attempts: 3/i)).toBeInTheDocument();
  });

  it('shows Cuisine poll in progress... during POLL_FINISHED transition and does not start new lunch', async () => {
    const user = userEvent.setup();
    mockUseAppPhase.mockReturnValue('POLL_FINISHED');
    mockUseAppState.mockReturnValue({
      activePoll: null,
      activeFoodSelection: null,
      latestCompletedPoll: makePoll({ id: 'poll-1', status: 'finished' }),
      latestCompletedFoodSelection: null,
      menus: [makeMenu()],
      completedFoodSelectionsHistory: [],
      dbConnected: true,
      dbReconnectAttempts: 0,
    });

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    const inProgressButton = screen.getByRole('button', { name: /cuisine poll in progress\.\.\./i });
    expect(inProgressButton).toBeInTheDocument();
    expect(inProgressButton).toHaveTextContent('1/3');

    await user.click(inProgressButton);
    expect(mockDispatch).not.toHaveBeenCalledWith({ type: 'START_NEW_TEAM_LUNCH' });
  });

  it('renders the shopping list from its canonical URL', () => {
    render(
      <MemoryRouter
        initialEntries={['/shopping-list']}

      >
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('shopping-list')).toBeInTheDocument();
  });

  it('keeps old /shopping links working through the canonical shopping-list route', () => {
    render(
      <MemoryRouter
        initialEntries={['/shopping']}

      >
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('shopping-list')).toBeInTheDocument();
  });

  it('renders the live poll view for a matching poll URL', () => {
    mockUseAppState.mockReturnValue({
      activePoll: makePoll({ id: 'poll-42', status: 'active' }),
      activeFoodSelection: null,
      latestCompletedPoll: null,
      latestCompletedFoodSelection: null,
      menus: [makeMenu()],
      completedFoodSelectionsHistory: [],
      dbConnected: true,
      dbReconnectAttempts: 0,
      initialized: true,
    });

    render(
      <MemoryRouter
        initialEntries={['/polls/poll-42']}

      >
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('main-view')).toBeInTheDocument();
  });

  it('renders a historical poll URL loaded by API', async () => {
    mockFetchPoll.mockResolvedValue(
      makePoll({
        id: 'poll-history',
        status: 'finished',
        winnerMenuId: 'menu-1',
        winnerMenuName: 'Pizza Place',
        voteCounts: { 'menu-1': 2 },
      }),
    );
    mockUseAppState.mockReturnValue({
      activePoll: null,
      activeFoodSelection: null,
      latestCompletedPoll: null,
      latestCompletedFoodSelection: null,
      menus: [makeMenu()],
      completedFoodSelectionsHistory: [],
      dbConnected: true,
      dbReconnectAttempts: 0,
      initialized: true,
    });

    render(
      <MemoryRouter
        initialEntries={['/polls/poll-history']}

      >
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('historical-poll-view')).toHaveTextContent('poll-history');
    expect(mockFetchPoll).toHaveBeenCalledWith('poll-history');
  });

  it('shows an unavailable message for missing poll URLs', async () => {
    mockUseAppState.mockReturnValue({
      activePoll: makePoll({ id: 'poll-current', status: 'active' }),
      activeFoodSelection: null,
      latestCompletedPoll: null,
      latestCompletedFoodSelection: null,
      menus: [makeMenu()],
      completedFoodSelectionsHistory: [],
      dbConnected: true,
      dbReconnectAttempts: 0,
      initialized: true,
    });

    render(
      <MemoryRouter
        initialEntries={['/polls/poll-stale']}

      >
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: /poll unavailable/i })).toBeInTheDocument();
    expect(mockFetchPoll).toHaveBeenCalledWith('poll-stale');
  });

  it('renders the live food-selection view for a matching food-selection URL', () => {
    mockUseAppState.mockReturnValue({
      activePoll: null,
      activeFoodSelection: makeFoodSelection({ id: 'fs-live', status: 'active' }),
      latestCompletedPoll: null,
      latestCompletedFoodSelection: null,
      menus: [makeMenu()],
      completedFoodSelectionsHistory: [],
      dbConnected: true,
      dbReconnectAttempts: 0,
      initialized: true,
    });

    render(
      <MemoryRouter
        initialEntries={['/food-selections/fs-live']}

      >
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('main-view')).toBeInTheDocument();
  });

  it('renders a completed food selection from a history URL', () => {
    mockUseAppState.mockReturnValue({
      activePoll: null,
      activeFoodSelection: null,
      latestCompletedPoll: null,
      latestCompletedFoodSelection: null,
      menus: [makeMenu()],
      completedFoodSelectionsHistory: [
        makeFoodSelection({
          id: 'fs-history',
          status: 'completed',
          menuName: 'Pizza Place',
          completedAt: '2026-01-01T13:20:00Z',
        }),
      ],
      dbConnected: true,
      dbReconnectAttempts: 0,
      initialized: true,
    });

    render(
      <MemoryRouter
        initialEntries={['/food-selections/fs-history']}

      >
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('historical-completed-view')).toBeInTheDocument();
  });

  it('shows an unavailable message for stale food-selection URLs', () => {
    mockUseAppState.mockReturnValue({
      activePoll: null,
      activeFoodSelection: null,
      latestCompletedPoll: null,
      latestCompletedFoodSelection: null,
      menus: [makeMenu()],
      completedFoodSelectionsHistory: [],
      dbConnected: true,
      dbReconnectAttempts: 0,
      initialized: true,
    });

    render(
      <MemoryRouter
        initialEntries={['/food-selections/missing-selection']}

      >
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /food selection unavailable/i })).toBeInTheDocument();
  });
});
