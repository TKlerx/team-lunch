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

        {(selectionMenu?.location || selectionMenu?.phone || selectionMenu?.url || selectionMenu?.orderUrl) && (
          <div className="mt-4 rounded border border-gray-200 bg-gray-50 p-3">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">Restaurant contact</h3>
            <table className="text-sm text-gray-700">
              <tbody>
              {selectionMenu?.location && (
                <tr>
                  <td className="pr-2 align-top">
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  </td>
                  <td className="py-0.5">
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectionMenu.location)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-700 underline hover:text-blue-800"
                    >
                      {selectionMenu.location}
                    </a>
                  </td>
                </tr>
              )}
              {selectionMenu?.phone && (
                <tr>
                  <td className="pr-2 align-top">
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.78 19.78 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.78 19.78 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.91.35 1.8.68 2.64a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.44-1.25a2 2 0 0 1 2.11-.45c.84.33 1.73.56 2.64.68A2 2 0 0 1 22 16.92z" />
                    </svg>
                  </td>
                  <td className="py-0.5">
                    <a href={`tel:${selectionMenu.phone}`} className="text-blue-700 underline hover:text-blue-800">
                      {selectionMenu.phone}
                    </a>
                  </td>
                </tr>
              )}
              {selectionMenu?.url && (
                <tr>
                  <td className="pr-2 align-top">
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 3h7v7" />
                      <path d="M10 14L21 3" />
                      <path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6" />
                    </svg>
                  </td>
                  <td className="py-0.5">
                    <a
                      href={selectionMenu.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={selectionMenu.url}
                      className="text-blue-700 underline hover:text-blue-800"
                    >
                      {(() => { try { const u = new URL(selectionMenu.url); return `${u.origin}/\u2026`; } catch { return selectionMenu.url; } })()}
                    </a>
                  </td>
                </tr>
              )}
              {selectionMenu?.orderUrl && (
                <tr>
                  <td className="pr-2 align-top">
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="9" cy="21" r="1" />
                      <circle cx="20" cy="21" r="1" />
                      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                    </svg>
                  </td>
                  <td className="py-0.5">
                    <a
                      href={selectionMenu.orderUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={selectionMenu.orderUrl}
                      className="text-blue-700 underline hover:text-blue-800"
                    >
                      {(() => { try { const u = new URL(selectionMenu.orderUrl); return `${u.origin}/\u2026`; } catch { return selectionMenu.orderUrl; } })()}
                    </a>
                  </td>
                </tr>
              )}
              </tbody>
            </table>
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
