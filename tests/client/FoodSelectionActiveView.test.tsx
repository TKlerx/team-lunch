import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { makeFoodSelection, makeFoodOrder, makeMenu, makeMenuItem, makePoll } from './helpers.js';
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

vi.mock('../../src/client/hooks/useNickname.js', () => ({
  useNickname: () => ({
    nickname: 'Alice',
    updateNickname: vi.fn(),
    clearNickname: vi.fn(),
  }),
}));

const mockUseCountdown = vi.fn<() => number>();
vi.mock('../../src/client/hooks/useCountdown.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/client/hooks/useCountdown.js')>();
  return {
    ...mod,
    useCountdown: (...args: unknown[]) => mockUseCountdown(...(args as [])),
  };
});

const mockPlaceOrder = vi.fn();
const mockWithdrawOrder = vi.fn();
const mockCompleteFoodSelectionNow = vi.fn();
const mockAbortFoodSelection = vi.fn();
const mockUpdateFoodSelectionTimer = vi.fn();
const mockGetUserPreferences = vi.fn();
const mockUpdateUserPreferences = vi.fn();
const mockRemindMissingOrders = vi.fn();
vi.mock('../../src/client/api.js', () => ({
  placeOrder: (...args: unknown[]) => mockPlaceOrder(...args),
  withdrawOrder: (...args: unknown[]) => mockWithdrawOrder(...args),
  completeFoodSelectionNow: (...args: unknown[]) => mockCompleteFoodSelectionNow(...args),
  abortFoodSelection: (...args: unknown[]) => mockAbortFoodSelection(...args),
  updateFoodSelectionTimer: (...args: unknown[]) => mockUpdateFoodSelectionTimer(...args),
  getUserPreferences: (...args: unknown[]) => mockGetUserPreferences(...args),
  updateUserPreferences: (...args: unknown[]) => mockUpdateUserPreferences(...args),
  remindMissingOrders: (...args: unknown[]) => mockRemindMissingOrders(...args),
}));

import FoodSelectionActiveView from '../../src/client/components/FoodSelectionActiveView.js';

function renderView() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <FoodSelectionActiveView />
    </MemoryRouter>,
  );
}

describe('FoodSelectionActiveView', () => {
  const menuItems = [
    makeMenuItem({ id: 'item-1', itemNumber: '12', name: 'Margherita', description: 'Classic pizza', price: 9.5 }),
    makeMenuItem({ id: 'item-2', name: 'Pepperoni', description: null, price: 11 }),
  ];
  const menus = [makeMenu({ id: 'menu-1', name: 'Pizza Place', items: menuItems })];

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserPreferences.mockResolvedValue({
      userKey: 'Alice',
      allergies: [],
      dislikes: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockUpdateUserPreferences.mockResolvedValue({
      userKey: 'Alice',
      allergies: [],
      dislikes: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockRemindMissingOrders.mockResolvedValue({ remindedCount: 1 });
    mockUseCountdown.mockReturnValue(600); // 10 min
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus,
      latestCompletedPoll: makePoll({
        id: 'poll-1',
        status: 'finished',
        winnerMenuId: 'menu-1',
        winnerMenuName: 'Pizza Place',
        votes: [
          {
            id: 'vote-1',
            pollId: 'poll-1',
            menuId: 'menu-1',
            menuName: 'Pizza Place',
            nickname: 'Alice',
            castAt: '2026-01-01T12:01:00.000Z',
          },
          {
            id: 'vote-2',
            pollId: 'poll-1',
            menuId: 'menu-1',
            menuName: 'Pizza Place',
            nickname: 'Bob',
            castAt: '2026-01-01T12:02:00.000Z',
          },
        ],
        voteCounts: { 'menu-1': 2 },
      }),
      activeFoodSelection: makeFoodSelection({
        menuId: 'menu-1',
        menuName: 'Pizza Place',
        orders: [],
      }),
    });
  });

  it('shows countdown bar with menu name and time', () => {
    renderView();
    expect(screen.getByText(/pizza place/i)).toBeInTheDocument();
    expect(screen.getByText('10:00')).toBeInTheDocument();
  });

  it('renders "Your order" title and menu items', () => {
    renderView();
    expect(screen.getByText('Your order')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Margherita')).toBeInTheDocument();
    expect(screen.getByText('Classic pizza')).toBeInTheDocument();
    expect(screen.getByText('Pepperoni')).toBeInTheDocument();
    expect(screen.getByText('€9.50')).toBeInTheDocument();
    expect(screen.getByText('€11.00')).toBeInTheDocument();
  });

  it('renders per-item comment fields for extras/spiciness', () => {
    renderView();
    expect(screen.getByLabelText('Comment for Margherita')).toBeInTheDocument();
    expect(screen.getByLabelText('Comment for Pepperoni')).toBeInTheDocument();
  });

  it('shows an item search field', () => {
    renderView();
    expect(screen.getByPlaceholderText(/search items \(min\. 3 chars\)/i)).toBeInTheDocument();
  });

  it('does not filter items when search has fewer than 3 characters', async () => {
    const user = userEvent.setup();
    renderView();

    await user.type(screen.getByPlaceholderText(/search items \(min\. 3 chars\)/i), 'ma');

    expect(screen.getByText('Margherita')).toBeInTheDocument();
    expect(screen.getByText('Pepperoni')).toBeInTheDocument();
  });

  it('filters items when search has at least 3 characters', async () => {
    const user = userEvent.setup();
    renderView();

    await user.type(screen.getByPlaceholderText(/search items \(min\. 3 chars\)/i), 'mar');

    expect(screen.getByText('Margherita')).toBeInTheDocument();
    expect(screen.queryByText('Pepperoni')).not.toBeInTheDocument();
  });

  it('shows per-item add actions and withdraw action', () => {
    renderView();
    expect(screen.getAllByRole('button', { name: /^add$/i })).toHaveLength(2);
    expect(screen.getByRole('button', { name: /withdraw/i })).toBeInTheDocument();
  });

  it('calls placeOrder when clicking Add for an item', async () => {
    const user = userEvent.setup();
    mockPlaceOrder.mockResolvedValue({});
    renderView();

    await user.click(screen.getAllByRole('button', { name: /^add$/i })[0]);

    expect(mockPlaceOrder).toHaveBeenCalledWith('fs-1', 'Alice', 'item-1', undefined);
  });

  it('shows allergy warning badges from user preferences', async () => {
    mockGetUserPreferences.mockResolvedValue({
      userKey: 'Alice',
      allergies: ['pizza'],
      dislikes: ['pepperoni'],
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    renderView();

    expect(await screen.findByText(/allergy warning: pizza/i)).toBeInTheDocument();
    expect(await screen.findByText(/contains disliked ingredients: pepperoni/i)).toBeInTheDocument();
  });

  it('asks for confirmation before adding an item with allergy warning', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mockGetUserPreferences.mockResolvedValue({
      userKey: 'Alice',
      allergies: ['pizza'],
      dislikes: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    renderView();

    await screen.findByText(/allergy warning: pizza/i);
    await user.click(screen.getAllByRole('button', { name: /^add$/i })[0]);

    expect(mockPlaceOrder).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('includes order comment when clicking Add', async () => {
    const user = userEvent.setup();
    mockPlaceOrder.mockResolvedValue({});
    renderView();

    await user.type(screen.getByLabelText('Comment for Margherita'), 'Extra cheese');
    await user.click(screen.getAllByRole('button', { name: /^add$/i })[0]);

    expect(mockPlaceOrder).toHaveBeenCalledWith('fs-1', 'Alice', 'item-1', 'Extra cheese');
  });

  it('clears the order comment field after adding an item', async () => {
    const user = userEvent.setup();
    mockPlaceOrder.mockResolvedValue({});
    renderView();

    const commentField = screen.getByLabelText('Comment for Margherita');
    await user.type(commentField, 'No onions');
    await user.click(screen.getAllByRole('button', { name: /^add$/i })[0]);

    expect(commentField).toHaveValue('');
  });

  it('shows my added meals with persisted note and item number', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus,
      activeFoodSelection: makeFoodSelection({
        orders: [
          makeFoodOrder({
            id: 'order-1',
            nickname: 'Alice',
            itemId: 'item-1',
            itemName: 'Margherita',
            notes: 'extra cheese',
          }),
        ],
      }),
    });
    renderView();

    const myMealsHeading = screen.getByText(/your added meals/i);
    expect(myMealsHeading).toBeInTheDocument();
    expect(myMealsHeading.parentElement).toHaveTextContent('12');
    expect(myMealsHeading.parentElement).toHaveTextContent('Margherita');
    expect(myMealsHeading.parentElement).toHaveTextContent('(extra cheese)');
  });

  it('does not render the selected line-items summary panel', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus,
      activeFoodSelection: makeFoodSelection({
        orders: [
          makeFoodOrder({ nickname: 'Alice', itemId: 'item-1', itemName: 'Margherita', notes: null }),
          makeFoodOrder({ id: 'order-2', nickname: 'Alice', itemId: 'item-1', itemName: 'Margherita', notes: 'hot' }),
        ],
      }),
    });
    renderView();
    expect(screen.queryByText(/your selected line items/i)).not.toBeInTheDocument();
  });

  it('allows removing own item directly from order list', async () => {
    const user = userEvent.setup();
    mockWithdrawOrder.mockResolvedValue({});
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus,
      activeFoodSelection: makeFoodSelection({
        orders: [
          makeFoodOrder({ id: 'order-1', nickname: 'Alice', itemId: 'item-1', itemName: 'Margherita' }),
          makeFoodOrder({ id: 'order-2', nickname: 'Bob', itemId: 'item-2', itemName: 'Pepperoni' }),
        ],
      }),
    });

    renderView();

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(mockWithdrawOrder).toHaveBeenCalledWith('fs-1', 'Alice', 'order-1');
  });

  it('calls withdrawOrder when clicking Withdraw', async () => {
    const user = userEvent.setup();
    mockWithdrawOrder.mockResolvedValue({});
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus,
      activeFoodSelection: makeFoodSelection({
        orders: [makeFoodOrder({ nickname: 'Alice', itemId: 'item-1', itemName: 'Margherita' })],
      }),
    });
    renderView();

    await user.click(screen.getByRole('button', { name: /withdraw/i }));
    expect(mockWithdrawOrder).toHaveBeenCalledWith('fs-1', 'Alice');
  });

  it('shows "No orders yet" when order board is empty', () => {
    renderView();
    expect(screen.getByText('No orders yet')).toBeInTheDocument();
  });

  it('shows voters who voted for the selected menu but have not ordered yet', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus,
      latestCompletedPoll: makePoll({
        id: 'poll-1',
        status: 'finished',
        winnerMenuId: 'menu-1',
        winnerMenuName: 'Pizza Place',
        votes: [
          {
            id: 'vote-1',
            pollId: 'poll-1',
            menuId: 'menu-1',
            menuName: 'Pizza Place',
            nickname: 'Alice',
            castAt: '2026-01-01T12:01:00.000Z',
          },
          {
            id: 'vote-2',
            pollId: 'poll-1',
            menuId: 'menu-1',
            menuName: 'Pizza Place',
            nickname: 'Bob',
            castAt: '2026-01-01T12:02:00.000Z',
          },
          {
            id: 'vote-3',
            pollId: 'poll-1',
            menuId: 'menu-2',
            menuName: 'Other',
            nickname: 'Carol',
            castAt: '2026-01-01T12:03:00.000Z',
          },
        ],
        voteCounts: { 'menu-1': 2, 'menu-2': 1 },
      }),
      activeFoodSelection: makeFoodSelection({
        menuId: 'menu-1',
        menuName: 'Pizza Place',
        orders: [makeFoodOrder({ nickname: 'Alice', itemId: 'item-1', itemName: 'Margherita' })],
      }),
    });

    renderView();

    expect(screen.getByText(/voted for menu but not ordered yet \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.queryByText('Carol')).not.toBeInTheDocument();
  });

  it('allows admin to ping users who have not ordered yet', async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole('button', { name: /ping missing users/i }));

    expect(mockRemindMissingOrders).toHaveBeenCalledWith('fs-1');
    expect(await screen.findByText('Sent 1 reminder.')).toBeInTheDocument();
  });

  it('shows fallback text when all voters already ordered', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus,
      latestCompletedPoll: makePoll({
        id: 'poll-1',
        status: 'finished',
        winnerMenuId: 'menu-1',
        winnerMenuName: 'Pizza Place',
        votes: [
          {
            id: 'vote-1',
            pollId: 'poll-1',
            menuId: 'menu-1',
            menuName: 'Pizza Place',
            nickname: 'Alice',
            castAt: '2026-01-01T12:01:00.000Z',
          },
        ],
        voteCounts: { 'menu-1': 1 },
      }),
      activeFoodSelection: makeFoodSelection({
        menuId: 'menu-1',
        menuName: 'Pizza Place',
        orders: [makeFoodOrder({ nickname: 'Alice', itemId: 'item-1', itemName: 'Margherita' })],
      }),
    });

    renderView();

    expect(screen.getByText(/voted for menu but not ordered yet \(0\)/i)).toBeInTheDocument();
    expect(screen.getByText(/everyone who voted has ordered/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ping missing users/i })).not.toBeInTheDocument();
  });

  it('shows order board with other users\' orders', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus,
      activeFoodSelection: makeFoodSelection({
        orders: [
          makeFoodOrder({ nickname: 'Bob', itemId: 'item-2', itemName: 'Pepperoni', notes: 'spicy' }),
          makeFoodOrder({ id: 'order-2', nickname: 'Carol', itemId: 'item-1', itemName: 'Margherita', notes: null }),
        ],
      }),
    });
    renderView();

    expect(screen.getByText(/Bob\s*\(1\)/)).toBeInTheDocument();
    // 'Pepperoni' appears in both the order form item card and the order board
    expect(screen.getAllByText('Pepperoni').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('(spicy)')).toBeInTheDocument();
    expect(screen.getAllByText('12').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Carol\s*\(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/orders \(2 orders, 2 users\)/i)).toBeInTheDocument();
    expect(screen.getByText('Total: €20.50')).toBeInTheDocument();
  });

  it('returns null when no activeFoodSelection', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus,
      activeFoodSelection: null,
    });
    const { container } = renderView();
    expect(container.innerHTML).toBe('');
  });

  it('opens timer action menu and confirms completion', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockCompleteFoodSelectionNow.mockResolvedValue({});
    renderView();

    await user.click(screen.getByRole('button', { name: /food selection timer actions/i }));
    await user.click(screen.getByRole('button', { name: /finish meal collection/i }));

    expect(mockCompleteFoodSelectionNow).toHaveBeenCalledWith('fs-1');
    confirmSpy.mockRestore();
  });

  it('updates food selection timer from preset entry in timer menu', async () => {
    const user = userEvent.setup();
    mockUpdateFoodSelectionTimer.mockResolvedValue({});
    renderView();

    await user.click(screen.getByRole('button', { name: /food selection timer actions/i }));
    await user.click(screen.getByRole('button', { name: /^10 min$/i }));

    expect(mockUpdateFoodSelectionTimer).toHaveBeenCalledWith('fs-1', 10);
  });

  it('updates food selection timer from manual minutes input', async () => {
    const user = userEvent.setup();
    mockUpdateFoodSelectionTimer.mockResolvedValue({});
    renderView();

    await user.click(screen.getByRole('button', { name: /food selection timer actions/i }));
    await user.type(screen.getByLabelText(/food selection manual minutes remaining/i), '33{enter}');

    expect(mockUpdateFoodSelectionTimer).toHaveBeenCalledWith('fs-1', 33);
  });

  it('closes timer menu when clicking outside', async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole('button', { name: /food selection timer actions/i }));
    expect(screen.getByRole('button', { name: /finish meal collection/i })).toBeInTheDocument();

    await user.click(screen.getByText('Your order'));

    expect(screen.queryByRole('button', { name: /finish meal collection/i })).not.toBeInTheDocument();
  });

  it('calls abortFoodSelection from timer menu abort process action', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockAbortFoodSelection.mockResolvedValue({});
    renderView();

    await user.click(screen.getByRole('button', { name: /food selection timer actions/i }));
    await user.click(screen.getByRole('button', { name: /abort process/i }));

    expect(mockAbortFoodSelection).toHaveBeenCalledWith('fs-1');
    confirmSpy.mockRestore();
  });
});
