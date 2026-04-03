import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { makeFoodSelection, makeFoodOrder, makeMenu, makeMenuItem } from './helpers.js';
import type { AppState } from '../../src/client/context/AppContext.js';
import { initialAppState } from '../../src/client/context/AppContext.js';

const mockUseAppState = vi.fn<() => AppState>();
const mockRateOrder = vi.fn();

vi.mock('../../src/client/context/AppContext.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/client/context/AppContext.js')>();
  return {
    ...mod,
    useAppState: (...args: unknown[]) => mockUseAppState(...(args as [])),
  };
});

vi.mock('../../src/client/api.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/client/api.js')>();
  return {
    ...mod,
    rateOrder: (...args: Parameters<typeof mod.rateOrder>) => mockRateOrder(...args),
  };
});

import FoodSelectionCompletedView from '../../src/client/components/FoodSelectionCompletedView.js';

function renderView() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <FoodSelectionCompletedView />
    </MemoryRouter>,
  );
}

describe('FoodSelectionCompletedView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('team_lunch_nickname', 'Alice');
    mockRateOrder.mockResolvedValue(makeFoodOrder({ rating: 4, feedbackComment: 'Food was still hot' }));
    if (!navigator.clipboard) {
      Object.defineProperty(window.navigator, 'clipboard', {
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
        configurable: true,
      });
    }

    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus: [
        makeMenu({
          id: 'menu-1',
          name: 'Pizza Place',
          items: [
            makeMenuItem({
              id: 'item-1',
              menuId: 'menu-1',
              itemNumber: '12',
              name: 'Margherita',
              price: 9.5,
            }),
            makeMenuItem({
              id: 'item-2',
              menuId: 'menu-1',
              itemNumber: '21',
              name: 'Pepperoni',
              price: 11,
            }),
          ],
          itemCount: 2,
        }),
      ],
      latestCompletedFoodSelection: makeFoodSelection({
        status: 'completed',
        menuName: 'Pizza Place',
        completedAt: '2026-01-01T13:25:00Z',
        orders: [
          makeFoodOrder({
            nickname: 'Alice',
            itemId: 'item-1',
            itemName: 'Margherita',
            notes: 'extra cheese',
          }),
          makeFoodOrder({
            id: 'order-2',
            nickname: 'Bob',
            itemId: 'item-2',
            itemName: 'Pepperoni',
            notes: null,
          }),
        ],
      }),
    });
  });

  it('shows "Team Lunch order completed" heading', () => {
    renderView();
    expect(screen.getByText('Team Lunch order completed!')).toBeInTheDocument();
  });

  it('displays the menu name', () => {
    renderView();
    expect(screen.getByText('Pizza Place')).toBeInTheDocument();
  });

  it('shows all orders with nickname, item, and notes', () => {
    renderView();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('12 Margherita')).toBeInTheDocument();
    expect(screen.getByText('(extra cheese)')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('21 Pepperoni')).toBeInTheDocument();
    expect(screen.getByText('€9.50')).toBeInTheDocument();
    expect(screen.getByText('€11.00')).toBeInTheDocument();
    expect(screen.getByText('Total: €20.50')).toBeInTheDocument();
  });

  it('resolves price by itemName when itemId is missing', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus: [
        makeMenu({
          id: 'menu-1',
          name: 'Pizza Place',
          items: [
            makeMenuItem({
              id: 'item-1',
              menuId: 'menu-1',
              itemNumber: '8',
              name: 'Bruschetta',
              price: 6,
            }),
          ],
          itemCount: 1,
        }),
      ],
      latestCompletedFoodSelection: makeFoodSelection({
        status: 'completed',
        menuId: 'menu-1',
        menuName: 'Pizza Place',
        orders: [makeFoodOrder({ id: 'order-1', itemId: null, itemName: 'Bruschetta', nickname: 'Bob' })],
      }),
    });

    renderView();
    expect(screen.getByText('€6.00')).toBeInTheDocument();
    expect(screen.getByText('Total: €6.00')).toBeInTheDocument();
  });

  it('shows "No orders were placed" when orders list is empty', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      latestCompletedFoodSelection: makeFoodSelection({
        status: 'completed',
        orders: [],
      }),
    });
    renderView();
    expect(screen.getByText('No orders were placed')).toBeInTheDocument();
  });

  it('shows immutable finalization prompt', () => {
    renderView();
    expect(
      screen.getByText(/delivery confirmed\. this order is now final and stored in history\./i),
    ).toBeInTheDocument();
  });

  it('shows completion timestamp label', () => {
    renderView();
    expect(screen.getByText(/completed:/i)).toBeInTheDocument();
  });

  it('does not show ETA editing controls', () => {
    renderView();
    expect(screen.queryByRole('button', { name: /update eta/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/eta/i)).not.toBeInTheDocument();
  });

  it('shows final ETA summary when present', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      latestCompletedFoodSelection: makeFoodSelection({
        status: 'completed',
        etaMinutes: 30,
      }),
    });

    renderView();
    expect(screen.getByText(/final eta was 30 minutes\./i)).toBeInTheDocument();
  });

  it('shows early/late comparison to announced arrival', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      latestCompletedFoodSelection: makeFoodSelection({
        status: 'completed',
        deliveryDueAt: '2026-01-01T13:30:00Z',
        completedAt: '2026-01-01T13:40:00Z',
      }),
    });

    renderView();
    expect(screen.getByText(/arrived 10 min later than announced\./i)).toBeInTheDocument();
  });

  it('copies final order list to clipboard', async () => {
    const user = userEvent.setup();
    const writeTextMock = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    renderView();

    await user.click(screen.getByRole('button', { name: /copy order list/i }));

    expect(writeTextMock).toHaveBeenCalledTimes(1);
    expect(writeTextMock.mock.calls[0]?.[0]).toContain('Team Lunch order - Pizza Place');
    expect(writeTextMock.mock.calls[0]?.[0]).toContain(
      '- Alice · 12 Margherita (€9.50) (extra cheese)',
    );
    expect(writeTextMock.mock.calls[0]?.[0]).toContain('- Bob · 21 Pepperoni (€11.00)');
    expect(writeTextMock.mock.calls[0]?.[0]).toContain('Total: €20.50');
    expect(screen.getByText(/copied to clipboard\./i)).toBeInTheDocument();
  });

  it('shows an error message when copy fails', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window.navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });
    renderView();

    await user.click(screen.getByRole('button', { name: /copy order list/i }));

    expect(screen.getByText(/could not copy to clipboard/i)).toBeInTheDocument();
  });

  it('returns null when no latestCompletedFoodSelection', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      latestCompletedFoodSelection: null,
    });
    const { container } = renderView();
    expect(container.innerHTML).toBe('');
  });

  it('lets the current user save rating plus optional feedback remark', async () => {
    const user = userEvent.setup();
    renderView();

    await user.selectOptions(screen.getByLabelText(/rating for margherita/i), '4');
    await user.type(screen.getByLabelText(/feedback remark for margherita/i), 'Food was still hot');
    await user.click(screen.getByRole('button', { name: /save feedback/i }));

    expect(mockRateOrder).toHaveBeenCalledWith(
      'fs-1',
      'order-1',
      'Alice',
      4,
      'Food was still hot',
    );
  });
});
