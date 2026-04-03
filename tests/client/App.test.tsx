import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../../src/client/App.js';
import { makeFoodSelection, makeMenu } from './helpers.js';

const mockDispatch = vi.fn();
const mockUseAppState = vi.fn();
const mockUseAppPhase = vi.fn();

vi.mock('../../src/client/hooks/useSSE.js', () => ({
  useSSE: vi.fn(),
}));

vi.mock('../../src/client/hooks/useNickname.js', () => ({
  useNickname: () => ({ nickname: 'Alice', updateNickname: vi.fn() }),
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
  default: () => <div data-testid="header" />,
}));

vi.mock('../../src/client/components/NicknameModal.js', () => ({
  default: () => null,
}));

vi.mock('../../src/client/pages/MainView.js', () => ({
  default: () => <div data-testid="main-view" />,
}));

vi.mock('../../src/client/pages/ManageMenus.js', () => ({
  default: () => <div data-testid="manage-menus" />,
}));

vi.mock('../../src/client/components/FoodSelectionCompletedView.js', () => ({
  default: ({ isHistorical }: { isHistorical?: boolean }) => (
    <div data-testid={isHistorical ? 'historical-completed-view' : 'completed-view'} />
  ),
}));

describe('App layout with Orders rail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAppPhase.mockReturnValue('POLL_IDLE');
    mockUseAppState.mockReturnValue({
      activePoll: null,
      activeFoodSelection: null,
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

  it('renders orders rail and main view by default', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByText('Past Lunches')).toBeInTheDocument();
    expect(screen.getByTestId('main-view')).toBeInTheDocument();
  });

  it('opens historical completed view when selecting history item', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
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
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
      menus: [makeMenu()],
      completedFoodSelectionsHistory: [],
      dbConnected: true,
      dbReconnectAttempts: 0,
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
      menus: [makeMenu()],
      completedFoodSelectionsHistory: [],
      dbConnected: true,
      dbReconnectAttempts: 0,
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
      menus: [makeMenu()],
      completedFoodSelectionsHistory: [],
      dbConnected: true,
      dbReconnectAttempts: 0,
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
      menus: [makeMenu()],
      completedFoodSelectionsHistory: [],
      dbConnected: true,
      dbReconnectAttempts: 0,
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
      menus: [makeMenu()],
      completedFoodSelectionsHistory: [],
      dbConnected: true,
      dbReconnectAttempts: 0,
    });

    render(
      <MemoryRouter
        initialEntries={['/menus']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
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
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
      menus: [],
      completedFoodSelectionsHistory: [],
      dbConnected: true,
      dbReconnectAttempts: 0,
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: /start new team lunch/i })).toBeDisabled();
  });

  it('shows database connection modal when DB is unavailable', () => {
    mockUseAppState.mockReturnValue({
      activePoll: null,
      activeFoodSelection: null,
      menus: [makeMenu()],
      completedFoodSelectionsHistory: [],
      dbConnected: false,
      dbReconnectAttempts: 3,
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
      menus: [makeMenu()],
      completedFoodSelectionsHistory: [],
      dbConnected: true,
      dbReconnectAttempts: 0,
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </MemoryRouter>,
    );

    const inProgressButton = screen.getByRole('button', { name: /cuisine poll in progress\.\.\./i });
    expect(inProgressButton).toBeInTheDocument();
    expect(inProgressButton).toHaveTextContent('1/3');

    await user.click(inProgressButton);
    expect(mockDispatch).not.toHaveBeenCalledWith({ type: 'START_NEW_TEAM_LUNCH' });
  });
});
