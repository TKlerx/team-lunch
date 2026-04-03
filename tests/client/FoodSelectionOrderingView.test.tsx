import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { makeFoodSelection, makeFoodOrder, makeMenu, makeMenuItem } from './helpers.js';
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

const mockPlaceDeliveryOrder = vi.fn();
const mockClaimOrderingResponsibility = vi.fn();
const mockSetOrderProcessed = vi.fn();
const mockFetchFallbackOrderCandidates = vi.fn();
const mockPlaceFallbackOrder = vi.fn();
const mockPingFallbackCandidate = vi.fn();
vi.mock('../../src/client/api.js', () => ({
  placeDeliveryOrder: (...args: unknown[]) => mockPlaceDeliveryOrder(...args),
  claimOrderingResponsibility: (...args: unknown[]) => mockClaimOrderingResponsibility(...args),
  setOrderProcessed: (...args: unknown[]) => mockSetOrderProcessed(...args),
  fetchFallbackOrderCandidates: (...args: unknown[]) => mockFetchFallbackOrderCandidates(...args),
  placeFallbackOrder: (...args: unknown[]) => mockPlaceFallbackOrder(...args),
  pingFallbackCandidate: (...args: unknown[]) => mockPingFallbackCandidate(...args),
}));

vi.mock('../../src/client/hooks/useNickname.js', () => ({
  useNickname: () => ({ nickname: 'Alice' }),
}));

import FoodSelectionOrderingView from '../../src/client/components/FoodSelectionOrderingView.js';

function renderView() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <FoodSelectionOrderingView />
    </MemoryRouter>,
  );
}

describe('FoodSelectionOrderingView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchFallbackOrderCandidates.mockResolvedValue([
      {
        nickname: 'Dana',
        itemId: 'item-2',
        itemName: 'Pepperoni',
        itemNumber: '21',
      },
    ]);
    mockClaimOrderingResponsibility.mockResolvedValue({});
    mockPlaceFallbackOrder.mockResolvedValue({});
    mockPingFallbackCandidate.mockResolvedValue({ targetNickname: 'Dana' });
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
          items: [
            makeMenuItem({ id: 'item-1', itemNumber: '12', name: 'Margherita', price: 9.5 }),
            makeMenuItem({ id: 'item-2', itemNumber: '21', name: 'Pepperoni', price: 11 }),
          ],
          itemCount: 2,
        }),
      ],
      activeFoodSelection: makeFoodSelection({
        status: 'ordering',
        orders: [
          makeFoodOrder({
            id: 'o-1',
            nickname: 'Alice',
            itemId: 'item-1',
            itemName: 'Margherita',
            notes: 'hot',
          }),
          makeFoodOrder({
            id: 'o-3',
            nickname: 'Cara',
            itemId: 'item-1',
            itemName: 'Margherita',
            notes: 'hot',
          }),
          makeFoodOrder({
            id: 'o-2',
            nickname: 'Bob',
            itemId: 'item-2',
            itemName: 'Pepperoni',
            notes: null,
          }),
        ],
      }),
    });
  });

  it('renders ordering heading and place-order action', () => {
    renderView();
    expect(screen.getByText(/ready to place order/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /i am placing the order/i })).toBeInTheDocument();
  });

  it('claims ordering responsibility before placing the order', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderView();

    await user.click(screen.getByRole('button', { name: /i am placing the order/i }));

    expect(mockClaimOrderingResponsibility).toHaveBeenCalledWith('fs-1', 'Alice');
    confirmSpy.mockRestore();
  });

  it('submits place-order request with custom ETA', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockPlaceDeliveryOrder.mockResolvedValue({});
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus: [
        makeMenu({
          id: 'menu-1',
          items: [
            makeMenuItem({ id: 'item-1', itemNumber: '12', name: 'Margherita', price: 9.5 }),
            makeMenuItem({ id: 'item-2', itemNumber: '21', name: 'Pepperoni', price: 11 }),
          ],
          itemCount: 2,
        }),
      ],
      activeFoodSelection: makeFoodSelection({
        status: 'ordering',
        orderPlacedBy: 'Alice',
        orders: [
          makeFoodOrder({
            id: 'o-1',
            nickname: 'Alice',
            itemId: 'item-1',
            itemName: 'Margherita',
            notes: 'hot',
          }),
          makeFoodOrder({
            id: 'o-3',
            nickname: 'Cara',
            itemId: 'item-1',
            itemName: 'Margherita',
            notes: 'hot',
          }),
          makeFoodOrder({
            id: 'o-2',
            nickname: 'Bob',
            itemId: 'item-2',
            itemName: 'Pepperoni',
            notes: null,
          }),
        ],
      }),
    });
    renderView();

    await user.click(screen.getByRole('button', { name: /place order eta menu/i }));
    await user.type(screen.getByLabelText(/custom eta in minutes/i), '37');
    await user.click(screen.getByRole('button', { name: /confirm placed order/i }));

    expect(mockPlaceDeliveryOrder).toHaveBeenCalledWith('fs-1', 37, 'Alice');
    confirmSpy.mockRestore();
  });

  it('does not submit place-order request when confirmation is canceled', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus: [
        makeMenu({
          id: 'menu-1',
          items: [
            makeMenuItem({ id: 'item-1', itemNumber: '12', name: 'Margherita', price: 9.5 }),
            makeMenuItem({ id: 'item-2', itemNumber: '21', name: 'Pepperoni', price: 11 }),
          ],
          itemCount: 2,
        }),
      ],
      activeFoodSelection: makeFoodSelection({
        status: 'ordering',
        orderPlacedBy: 'Alice',
        orders: [
          makeFoodOrder({
            id: 'o-1',
            nickname: 'Alice',
            itemId: 'item-1',
            itemName: 'Margherita',
            notes: 'hot',
          }),
        ],
      }),
    });
    renderView();

    await user.click(screen.getByRole('button', { name: /place order eta menu/i }));
    await user.click(screen.getByRole('button', { name: '40 min' }));

    expect(mockPlaceDeliveryOrder).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('shows validation error for invalid custom ETA and does not submit', async () => {
    const user = userEvent.setup();
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus: [
        makeMenu({
          id: 'menu-1',
          items: [
            makeMenuItem({ id: 'item-1', itemNumber: '12', name: 'Margherita', price: 9.5 }),
            makeMenuItem({ id: 'item-2', itemNumber: '21', name: 'Pepperoni', price: 11 }),
          ],
          itemCount: 2,
        }),
      ],
      activeFoodSelection: makeFoodSelection({
        status: 'ordering',
        orderPlacedBy: 'Alice',
        orders: [
          makeFoodOrder({
            id: 'o-1',
            nickname: 'Alice',
            itemId: 'item-1',
            itemName: 'Margherita',
            notes: 'hot',
          }),
        ],
      }),
    });
    renderView();

    await user.click(screen.getByRole('button', { name: /place order eta menu/i }));
    await user.type(screen.getByLabelText(/custom eta in minutes/i), '0');
    await user.click(screen.getByRole('button', { name: /confirm placed order/i }));

    expect(mockPlaceDeliveryOrder).not.toHaveBeenCalled();
    expect(
      screen.getByText('Custom ETA must be an integer between 1 and 240 minutes'),
    ).toBeInTheDocument();
  });

  it('shows when another user already claimed the ordering step', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus: [
        makeMenu({
          id: 'menu-1',
          items: [
            makeMenuItem({ id: 'item-1', itemNumber: '12', name: 'Margherita', price: 9.5 }),
          ],
          itemCount: 1,
        }),
      ],
      activeFoodSelection: makeFoodSelection({
        status: 'ordering',
        orderPlacedBy: 'Dana',
        orders: [],
      }),
    });

    renderView();

    expect(screen.getByText(/dana is placing the order/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /place order eta menu/i })).not.toBeInTheDocument();
  });

  it('shows grouped ordering board with comment variants and total', () => {
    renderView();

    expect(screen.getByText(/orders \(3 orders, 3 users\)/i)).toBeInTheDocument();
    expect(screen.getByText('2x 12 Margherita')).toBeInTheDocument();
    expect(screen.getByText('1x 21 Pepperoni')).toBeInTheDocument();
    expect(screen.getByLabelText(/processed margherita for alice/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/processed margherita for cara/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/processed pepperoni for bob/i)).toBeInTheDocument();
    expect(screen.getAllByText('hot')).toHaveLength(2);
    expect(screen.getByText('No comment')).toBeInTheDocument();
    expect(screen.getByText(/total:/i)).toHaveTextContent('€30.00');
  });

  it('shows fallback-order candidates during ordering', async () => {
    renderView();

    expect(await screen.findByText(/missing voters with fallback meals \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText('Dana')).toBeInTheDocument();
    expect(screen.getAllByText(/21 Pepperoni/i).length).toBeGreaterThanOrEqual(1);
    expect(mockFetchFallbackOrderCandidates).toHaveBeenCalledWith('fs-1');
  });

  it('places a fallback order for an eligible missing voter', async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(await screen.findByRole('button', { name: /place default meal/i }));

    expect(mockPlaceFallbackOrder).toHaveBeenCalledWith('fs-1', {
      nickname: 'Dana',
      actingNickname: 'Alice',
    });
    expect(await screen.findByText(/placed default meal for dana: 21 pepperoni/i)).toBeInTheDocument();
  });

  it('pings a fallback candidate and labels the row as a default meal', async () => {
    const user = userEvent.setup();
    renderView();

    expect(await screen.findByText(/default meal configured/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /ping user/i }));

    expect(mockPingFallbackCandidate).toHaveBeenCalledWith('fs-1', {
      nickname: 'Dana',
      actingNickname: 'Alice',
    });
    expect(
      await screen.findByText(/pinged dana\. browser notification and email were triggered best-effort\./i),
    ).toBeInTheDocument();
  });

  it('copies grouped order list with item numbers', async () => {
    const user = userEvent.setup();
    const writeTextMock = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    renderView();

    await user.click(screen.getByRole('button', { name: /copy order list/i }));

    expect(writeTextMock).toHaveBeenCalledTimes(1);
    expect(writeTextMock.mock.calls[0]?.[0]).toContain('Team Lunch order - Pizza Place');
    expect(writeTextMock.mock.calls[0]?.[0]).toContain('Planned ETA: 30 minutes');
    expect(writeTextMock.mock.calls[0]?.[0]).toContain('- Alice · 12 Margherita (€9.50) (hot)');
    expect(writeTextMock.mock.calls[0]?.[0]).toContain('- Cara · 12 Margherita (€9.50) (hot)');
    expect(writeTextMock.mock.calls[0]?.[0]).toContain('- Bob · 21 Pepperoni (€11.00)');
    expect(writeTextMock.mock.calls[0]?.[0]).toContain('Total: €30.00');
    expect(screen.getByText(/copied to clipboard\./i)).toBeInTheDocument();
  });

  it('returns null when active selection is not ordering', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      activeFoodSelection: makeFoodSelection({ status: 'delivering' }),
    });
    const { container } = renderView();
    expect(container.innerHTML).toBe('');
  });

  it('toggles processed checkmark for an order line', async () => {
    const user = userEvent.setup();
    mockSetOrderProcessed.mockResolvedValue({});
    renderView();

    const checkbox = screen.getByLabelText(/processed margherita for alice/i);
    await user.click(checkbox);

    expect(mockSetOrderProcessed).toHaveBeenCalledWith('fs-1', 'o-1', true, 'Alice');
  });
});
