import { useState } from 'react';
import { useAppState } from '../context/AppContext.js';
import type { FoodSelection } from '../../lib/types.js';
import { getAuthenticatedActorKey, getAuthenticatedDisplayLabel } from '../auth.js';
import * as api from '../api.js';
import {
  buildOrderLookupMaps,
  buildOrderSummary,
  copyOrderSummary,
  formatPrice,
  resolveOrderItemNumber,
  resolveOrderPrice,
} from '../utils/orderCopy.js';
import OrderCopyStatus from './OrderCopyStatus.js';

interface FoodSelectionCompletedViewProps {
  selection?: FoodSelection;
  isHistorical?: boolean;
  onBackToDashboard?: () => void;
}

function formatCompletedAt(value: string | null): string {
  if (!value) return 'Unknown completion time';
  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function formatDateTime(value: string | null): string {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function getArrivalComparison(deliveryDueAt: string | null, completedAt: string | null): string | null {
  if (!deliveryDueAt || !completedAt) return null;
  const diffMs = new Date(completedAt).getTime() - new Date(deliveryDueAt).getTime();
  const diffMinutes = Math.round(Math.abs(diffMs) / 60000);
  if (diffMinutes === 0) return 'Arrived on time.';
  return diffMs > 0 ? `Arrived ${diffMinutes} min later than announced.` : `Arrived ${diffMinutes} min earlier than announced.`;
}

export default function FoodSelectionCompletedView({
  selection: selectedSelection,
  isHistorical = false,
  onBackToDashboard,
}: FoodSelectionCompletedViewProps) {
  const { latestCompletedFoodSelection, menus } = useAppState();
  const actorKey = getAuthenticatedActorKey();
  const actorLabel = getAuthenticatedDisplayLabel();
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [ratingValues, setRatingValues] = useState<Record<string, number>>({});
  const [feedbackValues, setFeedbackValues] = useState<Record<string, string>>({});
  const [savingRatingId, setSavingRatingId] = useState<string | null>(null);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [exportState, setExportState] = useState<'idle' | 'done' | 'error'>('idle');

  const selection = selectedSelection ?? latestCompletedFoodSelection;

  if (!selection) return null;

  const heading = isHistorical
    ? `Order from ${formatCompletedAt(selection.completedAt)}`
    : 'Team Lunch order completed!';
  const selectionMenu = menus.find((menu) => menu.id === selection.menuId);
  const { priceByItemId, priceByItemName, itemNumberByItemId, itemNumberByItemName } =
    buildOrderLookupMaps(selectionMenu);
  const totalPrice = selection.orders.reduce((sum, order) => {
    const resolvedPrice = resolveOrderPrice(order, priceByItemId, priceByItemName);
    return sum + (resolvedPrice ?? 0);
  }, 0);
  const arrivalComparison = getArrivalComparison(selection.deliveryDueAt, selection.completedAt);

  const handleCopyOrders = async () => {
    try {
      const summary = buildOrderSummary({
        menuName: selection.menuName,
        etaMinutes: selection.etaMinutes,
        etaLabel: 'Final ETA',
        completedLabel: formatCompletedAt(selection.completedAt),
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
  };

  const handleSaveRating = async (orderId: string, currentRating: number | null | undefined) => {
    if (!actorLabel) return;
    const rating = ratingValues[orderId] ?? currentRating ?? 0;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      setRatingError('Rating must be between 1 and 5.');
      return;
    }

    setSavingRatingId(orderId);
    setRatingError(null);
    try {
      await api.rateOrder(
        selection.id,
        orderId,
        actorLabel,
        rating,
        feedbackValues[orderId] ?? null,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save rating';
      setRatingError(message);
    } finally {
      setSavingRatingId(null);
    }
  };

  const handleExport = async () => {
    if (!actorLabel) return;
    setExportState('idle');
    try {
      const blob = await api.exportMyOrdersExcel(actorLabel);
      const fileName = `team-lunch-orders-${actorLabel.replace(/[^a-zA-Z0-9._-]/g, '_') || 'user'}.xlsx`;
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      setExportState('done');
    } catch {
      setExportState('error');
    }
  };

  const isOrderOwnedByCurrentUser = (order: { actorKey?: string | null; nickname: string }): boolean =>
    actorKey ? order.actorKey === actorKey || (!order.actorKey && order.nickname === actorLabel) : order.nickname === actorLabel;

  return (
    <div className="flex min-h-0 flex-1 items-start justify-center p-4">
      <div className="w-full max-w-md rounded-lg border border-success bg-surface p-6 shadow-sm">
        {isHistorical && onBackToDashboard && (
          <button
            type="button"
            onClick={onBackToDashboard}
            className="mb-4 flex items-center gap-1 rounded border border-border px-3 py-1.5 text-sm font-medium text-fg-muted hover:bg-surface-muted"
          >
            &larr; Back to Dashboard
          </button>
        )}
        <h2 className="mb-1 text-center text-lg font-semibold text-success-fg">
          {heading}
        </h2>
        <p className="text-center text-sm text-fg-muted">{selection.menuName}</p>
        <p className="mb-4 text-center text-xs text-fg-muted">
          Completed: {formatCompletedAt(selection.completedAt)}
        </p>
        <p className="mb-1 text-center text-xs text-fg-muted">
          Order placed: {formatDateTime(selection.orderPlacedAt)}
        </p>
        <p className="mb-4 text-center text-xs text-fg-muted">
          Announced arrival: {formatDateTime(selection.deliveryDueAt)}
        </p>

        {selection.etaMinutes && (
          <p className="mb-4 text-center text-sm text-fg-muted">Final ETA was {selection.etaMinutes} minutes.</p>
        )}
        {arrivalComparison && (
          <p className="mb-4 text-center text-sm font-medium text-fg">
            {arrivalComparison}
          </p>
        )}

        {/* Order summary */}
        {selection.orders.length === 0 ? (
          <p className="mb-4 text-center text-sm italic text-fg-muted">No orders were placed</p>
        ) : (
          <div className="mb-6 max-h-[55vh] space-y-1 overflow-y-auto pr-1">
            {selection.orders.map((o) => (
              <div key={o.id} className="flex items-baseline justify-between gap-3 rounded bg-surface-muted px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="text-sm font-medium text-fg">{o.nickname}</span>
                    <span className="text-sm text-fg-muted">&middot;</span>
                    <span className="truncate text-sm text-fg">
                      {(() => {
                        const itemNumber = resolveOrderItemNumber(
                          o,
                          itemNumberByItemId,
                          itemNumberByItemName,
                        );
                        return itemNumber ? `${itemNumber} ${o.itemName}` : o.itemName;
                      })()}
                    </span>
                    {o.notes && <span className="truncate text-xs text-fg-muted">({o.notes})</span>}
                  </div>
                  {isOrderOwnedByCurrentUser(o) && (
                    <div className="mt-1 flex items-center gap-2">
                      <select
                        value={ratingValues[o.id] ?? o.rating ?? ''}
                        onChange={(e) => {
                          const parsed = Number.parseInt(e.target.value, 10);
                          setRatingValues((prev) => ({ ...prev, [o.id]: Number.isNaN(parsed) ? 0 : parsed }));
                        }}
                        className="rounded border border-border px-2 py-1 text-xs"
                        aria-label={`Rating for ${o.itemName}`}
                      >
                        <option value="">Rate meal</option>
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="4">4</option>
                        <option value="5">5</option>
                      </select>
                      <input
                        type="text"
                        value={feedbackValues[o.id] ?? o.feedbackComment ?? ''}
                        onChange={(e) => {
                          setFeedbackValues((prev) => ({ ...prev, [o.id]: e.target.value }));
                        }}
                        className="min-w-0 flex-1 rounded border border-border px-2 py-1 text-xs"
                        maxLength={300}
                        placeholder="Remark about food or delivery"
                        aria-label={`Feedback remark for ${o.itemName}`}
                      />
                      <button
                        type="button"
                        onClick={() => void handleSaveRating(o.id, o.rating)}
                        disabled={savingRatingId === o.id}
                        className="rounded border border-accent bg-accent-soft px-2 py-1 text-xs font-medium text-accent-fg hover:bg-accent-soft disabled:opacity-50"
                      >
                        Save feedback
                      </button>
                    </div>
                  )}
                  {isOrderOwnedByCurrentUser(o) && (o.rating || o.feedbackComment) ? (
                    <div className="mt-1 text-xs text-fg-muted">
                      {o.rating ? <span>Current rating: {o.rating}/5</span> : null}
                      {o.feedbackComment ? (
                        <span className={o.rating ? 'ml-2' : ''}>Remark: {o.feedbackComment}</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <span className="w-20 text-right whitespace-nowrap text-xs font-semibold text-success-fg">
                  {(() => {
                    const resolvedPrice = resolveOrderPrice(o, priceByItemId, priceByItemName);
                    return resolvedPrice === null ? '-' : formatPrice(resolvedPrice);
                  })()}
                </span>
              </div>
            ))}
            {ratingError && <p className="mt-1 text-xs text-danger-fg">{ratingError}</p>}
            <div className="mt-2 flex justify-end border-t border-border pt-2">
              <span className="text-sm font-semibold text-fg">Total: {formatPrice(totalPrice)}</span>
            </div>
          </div>
        )}

        {!isHistorical && (
          <p className="text-center text-sm text-fg-muted">
            Delivery confirmed. This order is now final and stored in history.
          </p>
        )}

        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={() => void handleCopyOrders()}
            className="w-full rounded border border-success bg-success-soft px-3 py-2 text-sm font-medium text-success-fg hover:bg-success-soft"
          >
            Copy order list
          </button>
          <button
            type="button"
            onClick={() => void handleExport()}
            className="w-full rounded border border-accent bg-accent-soft px-3 py-2 text-sm font-medium text-accent-fg hover:bg-accent-soft"
          >
            Export my orders & ratings (Excel)
          </button>
          {exportState === 'done' && (
            <p className="text-center text-xs text-accent-fg">Excel export downloaded.</p>
          )}
          {exportState === 'error' && (
            <p className="text-center text-xs text-danger-fg">Could not export Excel file.</p>
          )}
          <OrderCopyStatus status={copyStatus} />
        </div>
      </div>
    </div>
  );
}
