import { useEffect, useState } from 'react';
import * as api from '../api.js';
import { getAuthenticatedDisplayLabel, isAdminAuthenticatedUser } from '../auth.js';
import { useAppState } from '../context/AppContext.js';
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

function formatCompactUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}/\u2026`;
  } catch {
    return value;
  }
}

type OrderingContactLink = {
  key: string;
  href: string;
  label: string;
  title?: string;
};

function getOrderingContactLinks(menu: {
  location?: string | null;
  phone?: string | null;
  url?: string | null;
  orderUrl?: string | null;
} | null | undefined): OrderingContactLink[] {
  if (!menu) return [];
  const links: OrderingContactLink[] = [];
  if (menu.orderUrl) links.push({ key: 'orderUrl', href: menu.orderUrl, label: formatCompactUrl(menu.orderUrl), title: menu.orderUrl });
  if (menu.phone) links.push({ key: 'phone', href: `tel:${menu.phone}`, label: menu.phone });
  if (menu.url) links.push({ key: 'url', href: menu.url, label: formatCompactUrl(menu.url), title: menu.url });
  if (menu.location) {
    links.push({
      key: 'location',
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(menu.location)}`,
      label: menu.location,
    });
  }
  return links;
}

function OrderingContactCard({ menu }: { menu: Parameters<typeof getOrderingContactLinks>[0] }) {
  const links = getOrderingContactLinks(menu);
  if (links.length === 0) return null;

  return (
    <div className="mb-4 rounded border border-border bg-surface-muted p-3">
      <table className="text-sm text-fg">
        <tbody>
          {links.map((link) => (
            <tr key={link.key}>
              <td className="py-0.5">
                <a href={link.href} target={link.href.startsWith('tel:') ? undefined : '_blank'} rel={link.href.startsWith('tel:') ? undefined : 'noopener noreferrer'} title={link.title} className="text-accent-fg underline hover:text-accent-fg">
                  {link.label}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrderingClaimPanel({
  isClaimed,
  isClaimedByMe,
  orderingOwner,
  etaMinutes,
  claimingOrder,
  submitting,
  onClaimOrdering,
  onPlaceOrder,
}: {
  isClaimed: boolean;
  isClaimedByMe: boolean;
  orderingOwner: string;
  etaMinutes: number;
  claimingOrder: boolean;
  submitting: boolean;
  onClaimOrdering: () => void;
  onPlaceOrder: (value: number) => Promise<boolean>;
}) {
  if (!isClaimed) {
    return (
      <div className="mb-4 rounded border border-accent bg-accent-soft p-4">
        <h3 className="text-sm font-semibold text-accent-fg">Nobody has claimed the order yet</h3>
        <p className="mt-1 text-sm text-accent-fg">Claim the ordering step first so everyone knows who is calling the restaurant.</p>
        <button type="button" onClick={onClaimOrdering} disabled={claimingOrder || submitting} className="mt-4 rounded bg-accent-solid px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">
          {claimingOrder ? 'Claiming order...' : 'I am placing the order'}
        </button>
      </div>
    );
  }
  if (!isClaimedByMe) {
    return (
      <div className="mb-4 rounded border border-warning bg-warning-soft p-4">
        <h3 className="text-sm font-semibold text-warning-fg">{orderingOwner} is placing the order</h3>
        <p className="mt-1 text-sm text-warning-fg">Wait for {orderingOwner} to confirm the order and ETA so no second person orders in parallel.</p>
      </div>
    );
  }
  return (
    <div className="mb-4 space-y-2">
      <div className="rounded border border-success bg-success-soft px-3 py-2 text-sm text-success-fg">
        You claimed the ordering step. Set the ETA once the restaurant confirms the order.
      </div>
      <label className="block text-xs font-medium uppercase tracking-wide text-fg-muted">Announced ETA (minutes)</label>
      <MinutesActionDropdown
        triggerLabel={submitting ? 'Placing order...' : `Order placed (ETA ${etaMinutes} min)`}
        triggerAriaLabel="Place order ETA menu"
        options={ETA_OPTIONS}
        onSubmitMinutes={onPlaceOrder}
        disabled={submitting}
        customPlaceholder="Custom ETA in minutes"
        customAriaLabel="Custom ETA in minutes"
        submitButtonLabel="Confirm placed order"
      />
    </div>
  );
}

function FallbackCandidateRow({
  candidate,
  submitting,
  placingFallbackFor,
  pingingFallbackFor,
  onPlaceFallbackOrder,
  onPingFallbackCandidate,
}: {
  candidate: FoodSelectionFallbackCandidate;
  submitting: boolean;
  placingFallbackFor: string | null;
  pingingFallbackFor: string | null;
  onPlaceFallbackOrder: (candidate: FoodSelectionFallbackCandidate) => void;
  onPingFallbackCandidate: (candidate: FoodSelectionFallbackCandidate) => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded border border-warning bg-surface px-3 py-2">
      <div className="text-sm text-fg">
        <span className="font-medium">{candidate.nickname}</span>
        <span className="ml-2 rounded bg-warning-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warning-fg">Default meal configured</span>
        <span className="ml-2 text-fg-muted">{candidate.itemNumber ? `${candidate.itemNumber} ` : ''}{candidate.itemName}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onPingFallbackCandidate(candidate)} disabled={pingingFallbackFor === candidate.nickname || submitting} className="rounded border border-warning bg-surface px-3 py-1.5 text-xs font-medium text-warning-fg hover:bg-warning-soft disabled:opacity-50">
          {pingingFallbackFor === candidate.nickname ? 'Pinging...' : 'Ping user'}
        </button>
        <button type="button" onClick={() => onPlaceFallbackOrder(candidate)} disabled={placingFallbackFor === candidate.nickname || submitting} className="rounded bg-warning-solid px-3 py-1.5 text-xs font-medium text-warning-on hover:opacity-90 disabled:opacity-50">
          Place default meal
        </button>
      </div>
    </li>
  );
}

function FallbackCandidatesPanel({
  candidates,
  loading,
  success,
  error,
  submitting,
  placingFallbackFor,
  pingingFallbackFor,
  onPlaceFallbackOrder,
  onPingFallbackCandidate,
}: {
  candidates: FoodSelectionFallbackCandidate[];
  loading: boolean;
  success: string;
  error: string;
  submitting: boolean;
  placingFallbackFor: string | null;
  pingingFallbackFor: string | null;
  onPlaceFallbackOrder: (candidate: FoodSelectionFallbackCandidate) => void;
  onPingFallbackCandidate: (candidate: FoodSelectionFallbackCandidate) => void;
}) {
  return (
    <div className="rounded border border-warning bg-warning-soft p-4">
      <h3 className="text-sm font-semibold text-warning-fg">Missing voters with fallback meals ({candidates.length})</h3>
      {loading ? <p className="mt-2 text-sm text-warning-fg">Loading fallback meal options...</p> : null}
      {!loading && candidates.length === 0 ? <p className="mt-2 text-sm italic text-warning-fg">No eligible fallback meals right now.</p> : null}
      {!loading && candidates.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {candidates.map((candidate) => (
            <FallbackCandidateRow key={candidate.nickname} candidate={candidate} submitting={submitting} placingFallbackFor={placingFallbackFor} pingingFallbackFor={pingingFallbackFor} onPlaceFallbackOrder={onPlaceFallbackOrder} onPingFallbackCandidate={onPingFallbackCandidate} />
          ))}
        </ul>
      ) : null}
      {success ? <p className="mt-2 text-xs text-success-fg">{success}</p> : null}
      {error ? <p className="mt-2 text-xs text-danger-fg">{error}</p> : null}
    </div>
  );
}

export default function FoodSelectionOrderingView() {
  const { activeFoodSelection, menus } = useAppState();
  const actorLabel = getAuthenticatedDisplayLabel();
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
  const normalizedNickname = actorLabel?.trim().toLowerCase() ?? null;
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
      await api.placeDeliveryOrder(selection.id, value, actorLabel ?? undefined);
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
      await api.claimOrderingResponsibility(selection.id, actorLabel ?? undefined);
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
      await api.setOrderProcessed(selection.id, orderId, processed, actorLabel ?? undefined);
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
        actingNickname: actorLabel ?? undefined,
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
        actingNickname: actorLabel ?? undefined,
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

          <OrderingContactCard menu={selectionMenu} />

          {error && <p className="mb-4 text-sm text-danger-fg">{error}</p>}

          <OrderingClaimPanel
            isClaimed={isClaimed}
            isClaimedByMe={isClaimedByMe}
            orderingOwner={orderingOwner}
            etaMinutes={etaMinutes}
            claimingOrder={claimingOrder}
            submitting={submitting}
            onClaimOrdering={() => void handleClaimOrdering()}
            onPlaceOrder={handlePlaceOrder}
          />

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
            <FallbackCandidatesPanel
              candidates={fallbackCandidates}
              loading={fallbackLoading}
              success={fallbackSuccess}
              error={fallbackError}
              submitting={submitting}
              placingFallbackFor={placingFallbackFor}
              pingingFallbackFor={pingingFallbackFor}
              onPlaceFallbackOrder={(candidate) => void handlePlaceFallbackOrder(candidate)}
              onPingFallbackCandidate={(candidate) => void handlePingFallbackCandidate(candidate)}
            />
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
