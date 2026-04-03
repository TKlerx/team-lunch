import type { Menu } from '../../lib/types.js';

type SummaryOrder = {
  nickname: string;
  itemId: string | null;
  itemName: string;
  itemNumber?: string | null;
  notes: string | null;
};

interface BuildOrderSummaryInput {
  menuName: string;
  etaMinutes: number | null;
  etaLabel?: 'Current ETA' | 'Final ETA' | 'Planned ETA';
  completedLabel?: string;
  orders: SummaryOrder[];
  priceByItemId?: Map<string, number>;
  priceByItemName?: Map<string, number>;
  itemNumberByItemId?: Map<string, string>;
  itemNumberByItemName?: Map<string, string>;
  includeTotal?: boolean;
}

interface OrderLookupMaps {
  priceByItemId: Map<string, number>;
  priceByItemName: Map<string, number>;
  itemNumberByItemId: Map<string, string>;
  itemNumberByItemName: Map<string, string>;
}

export function formatPrice(value: number): string {
  return `€${value.toFixed(2)}`;
}

export function resolveOrderPrice(
  order: SummaryOrder,
  priceByItemId?: Map<string, number>,
  priceByItemName?: Map<string, number>,
): number | null {
  if (order.itemId && priceByItemId?.has(order.itemId)) {
    return priceByItemId.get(order.itemId) ?? null;
  }

  const normalizedName = order.itemName.trim().toLocaleLowerCase();
  if (!normalizedName) return null;
  return priceByItemName?.get(normalizedName) ?? null;
}

export function resolveOrderItemNumber(
  order: SummaryOrder,
  itemNumberByItemId?: Map<string, string>,
  itemNumberByItemName?: Map<string, string>,
): string | null {
  if (order.itemNumber) {
    return order.itemNumber;
  }

  if (order.itemId && itemNumberByItemId?.has(order.itemId)) {
    return itemNumberByItemId.get(order.itemId) ?? null;
  }

  const normalizedName = order.itemName.trim().toLocaleLowerCase();
  if (!normalizedName) return null;
  return itemNumberByItemName?.get(normalizedName) ?? null;
}

export function buildOrderLookupMaps(menu?: Menu | null): OrderLookupMaps {
  const items = menu?.items ?? [];

  return {
    priceByItemId: new Map(
      items
        .filter((item) => item.price !== null)
        .map((item) => [item.id, item.price as number]),
    ),
    priceByItemName: new Map(
      items
        .filter((item) => item.price !== null)
        .map((item) => [item.name.trim().toLocaleLowerCase(), item.price as number]),
    ),
    itemNumberByItemId: new Map(
      items
        .filter((item) => item.itemNumber)
        .map((item) => [item.id, item.itemNumber as string]),
    ),
    itemNumberByItemName: new Map(
      items
        .filter((item) => item.itemNumber)
        .map((item) => [item.name.trim().toLocaleLowerCase(), item.itemNumber as string]),
    ),
  };
}

export function buildOrderSummary({
  menuName,
  etaMinutes,
  etaLabel = 'Current ETA',
  completedLabel,
  orders,
  priceByItemId,
  priceByItemName,
  itemNumberByItemId,
  itemNumberByItemName,
  includeTotal = false,
}: BuildOrderSummaryInput): string {
  const lines: string[] = [];
  lines.push(`Team Lunch order - ${menuName}`);

  if (completedLabel) {
    lines.push(`Completed: ${completedLabel}`);
  }

  if (etaMinutes) {
    lines.push(`${etaLabel}: ${etaMinutes} minutes`);
  }

  lines.push('');
  lines.push('Orders:');

  if (orders.length === 0) {
    lines.push('- No orders were placed');
  } else {
    for (const order of orders) {
      const notes = order.notes ? ` (${order.notes})` : '';
      const resolvedPrice = resolveOrderPrice(order, priceByItemId, priceByItemName);
      const resolvedItemNumber = resolveOrderItemNumber(
        order,
        itemNumberByItemId,
        itemNumberByItemName,
      );
      const displayName = resolvedItemNumber ? `${resolvedItemNumber} ${order.itemName}` : order.itemName;
      const priceText = resolvedPrice !== null ? ` (${formatPrice(resolvedPrice)})` : '';
      lines.push(`- ${order.nickname} · ${displayName}${priceText}${notes}`);
    }
  }

  if (includeTotal) {
    const totalPrice = orders.reduce((sum, order) => {
      const resolvedPrice = resolveOrderPrice(order, priceByItemId, priceByItemName);
      return sum + (resolvedPrice ?? 0);
    }, 0);
    lines.push('');
    lines.push(`Total: ${formatPrice(totalPrice)}`);
  }

  return lines.join('\n');
}

export async function copyOrderSummary(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error('Clipboard API unavailable');
  }
  await navigator.clipboard.writeText(text);
}
