import { useEffect, useState } from 'react';
import * as api from '../api.js';
import { isAdminAuthenticatedUser } from '../auth.js';
import { useAppState } from '../context/AppContext.js';
import { useNickname } from '../hooks/useNickname.js';
import FoodSelectionAbortControl from './FoodSelectionAbortControl.js';
import FoodSelectionOrderBoard from './FoodSelectionOrderBoard.js';
import MinutesActionDropdown from './MinutesActionDropdown.js';
import {
  buildOrderLookupMaps,
  buildOrderSummary,
  copyOrderSummary,
} from '../utils/orderCopy.js';
import OrderCopyStatus from './OrderCopyStatus.js';
import type { FoodSelectionFallbackCandidate } from '../../lib/types.js';

const ETA_OPTIONS = [10, 15, 20, 25, 30, 40, 50, 60] as const;

export default function FoodSelectionOrderingView() {
  const { activeFoodSelection, menus } = useAppState();
  const { nickname } = useNickname();
  const [etaMinutes, setEtaMinutes] = useState<number>(30);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [claimingOrder, setClaimingOrder] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [processingOrderIds, setProcessingOrderIds] = useState<Set<string>>(new Set());
  const [fallbackCandidates, setFallbackCandidates] = useState<FoodSelectionFallbackCandidate[]>([]);
  const [fallbackLoading, setFallbackLoading] = useState(false);
  const [fallbackError, setFallbackError] = useState('');
  const [fallbackSuccess, setFallbackSuccess] = useState('');
  const [placingFallbackFor, setPlacingFallbackFor] = useState<string | null>(null);
  const [pingingFallbackFor, setPingingFallbackFor] = useState<string | null>(null);
  const canManageFoodSelection = isAdminAuthenticatedUser();

  if (!activeFoodSelection || activeFoodSelection.status !== 'ordering') return null;

  const selection = activeFoodSelection;
  const normalizedNickname = nickname?.trim().toLowerCase() ?? null;
  const orderingOwner = selection.orderPlacedBy?.trim() ?? '';
  const isClaimed = orderingOwner.length > 0;
  const isClaimedByMe = !!normalizedNickname && orderingOwner.toLowerCase() === normalizedNickname;
  const selectionMenu = menus.find((menu) => menu.id === selection.menuId);
  const { priceByItemId, priceByItemName, itemNumberByItemId, itemNumberByItemName } =
    buildOrderLookupMaps(selectionMenu);

  useEffect(() => {
    let cancelled = false;

    const loadFallbackCandidates = async () => {
      if (!canManageFoodSelection) {
        setFallbackCandidates([]);
        setFallbackError('');
        return;
      }

      setFallbackLoading(true);
      setFallbackError('');
      try {
        const candidates = await api.fetchFallbackOrderCandidates(selection.id);
        if (cancelled) {
          return;
        }
        setFallbackCandidates(candidates);
      } catch (requestError) {
        if (cancelled) {
          return;
        }
        setFallbackError((requestError as Error).message);
      } finally {
        if (!cancelled) {
          setFallbackLoading(false);
        }
      }
    };

    void loadFallbackCandidates();

    return () => {
      cancelled = true;
    };
  }, [canManageFoodSelection, selection.id]);

  const handlePlaceOrder = async (value: number): Promise<boolean> => {
    if (!Number.isInteger(value) || value < 1 || value > 240) {
      setError('Custom ETA must be an integer between 1 and 240 minutes');
      return false;
    }

    const confirmed = window.confirm(
      `Confirm that you placed the restaurant order and are announcing an ETA of ${value} minutes?`,
    );
    if (!confirmed) {
      return false;
    }

    setSubmitting(true);
    setError('');
    try {
      await api.placeDeliveryOrder(selection.id, value, nickname ?? undefined);
      setEtaMinutes(value);
      return true;
    } catch (requestError) {
      setError((requestError as Error).message);
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleClaimOrdering = async () => {
    const confirmed = window.confirm(
      'Confirm that you are starting the restaurant order now? Everyone else will be notified so they do not order in parallel.',
    );
    if (!confirmed) {
      return;
    }

    setClaimingOrder(true);
    setError('');
    try {
      await api.claimOrderingResponsibility(selection.id, nickname ?? undefined);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setClaimingOrder(false);
    }
  };

  const handleAbort = async () => {
    setSubmitting(true);
    setError('');
    try {
      await api.abortFoodSelection(selection.id);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleProcessed = async (orderId: string, processed: boolean) => {
    setProcessingOrderIds((previous) => new Set(previous).add(orderId));
    try {
      await api.setOrderProcessed(selection.id, orderId, processed, nickname ?? undefined);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setProcessingOrderIds((previous) => {
        const next = new Set(previous);
        next.delete(orderId);
        return next;
      });
    }
  };

  const handleCopyOrders = async () => {
    try {
      const summary = buildOrderSummary({
        menuName: selection.menuName,
        etaMinutes: etaMinutes,
        etaLabel: 'Planned ETA',
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

  const handlePlaceFallbackOrder = async (candidate: FoodSelectionFallbackCandidate) => {
    setPlacingFallbackFor(candidate.nickname);
    setFallbackError('');
    setFallbackSuccess('');
    try {
      await api.placeFallbackOrder(selection.id, {
        nickname: candidate.nickname,
        actingNickname: nickname ?? undefined,
      });
      setFallbackCandidates((previous) =>
        previous.filter((entry) => entry.nickname !== candidate.nickname),
      );
      setFallbackSuccess(
        `Placed default meal for ${candidate.nickname}: ${
          candidate.itemNumber ? `${candidate.itemNumber} ` : ''
        }${candidate.itemName}`,
      );
    } catch (requestError) {
      setFallbackError((requestError as Error).message);
    } finally {
      setPlacingFallbackFor(null);
    }
  };

  const handlePingFallbackCandidate = async (candidate: FoodSelectionFallbackCandidate) => {
    setPingingFallbackFor(candidate.nickname);
    setFallbackError('');
    setFallbackSuccess('');
    try {
      await api.pingFallbackCandidate(selection.id, {
        nickname: candidate.nickname,
        actingNickname: nickname ?? undefined,
      });
      setFallbackSuccess(`Pinged ${candidate.nickname}. Browser notification and email were triggered best-effort.`);
    } catch (requestError) {
      setFallbackError((requestError as Error).message);
    } finally {
      setPingingFallbackFor(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] p-4 lg:px-6">
      <div className="mb-4 rounded bg-sky-50 px-4 py-2 text-center">
        <span className="text-sm font-medium text-sky-700">
          {selection.menuName} &mdash; Ready to place order
        </span>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-lg border border-sky-200 bg-white p-6 shadow-sm xl:col-span-2">
          <h2 className="mb-2 text-lg font-semibold text-sky-700">Place the restaurant order</h2>
          <p className="mb-4 text-sm text-gray-600">
            One person now places the real order, checks off processed items, and sets the announced ETA.
          </p>

          {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

          {!isClaimed ? (
            <div className="mb-4 rounded border border-sky-200 bg-sky-50 p-4">
              <h3 className="text-sm font-semibold text-sky-900">Nobody has claimed the order yet</h3>
              <p className="mt-1 text-sm text-sky-800">
                Claim the ordering step first so everyone knows who is calling the restaurant.
              </p>
              <button
                type="button"
                onClick={() => {
                  void handleClaimOrdering();
                }}
                disabled={claimingOrder || submitting}
                className="mt-4 rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
              >
                {claimingOrder ? 'Claiming order...' : 'I am placing the order'}
              </button>
            </div>
          ) : isClaimedByMe ? (
            <div className="mb-4 space-y-2">
              <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                You claimed the ordering step. Set the ETA once the restaurant confirms the order.
              </div>
              <label className="block text-xs font-medium uppercase tracking-wide text-gray-600">
                Announced ETA (minutes)
              </label>
              <MinutesActionDropdown
                triggerLabel={
                  submitting ? 'Placing order...' : `Order placed (ETA ${etaMinutes} min)`
                }
                triggerAriaLabel="Place order ETA menu"
                options={ETA_OPTIONS}
                onSubmitMinutes={handlePlaceOrder}
                disabled={submitting}
                customPlaceholder="Custom ETA in minutes"
                customAriaLabel="Custom ETA in minutes"
                submitButtonLabel="Confirm placed order"
              />
            </div>
          ) : (
            <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-4">
              <h3 className="text-sm font-semibold text-amber-900">{orderingOwner} is placing the order</h3>
              <p className="mt-1 text-sm text-amber-800">
                Wait for {orderingOwner} to confirm the order and ETA so no second person orders in parallel.
              </p>
            </div>
          )}

          <div className="mb-4">
            <button
              type="button"
              onClick={() => void handleCopyOrders()}
              className="w-full rounded border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-100"
            >
              Copy order list
            </button>
            <OrderCopyStatus status={copyStatus} />
          </div>

          {canManageFoodSelection ? (
            <div className="rounded border border-amber-200 bg-amber-50 p-4">
              <h3 className="text-sm font-semibold text-amber-900">
                Missing voters with fallback meals ({fallbackCandidates.length})
              </h3>
              {fallbackLoading ? (
                <p className="mt-2 text-sm text-amber-800">Loading fallback meal options...</p>
              ) : fallbackCandidates.length === 0 ? (
                <p className="mt-2 text-sm italic text-amber-800">
                  No eligible fallback meals right now.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {fallbackCandidates.map((candidate) => (
                    <li
                      key={candidate.nickname}
                      className="flex flex-wrap items-center justify-between gap-3 rounded border border-amber-200 bg-white px-3 py-2"
                    >
                      <div className="text-sm text-gray-800">
                        <span className="font-medium">{candidate.nickname}</span>
                        <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                          Default meal configured
                        </span>
                        <span className="ml-2 text-gray-600">
                          {candidate.itemNumber ? `${candidate.itemNumber} ` : ''}
                          {candidate.itemName}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handlePingFallbackCandidate(candidate)}
                          disabled={pingingFallbackFor === candidate.nickname || submitting}
                          className="rounded border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                        >
                          {pingingFallbackFor === candidate.nickname ? 'Pinging...' : 'Ping user'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handlePlaceFallbackOrder(candidate)}
                          disabled={placingFallbackFor === candidate.nickname || submitting}
                          className="rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                        >
                          Place default meal
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {fallbackSuccess ? <p className="mt-2 text-xs text-emerald-700">{fallbackSuccess}</p> : null}
              {fallbackError ? <p className="mt-2 text-xs text-red-600">{fallbackError}</p> : null}
            </div>
          ) : null}

          {canManageFoodSelection && (
            <div className="mt-3 text-center">
              <FoodSelectionAbortControl disabled={submitting} onAbort={handleAbort} />
            </div>
          )}
        </div>

        <FoodSelectionOrderBoard
          selection={selection}
          menus={menus}
          mode="by-item"
          showProcessedCheckboxes
          processingOrderIds={processingOrderIds}
          onToggleProcessed={handleToggleProcessed}
        />
      </div>
    </div>
  );
}
