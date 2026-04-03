import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { makeFoodOrder, makeFoodSelection, makeMenu, makePoll } from './helpers.js';
import type { AppState } from '../../src/client/context/AppContext.js';
import { initialAppState } from '../../src/client/context/AppContext.js';

const mockUseAppState = vi.fn<() => AppState>();

vi.mock('../../src/client/context/AppContext.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/client/context/AppContext.js')>();
  return {
    ...mod,
    useAppState: (...args: unknown[]) => mockUseAppState(...(args as [])),
  };
});

vi.mock('../../src/client/hooks/useNickname.js', () => ({
  useNickname: () => ({
    nickname: 'Alice',
    updateNickname: vi.fn(),
    clearNickname: vi.fn(),
  }),
}));

const mockStartPoll = vi.fn();
const mockQuickStartFoodSelection = vi.fn();

vi.mock('../../src/client/api.js', () => ({
  startPoll: (...args: unknown[]) => mockStartPoll(...args),
  quickStartFoodSelection: (...args: unknown[]) => mockQuickStartFoodSelection(...args),
}));

import PollIdleView from '../../src/client/components/PollIdleView.js';

function renderView(onOpenHistorySelection?: (selectionId: string) => void) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PollIdleView onOpenHistorySelection={onOpenHistorySelection} />
    </MemoryRouter>,
  );
}

describe('PollIdleView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      defaultFoodSelectionDurationMinutes: 30,
      menus: [
        makeMenu({ id: 'menu-1', name: 'Pizza Place' }),
        makeMenu({ id: 'menu-2', name: 'Sushi Bar' }),
      ],
      latestCompletedPoll: makePoll({
        status: 'finished',
        winnerMenuName: 'Pizza Place',
        voteCounts: { 'menu-1': 3 },
      }),
      latestCompletedFoodSelection: makeFoodSelection({
        id: 'fs-latest',
        status: 'completed',
        menuName: 'Pizza Place',
      }),
      completedFoodSelectionsHistory: [
        makeFoodSelection({
          id: 'fs-1',
          status: 'completed',
          menuName: 'Burger House',
          completedAt: '2026-03-09T12:30:00Z',
          orders: [
            makeFoodOrder({ id: 'o-1', nickname: 'Alice', itemName: 'Cheeseburger', rating: null }),
            makeFoodOrder({ id: 'o-2', nickname: 'Bob', itemName: 'Fries', rating: 4 }),
          ],
        }),
        makeFoodSelection({
          id: 'fs-2',
          status: 'completed',
          menuName: 'Pizza Place',
          completedAt: '2026-03-08T12:30:00Z',
          orders: [
            makeFoodOrder({ id: 'o-3', nickname: 'Alice', itemName: 'Margherita', rating: 5 }),
            makeFoodOrder({ id: 'o-4', nickname: 'Cara', itemName: 'Cheeseburger', rating: 3 }),
          ],
        }),
      ],
    });
  });

  it('renders dashboard heading, quick actions, and stats cards', () => {
    renderView();

    expect(screen.getByRole('heading', { name: /team lunch home base/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /start new team lunch/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /manage menus/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /import a menu/i })).not.toBeInTheDocument();
    expect(screen.getByText(/last winner/i)).toBeInTheDocument();
    expect(screen.getByText(/average rating/i)).toBeInTheDocument();
    expect(screen.getByText('4.0 / 5')).toBeInTheDocument();
    expect(screen.getByText(/most ordered item/i)).toBeInTheDocument();
    expect(screen.getByText(/cheeseburger \(2\)/i)).toBeInTheDocument();
  });

  it('shows meals waiting for rating and opens the selection when requested', async () => {
    const user = userEvent.setup();
    const onOpenHistorySelection = vi.fn();
    renderView(onOpenHistorySelection);

    expect(screen.getByText(/meals waiting for your rating/i)).toBeInTheDocument();
    expect(screen.getByText(/1 unrated meal/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /rate now/i }));
    expect(onOpenHistorySelection).toHaveBeenCalledWith('fs-1');
  });

  it('shows team lunch history preview and both menu and meal popularity', () => {
    renderView();

    expect(screen.getByText(/team lunch history/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /burger house/i }).length).toBeGreaterThan(0);
    expect(screen.getByText(/most popular menus/i)).toBeInTheDocument();
    expect(screen.getByText(/1\. burger house/i)).toBeInTheDocument();
    expect(screen.getByText(/most popular meals/i)).toBeInTheDocument();
    expect(screen.getByText(/1\. cheeseburger/i)).toBeInTheDocument();
    expect(screen.getByText(/recently used menus/i)).toBeInTheDocument();
    expect(screen.getAllByText('Pizza Place').length).toBeGreaterThan(0);
  });

  it('renders description input and duration picker for poll start', () => {
    renderView();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
    expect(screen.getByLabelText('Duration')).toBeInTheDocument();
    expect(screen.getByText('0/120')).toBeInTheDocument();
  });

  it('calls api.startPoll on valid submission', async () => {
    const user = userEvent.setup();
    mockStartPoll.mockResolvedValue({});
    renderView();

    await user.type(screen.getByLabelText('Description'), 'Lunch today?');
    await user.click(screen.getByRole('button', { name: /start new team lunch/i }));

    expect(mockStartPoll).toHaveBeenCalledWith('Lunch today?', 5, []);
  });

  it('requires a reason for each excluded menu', async () => {
    const user = userEvent.setup();
    renderView();

    await user.type(screen.getByLabelText('Description'), 'Lunch today?');
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]);
    await user.click(screen.getByRole('button', { name: /start new team lunch/i }));

    expect(screen.getByText('Provide a justification for every excluded menu')).toBeInTheDocument();
    expect(mockStartPoll).not.toHaveBeenCalled();
  });

  it('shows error from API on failure', async () => {
    const user = userEvent.setup();
    mockStartPoll.mockRejectedValue(new Error('Active poll exists'));
    renderView();

    await user.type(screen.getByLabelText('Description'), 'Lunch');
    await user.click(screen.getByRole('button', { name: /start new team lunch/i }));

    expect(await screen.findByText('Active poll exists')).toBeInTheDocument();
  });

  it('renders single-menu quick start when only one menu has items', async () => {
    const user = userEvent.setup();
    mockQuickStartFoodSelection.mockResolvedValue({});
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      defaultFoodSelectionDurationMinutes: 30,
      menus: [makeMenu({ id: 'menu-1', name: 'Pizza Place' })],
      completedFoodSelectionsHistory: [],
      latestCompletedPoll: null,
      latestCompletedFoodSelection: null,
    });

    renderView();

    expect(screen.getByRole('heading', { name: /start food selection/i })).toBeInTheDocument();
    expect(screen.queryByLabelText('Description')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /start food selection/i }));
    expect(mockQuickStartFoodSelection).toHaveBeenCalledWith(30);
  });

  it('shows validation error for empty poll description', () => {
    renderView();
    fireEvent.submit(screen.getByRole('button', { name: /start new team lunch/i }));
    expect(screen.getByText('Description is required')).toBeInTheDocument();
  });
});
