import type { FoodSelection, Poll } from '../../lib/types.js';

export interface PendingRatingSelection {
  selectionId: string;
  menuName: string;
  completedAt: string | null;
  unratedCount: number;
}

export interface CountedMenu {
  menuName: string;
  count: number;
}

export interface CountedItem {
  itemName: string;
  count: number;
  sourceMenuName: string;
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function getSelectionsWaitingForRating(
  history: FoodSelection[],
  nickname: string | null,
): PendingRatingSelection[] {
  if (!nickname) return [];

  return history
    .map((selection) => ({
      selectionId: selection.id,
      menuName: selection.menuName,
      completedAt: selection.completedAt,
      unratedCount: selection.orders.filter(
        (order) => order.nickname === nickname && (order.rating ?? null) === null,
      ).length,
    }))
    .filter((selection) => selection.unratedCount > 0);
}

export function getMostPopularMenus(history: FoodSelection[]): CountedMenu[] {
  const counts = new Map<string, number>();

  for (const selection of history) {
    counts.set(selection.menuName, (counts.get(selection.menuName) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([menuName, count]) => ({ menuName, count }))
    .sort((left, right) => right.count - left.count || left.menuName.localeCompare(right.menuName));
}

export function getMostPopularMeals(history: FoodSelection[]): CountedItem[] {
  const grouped = new Map<
    string,
    { itemName: string; count: number; menuCounts: Map<string, number> }
  >();

  for (const selection of history) {
    for (const order of selection.orders) {
      const normalized = normalizeName(order.itemName);
      if (!normalized) continue;

      const existing = grouped.get(normalized) ?? {
        itemName: order.itemName,
        count: 0,
        menuCounts: new Map<string, number>(),
      };

      existing.count += 1;
      existing.menuCounts.set(
        selection.menuName,
        (existing.menuCounts.get(selection.menuName) ?? 0) + 1,
      );
      grouped.set(normalized, existing);
    }
  }

  return [...grouped.values()]
    .map((entry) => ({
      itemName: entry.itemName,
      count: entry.count,
      sourceMenuName:
        [...entry.menuCounts.entries()].sort(
          (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
        )[0]?.[0] ?? 'Unknown menu',
    }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return left.itemName.localeCompare(right.itemName);
    });
}

export function getRecentlyUsedMenus(history: FoodSelection[]): string[] {
  const seen = new Set<string>();
  const recent: string[] = [];

  for (const selection of history) {
    if (seen.has(selection.menuName)) continue;
    seen.add(selection.menuName);
    recent.push(selection.menuName);
  }

  return recent;
}

export function getAverageMealRating(history: FoodSelection[]): number | null {
  const ratings = history.flatMap((selection) =>
    selection.orders
      .map((order) => order.rating ?? null)
      .filter((rating): rating is number => rating !== null),
  );

  if (ratings.length === 0) return null;

  const total = ratings.reduce((sum, rating) => sum + rating, 0);
  return total / ratings.length;
}

export function getMostOrderedItemAcrossMenus(history: FoodSelection[]): CountedItem | null {
  return getMostPopularMeals(history)[0] ?? null;
}

export interface MyPreviousOrder {
  selectionId: string;
  menuName: string;
  completedAt: string | null;
  itemName: string;
  notes: string | null;
  rating: number | null;
  feedbackComment: string | null;
  orderedAt: string;
}

export function getMyPreviousOrders(
  history: FoodSelection[],
  nickname: string | null,
): MyPreviousOrder[] {
  if (!nickname) return [];

  const orders: MyPreviousOrder[] = [];
  for (const selection of history) {
    for (const order of selection.orders) {
      if (order.nickname !== nickname) continue;
      orders.push({
        selectionId: selection.id,
        menuName: selection.menuName,
        completedAt: selection.completedAt,
        itemName: order.itemName,
        notes: order.notes,
        rating: order.rating ?? null,
        feedbackComment: order.feedbackComment ?? null,
        orderedAt: order.orderedAt,
      });
    }
  }

  return orders;
}

export function getLastWinnerLabel(
  latestCompletedPoll: Poll | null,
  latestCompletedFoodSelection: FoodSelection | null,
): string | null {
  if (latestCompletedPoll?.winnerMenuName) {
    return latestCompletedPoll.winnerMenuName;
  }

  return latestCompletedFoodSelection?.menuName ?? null;
}
