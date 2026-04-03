import { describe, expect, it } from 'vitest';
import { makeFoodOrder, makeFoodSelection, makePoll } from './helpers.js';
import {
  getAverageMealRating,
  getLastWinnerLabel,
  getMostOrderedItemAcrossMenus,
  getMostPopularMeals,
  getMostPopularMenus,
  getRecentlyUsedMenus,
  getSelectionsWaitingForRating,
} from '../../src/client/utils/dashboard.js';

describe('dashboard utils', () => {
  const history = [
    makeFoodSelection({
      id: 'fs-3',
      menuName: 'Burger House',
      completedAt: '2026-03-09T12:30:00Z',
      orders: [
        makeFoodOrder({ id: 'o-1', nickname: 'Alice', itemName: 'Cheeseburger', rating: null }),
        makeFoodOrder({ id: 'o-2', nickname: 'Bob', itemName: 'Fries', rating: 4 }),
      ],
    }),
    makeFoodSelection({
      id: 'fs-2',
      menuName: 'Pizza Place',
      completedAt: '2026-03-08T12:30:00Z',
      orders: [
        makeFoodOrder({ id: 'o-3', nickname: 'Alice', itemName: 'Margherita', rating: 5 }),
        makeFoodOrder({ id: 'o-4', nickname: 'Cara', itemName: 'Cheeseburger', rating: 3 }),
      ],
    }),
    makeFoodSelection({
      id: 'fs-1',
      menuName: 'Burger House',
      completedAt: '2026-03-07T12:30:00Z',
      orders: [
        makeFoodOrder({ id: 'o-5', nickname: 'Alice', itemName: 'Cheeseburger', rating: null }),
      ],
    }),
  ];

  it('finds selections waiting for the current user rating', () => {
    expect(getSelectionsWaitingForRating(history, 'Alice')).toEqual([
      {
        selectionId: 'fs-3',
        menuName: 'Burger House',
        completedAt: '2026-03-09T12:30:00Z',
        unratedCount: 1,
      },
      {
        selectionId: 'fs-1',
        menuName: 'Burger House',
        completedAt: '2026-03-07T12:30:00Z',
        unratedCount: 1,
      },
    ]);
  });

  it('computes menu popularity and recent menu order from history', () => {
    expect(getMostPopularMenus(history)).toEqual([
      { menuName: 'Burger House', count: 2 },
      { menuName: 'Pizza Place', count: 1 },
    ]);
    expect(getRecentlyUsedMenus(history)).toEqual(['Burger House', 'Pizza Place']);
  });

  it('computes meal popularity, average rating, and most ordered item across menus', () => {
    expect(getMostPopularMeals(history)).toEqual([
      { itemName: 'Cheeseburger', count: 3, sourceMenuName: 'Burger House' },
      { itemName: 'Fries', count: 1, sourceMenuName: 'Burger House' },
      { itemName: 'Margherita', count: 1, sourceMenuName: 'Pizza Place' },
    ]);
    expect(getAverageMealRating(history)).toBeCloseTo(4);
    expect(getMostOrderedItemAcrossMenus(history)).toEqual({
      itemName: 'Cheeseburger',
      count: 3,
      sourceMenuName: 'Burger House',
    });
  });

  it('uses latest poll winner first for the last-winner label', () => {
    expect(
      getLastWinnerLabel(
        makePoll({ status: 'finished', winnerMenuName: 'Pizza Place' }),
        makeFoodSelection({ menuName: 'Burger House', status: 'completed' }),
      ),
    ).toBe('Pizza Place');
  });
});
