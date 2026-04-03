import { useState } from 'react';
import { useAppState } from '../context/AppContext.js';
import type { FoodSelection } from '../../lib/types.js';
import { useNickname } from '../hooks/useNickname.js';
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
  const { nickname } = useNickname();
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
    if (!nickname) return;
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
        nickname,
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
    if (!nickname) return;
    setExportState('idle');
    try {
      const blob = await api.exportMyOrdersExcel(nickname);
      const fileName = `team-lunch-orders-${nickname.replace(/[^a-zA-Z0-9._-]/g, '_') || 'user'}.xlsx`;
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

  return (
    <div className="flex min-h-0 flex-1 items-start justify-center p-4">
      <div className="w-full max-w-md rounded-lg border border-green-200 bg-white p-6 shadow-sm">
        {isHistorical && onBackToDashboard && (
          <button
            type="button"
            onClick={onBackToDashboard}
            className="mb-4 flex items-center gap-1 rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            &larr; Back to Dashboard
          </button>
        )}
        <h2 className="mb-1 text-center text-lg font-semibold text-green-700">
          {heading}
        </h2>
        <p className="text-center text-sm text-gray-500">{selection.menuName}</p>
        <p className="mb-4 text-center text-xs text-gray-500">
          Completed: {formatCompletedAt(selection.completedAt)}
        </p>
        <p className="mb-1 text-center text-xs text-gray-500">
          Order placed: {formatDateTime(selection.orderPlacedAt)}
        </p>
        <p className="mb-4 text-center text-xs text-gray-500">
          Announced arrival: {formatDateTime(selection.deliveryDueAt)}
        </p>

        {selection.etaMinutes && (
          <p className="mb-4 text-center text-sm text-gray-600">Final ETA was {selection.etaMinutes} minutes.</p>
        )}
        {arrivalComparison && (
          <p className="mb-4 text-center text-sm font-medium text-gray-700">
            {arrivalComparison}
          </p>
        )}

        {/* Order summary */}
        {selection.orders.length === 0 ? (
          <p className="mb-4 text-center text-sm italic text-gray-400">No orders were placed</p>
        ) : (
          <div className="mb-6 max-h-[55vh] space-y-1 overflow-y-auto pr-1">
            {selection.orders.map((o) => (
              <div key={o.id} className="flex items-baseline justify-between gap-3 rounded bg-gray-50 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="text-sm font-medium text-gray-800">{o.nickname}</span>
                    <span className="text-sm text-gray-500">&middot;</span>
                    <span className="truncate text-sm text-gray-700">
                      {(() => {
                        const itemNumber = resolveOrderItemNumber(
                          o,
                          itemNumberByItemId,
                          itemNumberByItemName,
                        );
                        return itemNumber ? `${itemNumber} ${o.itemName}` : o.itemName;
                      })()}
                    </span>
                    {o.notes && <span className="truncate text-xs text-gray-400">({o.notes})</span>}
                  </div>
                  {nickname === o.nickname && (
                    <div className="mt-1 flex items-center gap-2">
                      <select
                        value={ratingValues[o.id] ?? o.rating ?? ''}
                        onChange={(e) => {
                          const parsed = Number.parseInt(e.target.value, 10);
                          setRatingValues((prev) => ({ ...prev, [o.id]: Number.isNaN(parsed) ? 0 : parsed }));
                        }}
                        className="rounded border border-gray-300 px-2 py-1 text-xs"
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
                        className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
                        maxLength={300}
                        placeholder="Remark about food or delivery"
                        aria-label={`Feedback remark for ${o.itemName}`}
                      />
                      <button
                        type="button"
                        onClick={() => void handleSaveRating(o.id, o.rating)}
                        disabled={savingRatingId === o.id}
                        className="rounded border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                      >
                        Save feedback
                      </button>
                    </div>
                  )}
                  {nickname === o.nickname && (o.rating || o.feedbackComment) ? (
                    <div className="mt-1 text-xs text-gray-500">
                      {o.rating ? <span>Current rating: {o.rating}/5</span> : null}
                      {o.feedbackComment ? (
                        <span className={o.rating ? 'ml-2' : ''}>Remark: {o.feedbackComment}</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <span className="w-20 text-right whitespace-nowrap text-xs font-semibold text-emerald-700">
                  {(() => {
                    const resolvedPrice = resolveOrderPrice(o, priceByItemId, priceByItemName);
                    return resolvedPrice === null ? '-' : formatPrice(resolvedPrice);
                  })()}
                </span>
              </div>
            ))}
            {ratingError && <p className="mt-1 text-xs text-red-600">{ratingError}</p>}
            <div className="mt-2 flex justify-end border-t border-gray-200 pt-2">
              <span className="text-sm font-semibold text-gray-800">Total: {formatPrice(totalPrice)}</span>
            </div>
          </div>
        )}

        {!isHistorical && (
          <p className="text-center text-sm text-gray-600">
            Delivery confirmed. This order is now final and stored in history.
          </p>
        )}

        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={() => void handleCopyOrders()}
            className="w-full rounded border border-green-300 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-100"
          >
            Copy order list
          </button>
          <button
            type="button"
            onClick={() => void handleExport()}
            className="w-full rounded border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
          >
            Export my orders & ratings (Excel)
          </button>
          {exportState === 'done' && (
            <p className="text-center text-xs text-blue-700">Excel export downloaded.</p>
          )}
          {exportState === 'error' && (
            <p className="text-center text-xs text-red-600">Could not export Excel file.</p>
          )}
          <OrderCopyStatus status={copyStatus} />
        </div>
      </div>
    </div>
  );
}
