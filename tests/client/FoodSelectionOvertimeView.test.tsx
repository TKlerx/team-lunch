import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { makeFoodSelection, makeFoodOrder, makeMenu, makeMenuItem } from './helpers.js';
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

const mockExtendFoodSelection = vi.fn();
const mockCompleteFoodSelection = vi.fn();
vi.mock('../../src/client/api.js', () => ({
  extendFoodSelection: (...args: unknown[]) => mockExtendFoodSelection(...args),
  completeFoodSelection: (...args: unknown[]) => mockCompleteFoodSelection(...args),
}));

import FoodSelectionOvertimeView from '../../src/client/components/FoodSelectionOvertimeView.js';

function renderView() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <FoodSelectionOvertimeView />
    </MemoryRouter>,
  );
}

describe('FoodSelectionOvertimeView', () => {
  const orders = [
    makeFoodOrder({ nickname: 'Alice', itemName: 'Margherita', notes: 'no garlic' }),
    makeFoodOrder({ id: 'order-2', nickname: 'Bob', itemName: 'Pepperoni', notes: null }),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus: [
        makeMenu({
          id: 'menu-1',
          items: [
            makeMenuItem({ id: 'item-1', name: 'Margherita', price: 9.5 }),
            makeMenuItem({ id: 'item-2', name: 'Pepperoni', price: 11 }),
          ],
          itemCount: 2,
        }),
      ],
      activeFoodSelection: makeFoodSelection({
        status: 'overtime',
        menuName: 'Pizza Place',
        orders,
      }),
    });
  });

  it('shows "Time\'s up!" heading', () => {
    renderView();
    const headings = screen.getAllByText(/time's up/i);
    expect(headings.length).toBeGreaterThan(0);
  });

  it('shows overtime prompt text', () => {
    renderView();
    expect(screen.getByText(/extend the food selection or confirm/i)).toBeInTheDocument();
  });

  it('shows menu name in the banner', () => {
    renderView();
    expect(screen.getByText(/pizza place/i)).toBeInTheDocument();
  });

  it('has extension duration picker with 5/10/15 options', () => {
    renderView();
    const options = screen.getAllByRole('option');
    const values = options.map((o) => o.getAttribute('value'));
    expect(values).toContain('5');
    expect(values).toContain('10');
    expect(values).toContain('15');
  });

  it('calls extendFoodSelection with selected duration on Extend click', async () => {
    const user = userEvent.setup();
    mockExtendFoodSelection.mockResolvedValue({});
    renderView();

    await user.selectOptions(screen.getByRole('combobox'), '10');
    await user.click(screen.getByRole('button', { name: 'Extend' }));

    expect(mockExtendFoodSelection).toHaveBeenCalledWith('fs-1', 10);
  });

  it('calls completeFoodSelection on "Confirm" click', async () => {
    const user = userEvent.setup();
    mockCompleteFoodSelection.mockResolvedValue({});
    renderView();

    await user.click(screen.getByRole('button', { name: /confirm/i }));
    expect(mockCompleteFoodSelection).toHaveBeenCalledWith('fs-1');
  });

  it('shows API error on failure', async () => {
    const user = userEvent.setup();
    mockExtendFoodSelection.mockRejectedValue(new Error('Server error'));
    renderView();

    await user.click(screen.getByRole('button', { name: 'Extend' }));
    expect(await screen.findByText('Server error')).toBeInTheDocument();
  });

  it('shows read-only order board with existing orders', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus: [
        makeMenu({
          id: 'menu-1',
          items: [
            makeMenuItem({ id: 'item-1', name: 'Margherita', price: 9.5 }),
            makeMenuItem({ id: 'item-2', name: 'Pepperoni', price: 11 }),
          ],
          itemCount: 2,
        }),
      ],
      activeFoodSelection: makeFoodSelection({
        status: 'overtime',
        menuName: 'Pizza Place',
        orders: [
          makeFoodOrder({ nickname: 'Alice', itemId: 'item-1', itemName: 'Margherita', notes: 'no garlic' }),
          makeFoodOrder({ id: 'order-2', nickname: 'Bob', itemId: 'item-2', itemName: 'Pepperoni', notes: null }),
        ],
      }),
    });

    renderView();
    expect(screen.getByText(/Alice\s*\(1\)/)).toBeInTheDocument();
    expect(screen.getByText('Margherita')).toBeInTheDocument();
    expect(screen.getByText('(no garlic)')).toBeInTheDocument();
    expect(screen.getByText(/Bob\s*\(1\)/)).toBeInTheDocument();
    expect(screen.getByText('Pepperoni')).toBeInTheDocument();
    expect(screen.getByText(/orders \(2 orders, 2 users\)/i)).toBeInTheDocument();
    expect(screen.getByText('Total: €20.50')).toBeInTheDocument();
  });

  it('shows "No orders placed" when order list is empty', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      activeFoodSelection: makeFoodSelection({
        status: 'overtime',
        orders: [],
      }),
    });
    renderView();
    expect(screen.getByText('No orders placed')).toBeInTheDocument();
  });

  it('returns null when no activeFoodSelection', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      activeFoodSelection: null,
    });
    const { container } = renderView();
    expect(container.innerHTML).toBe('');
  });
});
