import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
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

const mockCreateShoppingListItem = vi.fn();
const mockMarkShoppingListItemBought = vi.fn();
vi.mock('../../src/client/api.js', () => ({
  createShoppingListItem: (...args: unknown[]) => mockCreateShoppingListItem(...args),
  markShoppingListItemBought: (...args: unknown[]) => mockMarkShoppingListItemBought(...args),
}));

vi.mock('../../src/client/hooks/useNickname.js', () => ({
  useNickname: () => ({ nickname: 'Alice' }),
}));

import ShoppingList from '../../src/client/pages/ShoppingList.js';

function renderView() {
  return render(
    <MemoryRouter>
      <ShoppingList />
    </MemoryRouter>,
  );
}

describe('ShoppingList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateShoppingListItem.mockResolvedValue({});
    mockMarkShoppingListItemBought.mockResolvedValue({});
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      shoppingListItems: [
        {
          id: 'item-1',
          name: 'Coffee beans',
          requestedBy: 'alice@example.com',
          bought: false,
          boughtBy: null,
          boughtAt: null,
          createdAt: '2026-03-11T10:00:00.000Z',
          updatedAt: '2026-03-11T10:00:00.000Z',
        },
        {
          id: 'item-2',
          name: 'Tea bags',
          requestedBy: 'bob@example.com',
          bought: true,
          boughtBy: 'cara@example.com',
          boughtAt: '2026-03-11T12:00:00.000Z',
          createdAt: '2026-03-11T09:00:00.000Z',
          updatedAt: '2026-03-11T12:00:00.000Z',
        },
        {
          id: 'item-3',
          name: 'Oat milk',
          requestedBy: 'dan@example.com',
          bought: true,
          boughtBy: 'cara@example.com',
          boughtAt: '2026-03-10T16:30:00.000Z',
          createdAt: '2026-03-10T09:00:00.000Z',
          updatedAt: '2026-03-10T16:30:00.000Z',
        },
      ],
    });
  });

  it('renders pending and bought items', () => {
    renderView();

    expect(screen.getByText(/shopping list/i)).toBeInTheDocument();
    expect(screen.getByText(/to buy \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/bought \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText('Coffee beans')).toBeInTheDocument();
    expect(screen.getByText('Tea bags')).toBeInTheDocument();
    expect(screen.getByText('Oat milk')).toBeInTheDocument();
    expect(screen.getByText(/march 11, 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/march 10, 2026/i)).toBeInTheDocument();
  });

  it('adds a shopping list item', async () => {
    const user = userEvent.setup();
    renderView();

    await user.type(screen.getByPlaceholderText(/coffee beans, oat milk/i), 'Printer paper');
    await user.click(screen.getByRole('button', { name: /add item/i }));

    expect(mockCreateShoppingListItem).toHaveBeenCalledWith('Printer paper', 'Alice');
  }, 15000);

  it('marks an item as bought', async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole('button', { name: /mark bought/i }));

    expect(mockMarkShoppingListItemBought).toHaveBeenCalledWith('item-1', 'Alice');
  });

  it('marks all open items as bought with one action', async () => {
    const user = userEvent.setup();
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      shoppingListItems: [
        {
          id: 'item-1',
          name: 'Coffee beans',
          requestedBy: 'alice@example.com',
          bought: false,
          boughtBy: null,
          boughtAt: null,
          createdAt: '2026-03-11T10:00:00.000Z',
          updatedAt: '2026-03-11T10:00:00.000Z',
        },
        {
          id: 'item-4',
          name: 'Printer paper',
          requestedBy: 'bob@example.com',
          bought: false,
          boughtBy: null,
          boughtAt: null,
          createdAt: '2026-03-11T11:00:00.000Z',
          updatedAt: '2026-03-11T11:00:00.000Z',
        },
      ],
    });

    renderView();

    await user.click(screen.getByRole('button', { name: /bought all/i }));

    expect(mockMarkShoppingListItemBought).toHaveBeenNthCalledWith(1, 'item-1', 'Alice');
    expect(mockMarkShoppingListItemBought).toHaveBeenNthCalledWith(2, 'item-4', 'Alice');
    expect(mockMarkShoppingListItemBought).toHaveBeenCalledTimes(2);
  });
});
