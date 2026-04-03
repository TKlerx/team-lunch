/**
 * Shared test helpers for client component tests.
 * Provides data factories and a MemoryRouter wrapper.
 */
import React, { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { Poll, FoodSelection, FoodOrder, Menu, MenuItem } from '../../src/lib/types.js';

/**
 * Simple wrapper that provides MemoryRouter for components using react-router.
 */
export function RouterWrapper({ children, route = '/' }: { children: ReactNode; route?: string }) {
  return (
    <MemoryRouter
      initialEntries={[route]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      {children}
    </MemoryRouter>
  );
}

// ─── Test data factories ────────────────────────────────────

export function makeMenuItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 'item-1',
    menuId: 'menu-1',
    itemNumber: null,
    name: 'Margherita',
    description: null,
    price: null,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

export function makeMenu(overrides: Partial<Menu> = {}): Menu {
  return {
    id: 'menu-1',
    name: 'Pizza Place',
    location: null,
    phone: null,
    url: null,
    sourceDateCreated: null,
    createdAt: '2026-01-01T00:00:00Z',
    items: [makeMenuItem()],
    itemCount: 1,
    ...overrides,
  };
}

export function makePoll(overrides: Partial<Poll> = {}): Poll {
  return {
    id: 'poll-1',
    description: 'Where to eat?',
    status: 'active',
    startedAt: '2026-01-01T12:00:00Z',
    endsAt: new Date(Date.now() + 3600_000).toISOString(), // 1h from now
    endedPrematurely: false,
    winnerMenuId: null,
    winnerMenuName: null,
    winnerSelectedRandomly: false,
    createdAt: '2026-01-01T12:00:00Z',
    excludedMenuJustifications: [],
    votes: [],
    voteCounts: {},
    ...overrides,
  };
}

export function makeFoodOrder(overrides: Partial<FoodOrder> = {}): FoodOrder {
  return {
    id: 'order-1',
    selectionId: 'fs-1',
    nickname: 'Alice',
    itemId: 'item-1',
    itemName: 'Margherita',
    notes: null,
    feedbackComment: null,
    rating: null,
    ratedAt: null,
    orderedAt: '2026-01-01T13:05:00Z',
    ...overrides,
  };
}

export function makeFoodSelection(overrides: Partial<FoodSelection> = {}): FoodSelection {
  return {
    id: 'fs-1',
    pollId: 'poll-1',
    menuId: 'menu-1',
    menuName: 'Pizza Place',
    status: 'active',
    startedAt: '2026-01-01T13:00:00Z',
    endsAt: new Date(Date.now() + 900_000).toISOString(), // 15 min from now
    orderPlacedAt: null,
    orderPlacedBy: null,
    completedAt: null,
    etaMinutes: null,
    etaSetAt: null,
    deliveryDueAt: null,
    createdAt: '2026-01-01T13:00:00Z',
    orders: [],
    ...overrides,
  };
}
