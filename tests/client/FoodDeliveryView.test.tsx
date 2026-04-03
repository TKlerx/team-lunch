import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { makeFoodOrder, makeFoodSelection } from './helpers.js';
import type { AppState } from '../../src/client/context/AppContext.js';
import { initialAppState } from '../../src/client/context/AppContext.js';

const mockUseAppState = vi.fn<() => AppState>();
const mockDispatch = vi.fn();
const mockUseAppDispatch = vi.fn(() => mockDispatch);

const mockUpdateEta = vi.fn();
const mockConfirmArrival = vi.fn();
const mockAbortFoodSelection = vi.fn();
const mockSetOrderDelivered = vi.fn();

vi.mock('../../src/client/api.js', () => ({
  updateFoodSelectionEta: (...args: unknown[]) => mockUpdateEta(...args),
  confirmFoodArrival: (...args: unknown[]) => mockConfirmArrival(...args),
  abortFoodSelection: (...args: unknown[]) => mockAbortFoodSelection(...args),
  setOrderDelivered: (...args: unknown[]) => mockSetOrderDelivered(...args),
}));

vi.mock('../../src/client/context/AppContext.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/client/context/AppContext.js')>();
  return {
    ...mod,
    useAppState: (...args: unknown[]) => mockUseAppState(...(args as [])),
    useAppDispatch: (...args: unknown[]) => mockUseAppDispatch(...(args as [])),
  };
});

import FoodDeliveryView from '../../src/client/components/FoodDeliveryView.js';

function renderView() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <FoodDeliveryView />
    </MemoryRouter>,
  );
}

describe('FoodDeliveryView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (!navigator.clipboard) {
      Object.defineProperty(window.navigator, 'clipboard', {
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
        configurable: true,
      });
    }
    mockUpdateEta.mockResolvedValue({
      id: 'fs-1',
      etaMinutes: 20,
      etaSetAt: '2026-01-01T13:00:00Z',
      deliveryDueAt: '2026-01-01T13:20:00Z',
    });
    mockConfirmArrival.mockResolvedValue({ id: 'fs-1' });

    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      activeFoodSelection: makeFoodSelection({
        id: 'fs-1',
        status: 'delivering',
        etaMinutes: 15,
        etaSetAt: '2026-01-01T13:00:00Z',
        deliveryDueAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      }),
    });
  });

  it('shows awaiting delivery heading while timer is running', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      activeFoodSelection: makeFoodSelection({
        id: 'fs-1',
        status: 'delivering',
        etaMinutes: 20,
        etaSetAt: '2026-01-01T13:00:00Z',
        deliveryDueAt: new Date(Date.now() + 20 * 60_000).toISOString(),
        orderPlacedBy: 'admin@example.com',
      }),
    });

    renderView();
    expect(screen.getByText(/awaiting lunch delivery/i)).toBeInTheDocument();
    expect(screen.getByText(/order placed by: admin@example.com/i)).toBeInTheDocument();
    expect(screen.getByText(/delivery is on time\./i)).toBeInTheDocument();
  });

  it('shows current order list during delivery', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus: [
        {
          id: 'menu-1',
          name: 'Pizza Place',
          location: null,
          phone: null,
          url: null,
          sourceDateCreated: null,
          createdAt: '2026-01-01T00:00:00Z',
          itemCount: 2,
          items: [
            { id: 'i-1', menuId: 'menu-1', itemNumber: '12', name: 'Margherita', description: null, price: 9.5, createdAt: '2026-01-01T00:00:00Z' },
            { id: 'i-2', menuId: 'menu-1', name: 'Pepperoni', description: null, price: 11, createdAt: '2026-01-01T00:00:00Z' },
          ],
        },
      ],
      activeFoodSelection: makeFoodSelection({
        id: 'fs-1',
        status: 'delivering',
        orders: [
          makeFoodOrder({ id: 'o-1', selectionId: 'fs-1', nickname: 'Alice', itemId: 'i-1', itemName: 'Margherita', notes: 'extra cheese' }),
          makeFoodOrder({ id: 'o-2', selectionId: 'fs-1', nickname: 'Bob', itemId: 'i-2', itemName: 'Pepperoni', notes: null }),
        ],
      }),
    });

    renderView();
    expect(screen.getByText(/current orders \(2 orders, 2 users\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Alice\s*\(1\)/)).toBeInTheDocument();
    expect(screen.getByText('12 Margherita')).toBeInTheDocument();
    expect(screen.getByText('(extra cheese)')).toBeInTheDocument();
    expect(screen.getByText(/Bob\s*\(1\)/)).toBeInTheDocument();
    expect(screen.getByText('Pepperoni')).toBeInTheDocument();
    expect(screen.getByText('Total: €20.50')).toBeInTheDocument();
  });

  it('shows restaurant contact info in phase 3 when available', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus: [
        {
          id: 'menu-1',
          name: 'Pizza Place',
          location: 'Frankfurter Weg 11, Paderborn',
          phone: '+49 5251 6862323',
          url: 'https://pizza-pronto.example',
          sourceDateCreated: null,
          createdAt: '2026-01-01T00:00:00Z',
          itemCount: 0,
          items: [],
        },
      ],
      activeFoodSelection: makeFoodSelection({
        id: 'fs-1',
        status: 'delivering',
        menuId: 'menu-1',
        menuName: 'Pizza Place',
      }),
    });

    renderView();
    expect(screen.getByText(/restaurant contact/i)).toBeInTheDocument();
    expect(screen.getByText(/frankfurter weg 11, paderborn/i)).toBeInTheDocument();
    expect(screen.getByText(/\+49 5251 6862323/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /https:\/\/pizza-pronto\.example/i })).toBeInTheDocument();
  });

  it('copies current order list during delivery', async () => {
    const user = userEvent.setup();
    const writeTextMock = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus: [
        {
          id: 'menu-1',
          name: 'Pizza Place',
          location: null,
          phone: null,
          url: null,
          sourceDateCreated: null,
          createdAt: '2026-01-01T00:00:00Z',
          itemCount: 1,
          items: [
            { id: 'i-1', menuId: 'menu-1', name: 'Margherita', description: null, price: 9.5, createdAt: '2026-01-01T00:00:00Z' },
          ],
        },
      ],
      activeFoodSelection: makeFoodSelection({
        id: 'fs-1',
        status: 'delivering',
        menuName: 'Pizza Place',
        etaMinutes: 25,
        orders: [
          makeFoodOrder({ id: 'o-1', selectionId: 'fs-1', nickname: 'Alice', itemId: 'i-1', itemName: 'Margherita', notes: null }),
        ],
      }),
    });

    renderView();
    await user.click(screen.getByRole('button', { name: /copy order list/i }));

    expect(writeTextMock).toHaveBeenCalledTimes(1);
    expect(writeTextMock.mock.calls[0]?.[0]).toContain('Team Lunch order - Pizza Place');
    expect(writeTextMock.mock.calls[0]?.[0]).toContain('Current ETA: 25 minutes');
    expect(writeTextMock.mock.calls[0]?.[0]).toContain('- Alice · Margherita (€9.50)');
    expect(writeTextMock.mock.calls[0]?.[0]).toContain('Total: €9.50');
    expect(screen.getByText(/copied to clipboard\./i)).toBeInTheDocument();
  });

  it('updates ETA from timer dropdown preset', async () => {
    const user = userEvent.setup();
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      activeFoodSelection: makeFoodSelection({
        id: 'fs-1',
        status: 'delivering',
        etaMinutes: null,
        etaSetAt: null,
        deliveryDueAt: null,
      }),
    });

    renderView();

    await user.click(screen.getByRole('button', { name: /delivery timer actions/i }));
    await user.click(screen.getByRole('button', { name: /^20 min$/i }));

    expect(mockUpdateEta).toHaveBeenCalledWith('fs-1', 20);
  });

  it('updates ETA from manual minutes input in timer dropdown', async () => {
    const user = userEvent.setup();

    renderView();

    await user.click(screen.getByRole('button', { name: /delivery timer actions/i }));
    const manualInput = screen.getByLabelText(/manual minutes remaining/i);
    await user.type(manualInput, '37{enter}');

    expect(mockUpdateEta).toHaveBeenCalledWith('fs-1', 37);
  });

  it('confirms arrival manually', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderView();

    await user.click(screen.getByRole('button', { name: /delivery timer actions/i }));
    await user.click(screen.getByRole('button', { name: /confirm lunch arrived/i }));

    expect(mockConfirmArrival).toHaveBeenCalledWith('fs-1');
    confirmSpy.mockRestore();
  });

  it('shows due message when delivery is due', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus: [],
      activeFoodSelection: makeFoodSelection({
        id: 'fs-1',
        status: 'delivery_due',
        etaMinutes: 10,
        etaSetAt: '2026-01-01T13:00:00Z',
        deliveryDueAt: new Date(Date.now() - 1_000).toISOString(),
      }),
    });

    renderView();
    expect(screen.getByText(/lunch should have arrived/i)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /ringing clock/i })).toBeInTheDocument();
    expect(screen.getByText(/delivery is late by/i)).toBeInTheDocument();
    expect(
      screen.getByText(/the announced arrival time has passed\. update the eta or confirm arrival/i),
    ).toBeInTheDocument();
  });

  it('aborts process from timer dropdown action', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockAbortFoodSelection.mockResolvedValue({});
    renderView();

    await user.click(screen.getByRole('button', { name: /delivery timer actions/i }));
    await user.click(screen.getByRole('button', { name: /abort process/i }));

    expect(mockAbortFoodSelection).toHaveBeenCalledWith('fs-1');
    confirmSpy.mockRestore();
  });

  it('toggles delivered checkmark for an order line', async () => {
    const user = userEvent.setup();
    mockSetOrderDelivered.mockResolvedValue({});
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      activeFoodSelection: makeFoodSelection({
        id: 'fs-1',
        status: 'delivering',
        orders: [
          makeFoodOrder({ id: 'o-1', selectionId: 'fs-1', nickname: 'Alice', itemName: 'Margherita' }),
        ],
      }),
    });

    renderView();
    await user.click(screen.getByLabelText(/delivered margherita for alice/i));

    expect(mockSetOrderDelivered).toHaveBeenCalledWith('fs-1', 'o-1', true, undefined);
  });
});
