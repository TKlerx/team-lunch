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
      <div className="mb-4 rounded bg-accent-soft px-4 py-2 text-center">
        <span className="text-sm font-medium text-accent-fg">
          {selection.menuName} &mdash; Ready to place order
        </span>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-lg border border-accent bg-surface p-6 shadow-sm xl:col-span-2">
          <h2 className="mb-2 text-lg font-semibold text-accent-fg">Place the restaurant order</h2>
          <p className="mb-4 text-sm text-fg-muted">
            One person now places the real order, checks off processed items, and sets the announced ETA.
          </p>

          {(selectionMenu?.phone || selectionMenu?.url || selectionMenu?.orderUrl || selectionMenu?.location) && (
            <div className="mb-4 rounded border border-border bg-surface-muted p-3">
              <table className="text-sm text-fg">
                <tbody>
                {selectionMenu?.orderUrl && (
                  <tr>
                    <td className="pr-2 align-top">
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 text-fg-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                        className="text-accent-fg underline hover:text-accent-fg"
                      >
                        {(() => { try { const u = new URL(selectionMenu.orderUrl); return `${u.origin}/\u2026`; } catch { return selectionMenu.orderUrl; } })()}
                      </a>
                    </td>
                  </tr>
                )}
                {selectionMenu?.phone && (
                  <tr>
                    <td className="pr-2 align-top">
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 text-fg-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.78 19.78 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.78 19.78 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.91.35 1.8.68 2.64a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.44-1.25a2 2 0 0 1 2.11-.45c.84.33 1.73.56 2.64.68A2 2 0 0 1 22 16.92z" />
                      </svg>
                    </td>
                    <td className="py-0.5">
                      <a href={`tel:${selectionMenu.phone}`} className="text-accent-fg underline hover:text-accent-fg">
                        {selectionMenu.phone}
                      </a>
                    </td>
                  </tr>
                )}
                {selectionMenu?.url && (
                  <tr>
                    <td className="pr-2 align-top">
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 text-fg-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                        className="text-accent-fg underline hover:text-accent-fg"
                      >
                        {(() => { try { const u = new URL(selectionMenu.url); return `${u.origin}/\u2026`; } catch { return selectionMenu.url; } })()}
                      </a>
                    </td>
                  </tr>
                )}
                {selectionMenu?.location && (
                  <tr>
                    <td className="pr-2 align-top">
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 text-fg-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                    </td>
                    <td className="py-0.5">
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectionMenu.location)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent-fg underline hover:text-accent-fg"
                      >
                        {selectionMenu.location}
                      </a>
                    </td>
                  </tr>
                )}
                </tbody>
              </table>
            </div>
          )}

          {error && <p className="mb-4 text-sm text-danger-fg">{error}</p>}

          {!isClaimed ? (
            <div className="mb-4 rounded border border-accent bg-accent-soft p-4">
              <h3 className="text-sm font-semibold text-accent-fg">Nobody has claimed the order yet</h3>
              <p className="mt-1 text-sm text-accent-fg">
                Claim the ordering step first so everyone knows who is calling the restaurant.
              </p>
              <button
                type="button"
                onClick={() => {
                  void handleClaimOrdering();
                }}
                disabled={claimingOrder || submitting}
                className="mt-4 rounded bg-accent-solid px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
              >
                {claimingOrder ? 'Claiming order...' : 'I am placing the order'}
              </button>
            </div>
          ) : isClaimedByMe ? (
            <div className="mb-4 space-y-2">
              <div className="rounded border border-success bg-success-soft px-3 py-2 text-sm text-success-fg">
                You claimed the ordering step. Set the ETA once the restaurant confirms the order.
              </div>
              <label className="block text-xs font-medium uppercase tracking-wide text-fg-muted">
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
            <div className="mb-4 rounded border border-warning bg-warning-soft p-4">
              <h3 className="text-sm font-semibold text-warning-fg">{orderingOwner} is placing the order</h3>
              <p className="mt-1 text-sm text-warning-fg">
                Wait for {orderingOwner} to confirm the order and ETA so no second person orders in parallel.
              </p>
            </div>
          )}

          <div className="mb-4">
            <button
              type="button"
              onClick={() => void handleCopyOrders()}
              className="w-full rounded border border-accent bg-accent-soft px-3 py-2 text-sm font-medium text-accent-fg hover:bg-accent-soft"
            >
              Copy order list
            </button>
            <OrderCopyStatus status={copyStatus} />
          </div>

          {canManageFoodSelection ? (
            <div className="rounded border border-warning bg-warning-soft p-4">
              <h3 className="text-sm font-semibold text-warning-fg">
                Missing voters with fallback meals ({fallbackCandidates.length})
              </h3>
              {fallbackLoading ? (
                <p className="mt-2 text-sm text-warning-fg">Loading fallback meal options...</p>
              ) : fallbackCandidates.length === 0 ? (
                <p className="mt-2 text-sm italic text-warning-fg">
                  No eligible fallback meals right now.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {fallbackCandidates.map((candidate) => (
                    <li
                      key={candidate.nickname}
                      className="flex flex-wrap items-center justify-between gap-3 rounded border border-warning bg-surface px-3 py-2"
                    >
                      <div className="text-sm text-fg">
                        <span className="font-medium">{candidate.nickname}</span>
                        <span className="ml-2 rounded bg-warning-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warning-fg">
                          Default meal configured
                        </span>
                        <span className="ml-2 text-fg-muted">
                          {candidate.itemNumber ? `${candidate.itemNumber} ` : ''}
                          {candidate.itemName}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handlePingFallbackCandidate(candidate)}
                          disabled={pingingFallbackFor === candidate.nickname || submitting}
                          className="rounded border border-warning bg-surface px-3 py-1.5 text-xs font-medium text-warning-fg hover:bg-warning-soft disabled:opacity-50"
                        >
                          {pingingFallbackFor === candidate.nickname ? 'Pinging...' : 'Ping user'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handlePlaceFallbackOrder(candidate)}
                          disabled={placingFallbackFor === candidate.nickname || submitting}
                          className="rounded bg-warning-solid px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                        >
                          Place default meal
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {fallbackSuccess ? <p className="mt-2 text-xs text-success-fg">{fallbackSuccess}</p> : null}
              {fallbackError ? <p className="mt-2 text-xs text-danger-fg">{fallbackError}</p> : null}
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
