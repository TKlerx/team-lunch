import { useState } from 'react';
import {
  abortFoodSelection,
  confirmFoodArrival,
  setOrderDelivered,
  updateFoodSelectionEta,
} from '../api.js';
import { useAppDispatch, useAppState } from '../context/AppContext.js';
import { useCountdown, useElapsedSince, formatTime } from '../hooks/useCountdown.js';
import { useNickname } from '../hooks/useNickname.js';
import TimerActionHeader from './TimerActionHeader.js';
import {
  buildOrderLookupMaps,
  buildOrderSummary,
  copyOrderSummary,
  formatPrice,
  resolveOrderItemNumber,
  resolveOrderPrice,
} from '../utils/orderCopy.js';
import { isAdminAuthenticatedUser } from '../auth.js';
import OrderCopyStatus from './OrderCopyStatus.js';

function formatLateDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }
  return `${seconds}s`;
}

export default function FoodDeliveryView() {
  const dispatch = useAppDispatch();
  const { activeFoodSelection, menus } = useAppState();
  const [manualEtaMinutes, setManualEtaMinutes] = useState('');
  const [isSavingEta, setIsSavingEta] = useState(false);
  const [isConfirmingArrival, setIsConfirmingArrival] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [updatingDeliveredIds, setUpdatingDeliveredIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const canManageFoodSelection = isAdminAuthenticatedUser();
  const { nickname } = useNickname();

  if (
    !activeFoodSelection ||
    (activeFoodSelection.status !== 'delivering' && activeFoodSelection.status !== 'delivery_due')
  ) {
    return null;
  }

  const selection = activeFoodSelection;
  const selectionMenu = (menus ?? []).find((menu) => menu.id === selection.menuId);
  const { priceByItemId, priceByItemName, itemNumberByItemId, itemNumberByItemName } =
    buildOrderLookupMaps(selectionMenu);
  const totalPrice = selection.orders.reduce((sum, order) => {
    const resolvedPrice = resolveOrderPrice(order, priceByItemId, priceByItemName);
    return sum + (resolvedPrice ?? 0);
  }, 0);
  const ordersByUser = (() => {
    const grouped = new Map<string, typeof selection.orders>();
    for (const order of selection.orders) {
      const existing = grouped.get(order.nickname) ?? [];
      grouped.set(order.nickname, [...existing, order]);
    }
    return [...grouped.entries()].sort((left, right) => left[0].localeCompare(right[0]));
  })();
  const uniqueUserCount = ordersByUser.length;

  const remaining = useCountdown(selection.deliveryDueAt);
  const isDue = selection.status === 'delivery_due' || remaining === 0;
  const lateSeconds = useElapsedSince(isDue ? selection.deliveryDueAt : null);
  const etaOptions = Array.from({ length: 24 }, (_, index) => (index + 1) * 5);
  const totalSeconds = Math.max(
    1,
    Math.ceil(
      ((selection.deliveryDueAt ? new Date(selection.deliveryDueAt).getTime() : Date.now()) -
        (selection.etaSetAt ? new Date(selection.etaSetAt).getTime() : Date.now())) / 1000,
    ),
  );

  async function onSaveEta(minutes: number): Promise<boolean> {
    const parsed = Number.parseInt(String(minutes), 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 240) {
      setError('Please enter ETA minutes between 1 and 240');
      return false;
    }

    setIsSavingEta(true);
    setError(null);
    try {
      const updated = await updateFoodSelectionEta(selection.id, parsed);
      dispatch({
        type: 'FOOD_SELECTION_ETA_UPDATED',
        payload: {
          foodSelectionId: updated.id,
          etaMinutes: updated.etaMinutes ?? parsed,
          etaSetAt: updated.etaSetAt ?? new Date().toISOString(),
          deliveryDueAt: updated.deliveryDueAt ?? new Date().toISOString(),
        },
      });
      setManualEtaMinutes('');
      return true;
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : 'Could not update ETA');
      return false;
    } finally {
      setIsSavingEta(false);
    }
  }

  async function onConfirmArrival(): Promise<boolean> {
    const confirmed = window.confirm('Confirm lunch has arrived? This cannot be changed afterwards.');
    if (!confirmed) return false;

    setIsConfirmingArrival(true);
    setError(null);
    try {
      await confirmFoodArrival(selection.id);
      return true;
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : 'Could not confirm arrival');
      return false;
    } finally {
      setIsConfirmingArrival(false);
    }
  }

  async function onAbortProcess(): Promise<boolean> {
    const confirmed = window.confirm('Abort food selection?');
    if (!confirmed) return false;

    setError(null);
    try {
      await abortFoodSelection(selection.id);
      return true;
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : 'Could not abort process');
      return false;
    }
  }

  async function onCopyOrders() {
    try {
      const summary = buildOrderSummary({
        menuName: selection.menuName,
        etaMinutes: selection.etaMinutes,
        etaLabel: 'Current ETA',
        orders: selection.orders,
        priceByItemId,
        priceByItemName,
        itemNumberByItemId,
        itemNumberByItemName,
        includeTotal: true,
      });
      await copyOrderSummary(summary);
      setCopyStatus('success');
    } catch {
      setCopyStatus('error');
    }
  }

  async function onToggleDelivered(orderId: string, delivered: boolean) {
    setUpdatingDeliveredIds((previous) => new Set(previous).add(orderId));
    setError(null);
    try {
      await setOrderDelivered(selection.id, orderId, delivered, nickname ?? undefined);
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : 'Could not update delivery check');
    } finally {
      setUpdatingDeliveredIds((previous) => {
        const next = new Set(previous);
        next.delete(orderId);
        return next;
      });
    }
  }

  const formatDateTime = (value: string | null): string => {
    if (!value) return 'Unknown';
    const date = new Date(value);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <div className="mx-auto w-full max-w-3xl p-4">
      <TimerActionHeader
        title={isDue ? 'Lunch should have arrived' : 'Awaiting lunch delivery'}
        timerLabel={formatTime(remaining)}
        remainingSeconds={remaining}
        totalSeconds={totalSeconds}
        triggerAriaLabel="Delivery timer actions"
        menuWidthClass="w-56"
        dueStyle={isDue}
      >
        {({ closeMenu }) => (
          <>
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  const done = await onConfirmArrival();
                  if (done) closeMenu();
                })();
              }}
              disabled={isConfirmingArrival}
              className="block w-full border-b border-gray-200 bg-green-100 px-3 py-2 text-left text-sm font-medium text-green-800 hover:bg-green-200 disabled:opacity-60"
            >
              Confirm lunch arrived
            </button>

            {canManageFoodSelection && (
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    const done = await onAbortProcess();
                    if (done) closeMenu();
                  })();
                }}
                className="block w-full border-b border-gray-200 bg-red-100 px-3 py-2 text-left text-sm font-medium text-red-800 hover:bg-red-200 disabled:opacity-60"
              >
                Abort process
              </button>
            )}

            <div className="max-h-48 overflow-y-auto border-b border-gray-200 py-1">
              {etaOptions.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  onClick={() => {
                    void (async () => {
                      const done = await onSaveEta(minutes);
                      if (done) closeMenu();
                    })();
                  }}
                  disabled={isSavingEta}
                  className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  {minutes} min
                </button>
              ))}
            </div>

            <div className="p-2">
              <input
                type="text"
                value={manualEtaMinutes}
                onChange={(event) => setManualEtaMinutes(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void (async () => {
                      const done = await onSaveEta(Number.parseInt(manualEtaMinutes, 10));
                      if (done) closeMenu();
                    })();
                  }
                }}
                placeholder="Manual minutes remaining"
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                aria-label="Manual minutes remaining"
              />
            </div>
          </>
        )}
      </TimerActionHeader>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">{activeFoodSelection.menuName}</h2>
        <p className="mt-1 text-sm text-gray-600">
          Phase 3 delivery tracking is active. Use the timer menu to confirm arrival or update ETA.
        </p>
        <p className="mt-1 text-sm text-gray-600">
          Tick items as delivered while checking the bags.
        </p>
        <div
          className={`mt-4 rounded border p-3 ${
            isDue ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          <p className="text-sm font-semibold">
            {isDue
              ? `Delivery is late by ${formatLateDuration(lateSeconds)}.`
              : `Delivery is on time. ${formatTime(remaining)} remaining until the announced ETA.`}
          </p>
          <p className={`mt-1 text-xs ${isDue ? 'text-amber-800' : 'text-emerald-800'}`}>
            {isDue
              ? 'The announced arrival time has passed. Update the ETA or confirm arrival when the food is here.'
              : 'Keep the ETA updated if the restaurant gives you a new estimate.'}
          </p>
        </div>
        <div className="mt-2 space-y-1 text-xs text-gray-500">
          <p>Order placed: {formatDateTime(selection.orderPlacedAt)}</p>
          {selection.orderPlacedBy && <p>Order placed by: {selection.orderPlacedBy}</p>}
          {selection.deliveryDueAt && <p>Announced arrival: {formatDateTime(selection.deliveryDueAt)}</p>}
        </div>

        {(selectionMenu?.location || selectionMenu?.phone || selectionMenu?.url) && (
          <div className="mt-4 rounded border border-gray-200 bg-gray-50 p-3">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">Restaurant contact</h3>
            <div className="space-y-1 text-sm text-gray-700">
              {selectionMenu?.location && (
                <p>
                  <span className="font-medium">Location:</span> {selectionMenu.location}
                </p>
              )}
              {selectionMenu?.phone && (
                <p>
                  <span className="font-medium">Phone:</span> {selectionMenu.phone}
                </p>
              )}
              {selectionMenu?.url && (
                <p>
                  <span className="font-medium">URL:</span>{' '}
                  <a
                    href={selectionMenu.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-700 underline hover:text-blue-800"
                  >
                    {selectionMenu.url}
                  </a>
                </p>
              )}
            </div>
          </div>
        )}

        <div className="mt-4">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">
            Current orders ({selection.orders.length} orders, {uniqueUserCount} users)
          </h3>
          {selection.orders.length === 0 ? (
            <p className="text-sm italic text-gray-400">No orders were placed</p>
          ) : (
            <div className="max-h-[45vh] space-y-1 overflow-y-auto pr-1">
              {ordersByUser.map(([userName, userOrders]) => (
                <div key={userName} className="rounded border border-gray-200 bg-gray-50 p-2">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
                    {userName} ({userOrders.length})
                  </div>
                  <div className="space-y-1">
                    {userOrders.map((order) => (
                      <div key={order.id} className="flex items-baseline justify-between gap-3 rounded bg-white px-2 py-1.5">
                        <div className="flex min-w-0 items-baseline gap-2">
                          <input
                            type="checkbox"
                            aria-label={`Delivered ${order.itemName} for ${order.nickname}`}
                            checked={Boolean(order.delivered)}
                            disabled={updatingDeliveredIds.has(order.id)}
                            onChange={(event) => {
                              void onToggleDelivered(order.id, event.currentTarget.checked);
                            }}
                          />
                          <span className="truncate text-sm text-gray-700">
                            {(() => {
                              const itemNumber = resolveOrderItemNumber(
                                order,
                                itemNumberByItemId,
                                itemNumberByItemName,
                              );
                              return itemNumber ? `${itemNumber} ${order.itemName}` : order.itemName;
                            })()}
                          </span>
                          {order.notes && <span className="truncate text-xs text-gray-400">({order.notes})</span>}
                        </div>
                        <span className="w-20 text-right whitespace-nowrap text-xs font-semibold text-emerald-700">
                          {(() => {
                            const resolvedPrice = resolveOrderPrice(order, priceByItemId, priceByItemName);
                            return resolvedPrice === null ? '-' : formatPrice(resolvedPrice);
                          })()}
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

          <div className="mt-3">
            <button
              type="button"
              onClick={() => void onCopyOrders()}
              className="w-full rounded border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
            >
              Copy order list
            </button>
            <OrderCopyStatus status={copyStatus} />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
