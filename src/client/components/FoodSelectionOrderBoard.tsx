import { useMemo } from 'react';
import type { FoodSelection, Menu } from '../../lib/types.js';
import { formatPrice } from '../utils/orderCopy.js';

type OrderBoardMode = 'by-user' | 'by-item';

interface FoodSelectionOrderBoardProps {
  selection: FoodSelection;
  menus: Menu[];
  mode?: OrderBoardMode;
  showProcessedCheckboxes?: boolean;
  processingOrderIds?: Set<string>;
  onToggleProcessed?: (orderId: string, processed: boolean) => void;
}

export default function FoodSelectionOrderBoard({
  selection,
  menus,
  mode = 'by-user',
  showProcessedCheckboxes = false,
  processingOrderIds = new Set<string>(),
  onToggleProcessed,
}: FoodSelectionOrderBoardProps) {
  const winningMenu = menus.find((menu) => menu.id === selection.menuId);
  const priceByItemId = useMemo(
    () => new Map((winningMenu?.items ?? []).filter((item) => item.price !== null).map((item) => [item.id, item.price as number])),
    [winningMenu?.items],
  );
  const totalPrice = useMemo(
    () =>
      selection.orders.reduce((sum, order) => {
        if (!order.itemId) return sum;
        return sum + (priceByItemId.get(order.itemId) ?? 0);
      }, 0),
    [selection.orders, priceByItemId],
  );
  const itemNumberById = useMemo(
    () =>
      new Map(
        (winningMenu?.items ?? [])
          .filter((item) => item.itemNumber)
          .map((item) => [item.id, item.itemNumber as string]),
      ),
    [winningMenu?.items],
  );
  const ordersByUser = useMemo(() => {
    const grouped = new Map<string, typeof selection.orders>();
    for (const order of selection.orders) {
      const existing = grouped.get(order.nickname) ?? [];
      grouped.set(order.nickname, [...existing, order]);
    }
    return [...grouped.entries()].sort((left, right) => left[0].localeCompare(right[0]));
  }, [selection.orders]);
  const ordersByItem = useMemo(() => {
    const grouped = new Map<
      string,
      {
        itemId: string | null;
        itemName: string;
        itemNumber: string | null;
        orderCount: number;
        totalPrice: number;
        orders: typeof selection.orders;
        comments: Array<{ text: string | null; nicknames: string[]; count: number }>;
      }
    >();

    for (const order of selection.orders) {
      const key = order.itemId ?? order.itemName.trim().toLocaleLowerCase();
      const existing = grouped.get(key);
      const resolvedItemNumber = order.itemId ? (itemNumberById.get(order.itemId) ?? null) : null;
      const orderPrice = order.itemId ? (priceByItemId.get(order.itemId) ?? 0) : 0;

      if (!existing) {
        grouped.set(key, {
          itemId: order.itemId,
          itemName: order.itemName,
          itemNumber: resolvedItemNumber,
          orderCount: 1,
          totalPrice: orderPrice,
          orders: [order],
          comments: [
            {
              text: order.notes,
              nicknames: [order.nickname],
              count: 1,
            },
          ],
        });
        continue;
      }

      existing.orderCount += 1;
      existing.totalPrice += orderPrice;
      existing.orders.push(order);
      const commentGroup = existing.comments.find((entry) => entry.text === order.notes);
      if (commentGroup) {
        commentGroup.count += 1;
        commentGroup.nicknames.push(order.nickname);
      } else {
        existing.comments.push({
          text: order.notes,
          nicknames: [order.nickname],
          count: 1,
        });
      }
    }

    return [...grouped.values()].sort((left, right) => {
      const byNumber = (left.itemNumber ?? '').localeCompare(right.itemNumber ?? '', undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      if (byNumber !== 0) return byNumber;
      return left.itemName.localeCompare(right.itemName);
    });
  }, [itemNumberById, priceByItemId, selection.orders]);
  const uniqueUserCount = ordersByUser.length;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm xl:col-span-1">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">
        Orders ({selection.orders.length} orders, {uniqueUserCount} users)
      </h3>
      {selection.orders.length === 0 ? (
        <p className="text-sm italic text-gray-400">No orders placed</p>
      ) : mode === 'by-item' ? (
        <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
          {ordersByItem.map((itemGroup) => (
            <div
              key={`${itemGroup.itemId ?? itemGroup.itemName}`}
              className="rounded border border-sky-200 bg-sky-50 p-2"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-sky-800">
                    {itemGroup.orderCount}x{' '}
                    {itemGroup.itemNumber ? `${itemGroup.itemNumber} ` : ''}
                    {itemGroup.itemName}
                  </div>
                  <div className="text-xs text-sky-700">
                    {itemGroup.comments.length === 1 && itemGroup.comments[0]?.text === null
                      ? 'No comments'
                      : `${itemGroup.comments.length} comment variant${itemGroup.comments.length === 1 ? '' : 's'}`}
                  </div>
                </div>
                <div className="text-right text-xs font-semibold text-emerald-700">
                  {formatPrice(itemGroup.totalPrice)}
                </div>
              </div>
              <div className="mt-2 space-y-1">
                {showProcessedCheckboxes
                  ? itemGroup.orders.map((order) => (
                      <div
                        key={order.id}
                        className="flex items-baseline justify-between gap-3 rounded bg-white px-2 py-1.5"
                      >
                        <div className="flex min-w-0 items-baseline gap-2 text-xs text-gray-600">
                          <input
                            type="checkbox"
                            aria-label={`Processed ${order.itemName} for ${order.nickname}`}
                            checked={Boolean(order.processed)}
                            disabled={!onToggleProcessed || processingOrderIds.has(order.id)}
                            onChange={(event) =>
                              onToggleProcessed?.(order.id, event.currentTarget.checked)
                            }
                          />
                          <span className="font-semibold text-gray-700">{order.nickname}</span>
                          <span>{order.notes ? order.notes : 'No comment'}</span>
                        </div>
                        <span className="w-16 text-right whitespace-nowrap text-xs font-semibold text-emerald-700">
                          {order.itemId && priceByItemId.has(order.itemId)
                            ? formatPrice(priceByItemId.get(order.itemId) as number)
                            : '-'}
                        </span>
                      </div>
                    ))
                  : itemGroup.comments.map((commentGroup) => (
                      <div
                        key={`${commentGroup.text ?? '__none__'}-${commentGroup.nicknames.join('|')}`}
                        className="rounded bg-white px-2 py-1.5 text-xs text-gray-600"
                      >
                        <span className="font-semibold text-gray-700">{commentGroup.count}x</span>{' '}
                        {commentGroup.text ? commentGroup.text : 'No comment'}
                        <span className="text-gray-400">
                          {' '}
                          · {commentGroup.nicknames.join(', ')}
                        </span>
                      </div>
                    ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="max-h-[65vh] space-y-1 overflow-y-auto pr-1">
          {ordersByUser.map(([userName, userOrders]) => (
            <div key={userName} className="rounded border border-gray-200 bg-gray-50 p-2">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
                {userName} ({userOrders.length})
              </div>
              <div className="space-y-1">
                {userOrders.map((order) => (
                  <div key={order.id} className="flex items-baseline justify-between gap-3 rounded bg-white px-2 py-1.5">
                    <div className="flex min-w-0 items-baseline gap-2">
                      {showProcessedCheckboxes && (
                        <input
                          type="checkbox"
                          aria-label={`Processed ${order.itemName} for ${order.nickname}`}
                          checked={Boolean(order.processed)}
                          disabled={!onToggleProcessed || processingOrderIds.has(order.id)}
                          onChange={(event) => onToggleProcessed?.(order.id, event.currentTarget.checked)}
                        />
                      )}
                      <span className="truncate text-sm text-gray-700">{order.itemName}</span>
                      {order.notes && <span className="truncate text-xs text-gray-400">({order.notes})</span>}
                    </div>
                    <span className="w-20 text-right whitespace-nowrap text-xs font-semibold text-emerald-700">
                      {order.itemId && priceByItemId.has(order.itemId)
                        ? formatPrice(priceByItemId.get(order.itemId) as number)
                        : '-'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 flex justify-end border-t border-gray-200 pt-2">
        <span className="text-sm font-semibold text-gray-800">Total: {formatPrice(totalPrice)}</span>
      </div>
    </div>
  );
}
