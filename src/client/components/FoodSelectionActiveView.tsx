import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppState } from '../context/AppContext.js';
import { useCountdown, formatTime } from '../hooks/useCountdown.js';
import * as api from '../api.js';
import TimerActionHeader from './TimerActionHeader.js';
import { formatPrice } from '../utils/orderCopy.js';
import {
  getAuthenticatedActorKey,
  getAuthenticatedDisplayLabel,
  isAdminAuthenticatedUser,
  isCreatorAuthenticatedUser,
} from '../auth.js';
import type { UserPreferences } from '../../lib/types.js';

type ItemWarnings = {
  allergies: string[];
  dislikes: string[];
};

const EMPTY_PREFERENCES: UserPreferences = {
  userKey: '',
  allergies: [],
  dislikes: [],
  updatedAt: new Date(0).toISOString(),
};

function normalizeForMatch(value: string): string {
  return value.toLocaleLowerCase().trim();
}

function computeItemWarnings(
  item: { name: string; description: string | null },
  preferences: UserPreferences,
): ItemWarnings {
  const haystack = `${item.name} ${item.description ?? ''}`.toLocaleLowerCase();
  const allergies = preferences.allergies.filter((term) => haystack.includes(normalizeForMatch(term)));
  const dislikes = preferences.dislikes.filter((term) => haystack.includes(normalizeForMatch(term)));
  return { allergies, dislikes };
}

function formatIngredientPreferencesTooltip(preferences: UserPreferences): string {
  const ingredientsToAvoid =
    preferences.allergies.length > 0 ? preferences.allergies.join(', ') : 'None configured';
  const lessPreferred =
    preferences.dislikes.length > 0 ? preferences.dislikes.join(', ') : 'None configured';

  return [
    'Ingredient Preferences',
    `Ingredients to avoid: ${ingredientsToAvoid}`,
    `Less preferred ingredients: ${lessPreferred}`,
  ].join('\n');
}

// ─── Order form ─────────────────────────────────────────────

function OrderForm({
  selectionId,
  menuItems,
  nickname,
  existingOrders,
  itemWarningsById,
  preferences,
}: {
  selectionId: string;
  menuItems: {
    id: string;
    itemNumber?: string | null;
    name: string;
    description: string | null;
    price: number | null;
  }[];
  nickname: string;
  existingOrders: { id: string; itemId: string | null; itemName: string; notes: string | null }[];
  itemWarningsById: Map<string, ItemWarnings>;
  preferences: UserPreferences;
}) {
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
  const [itemSearch, setItemSearch] = useState('');
  const [error, setError] = useState('');
  const [addingItemId, setAddingItemId] = useState<string | null>(null);
  const [withdrawingAll, setWithdrawingAll] = useState(false);

  const filteredMenuItems = useMemo(() => {
    const normalizedSearch = itemSearch.trim().toLowerCase();
    if (normalizedSearch.length < 3) {
      return menuItems;
    }

    return menuItems.filter((item) => {
      const description = item.description?.toLowerCase() ?? '';
      return (
        item.name.toLowerCase().includes(normalizedSearch) ||
        description.includes(normalizedSearch)
      );
    });
  }, [menuItems, itemSearch]);
  const itemNumberById = useMemo(
    () =>
      new Map(
        menuItems
          .filter((item) => item.itemNumber)
          .map((item) => [item.id, item.itemNumber as string]),
      ),
    [menuItems],
  );

  const handleAddItem = async (itemId: string) => {
    const warnings = itemWarningsById.get(itemId);
    const warningLines: string[] = [];
    if (warnings && warnings.allergies.length > 0) {
      warningLines.push(`Ingredient alert: ${warnings.allergies.join(', ')}`);
    }
    if (warnings && warnings.dislikes.length > 0) {
      warningLines.push(`Preference note: ${warnings.dislikes.join(', ')}`);
    }
    if (warningLines.length > 0) {
      const shouldContinue = window.confirm(
        `${warningLines.join('\n')}\n\nDo you still want to add this meal?`,
      );
      if (!shouldContinue) {
        return;
      }
    }

    setAddingItemId(itemId);
    setError('');
    try {
      const itemNote = itemNotes[itemId]?.trim() ?? '';
      await api.placeOrder(selectionId, nickname, itemId, itemNote || undefined);
      setItemNotes((prev) => ({ ...prev, [itemId]: '' }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAddingItemId(null);
    }
  };

  const handleWithdraw = async () => {
    setWithdrawingAll(true);
    setError('');
    try {
      await api.withdrawOrder(selectionId, nickname);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWithdrawingAll(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-fg">Your order</h3>
        <Link
          to="/settings"
          aria-label="Ingredient Preferences"
          title={formatIngredientPreferencesTooltip(preferences)}
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
            person_heart
          </span>
          <span>Ingredient Preferences</span>
        </Link>
      </div>

      <input
        type="text"
        value={itemSearch}
        onChange={(e) => setItemSearch(e.target.value)}
        className="w-full rounded border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
        placeholder="Search items (min. 3 chars)"
      />

      <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
        {filteredMenuItems.map((item) => (
          <div
            key={item.id}
            className="space-y-2 rounded border border-border p-3 hover:bg-surface-muted"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm font-medium text-fg">
                {item.itemNumber && <span className="mr-1 text-fg-muted">{item.itemNumber}</span>}
                <span>{item.name}</span>
              </span>
              <span className="w-20 text-right whitespace-nowrap text-xs font-semibold text-success-fg">
                {item.price === null ? '-' : formatPrice(item.price)}
              </span>
            </div>
            <div>
              {item.description && (
                <p className="text-xs text-fg-muted">{item.description}</p>
              )}
              {itemWarningsById.get(item.id)?.allergies.length ? (
                <p className="mt-1 text-xs font-medium text-danger-fg">
                  Ingredient alert: {itemWarningsById.get(item.id)?.allergies.join(', ')}
                </p>
              ) : null}
              {itemWarningsById.get(item.id)?.dislikes.length ? (
                <p className="mt-1 text-xs font-medium text-warning-fg">
                  Preference match: {itemWarningsById.get(item.id)?.dislikes.join(', ')}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={itemNotes[item.id] ?? ''}
                onChange={(event) =>
                  setItemNotes((prev) => ({ ...prev, [item.id]: event.target.value }))
                }
                maxLength={200}
                className="min-w-0 flex-1 rounded border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
                placeholder="Size / spiciness / extras / comments"
                aria-label={`Comment for ${item.name}`}
              />
              <button
                type="button"
                onClick={() => void handleAddItem(item.id)}
                disabled={addingItemId === item.id || withdrawingAll}
                className="shrink-0 rounded bg-accent-solid px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        ))}
        {filteredMenuItems.length === 0 && (
          <p className="text-sm italic text-fg-muted">No matching items found</p>
        )}
      </div>

      {existingOrders.length > 0 && (
        <div className="space-y-1 rounded border border-accent bg-accent-soft/60 p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-accent-fg">Your added meals</h4>
          <ul className="space-y-1">
            {existingOrders.map((order) => {
              const itemNumber = order.itemId ? itemNumberById.get(order.itemId) : null;
              return (
                <li key={order.id} className="text-sm text-accent-fg">
                  {itemNumber ? `${itemNumber} ` : ''}
                  {order.itemName}
                  {order.notes ? <span className="text-xs text-accent-fg"> ({order.notes})</span> : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {error && <p className="text-sm text-danger-fg">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handleWithdraw()}
          disabled={withdrawingAll || addingItemId !== null || existingOrders.length === 0}
          className="rounded border border-danger px-4 py-2 text-sm font-medium text-danger-fg hover:bg-danger-soft disabled:opacity-50"
        >
          Withdraw
        </button>
      </div>
    </div>
  );
}

// ─── Order board ────────────────────────────────────────────

function OrderBoard({
  orders,
  selectionId,
  nickname,
  actorKey,
  priceByItemId,
  itemNumberById,
  totalPrice,
}: {
  orders: {
    id: string;
    nickname: string;
    actorKey?: string | null;
    itemId: string | null;
    itemName: string;
    notes: string | null;
  }[];
  selectionId: string;
  nickname: string;
  actorKey: string | null;
  priceByItemId: Map<string, number>;
  itemNumberById: Map<string, string>;
  totalPrice: number;
}) {
  const [removingOrderId, setRemovingOrderId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const ordersByUser = useMemo(() => {
    const grouped = new Map<string, typeof orders>();
    for (const order of orders) {
      const existing = grouped.get(order.nickname) ?? [];
      grouped.set(order.nickname, [...existing, order]);
    }
    return [...grouped.entries()].sort((left, right) => left[0].localeCompare(right[0]));
  }, [orders]);
  const uniqueUserCount = ordersByUser.length;

  const handleRemoveFromBoard = async (orderId: string) => {
    setRemovingOrderId(orderId);
    setError('');
    try {
      await api.withdrawOrder(selectionId, nickname, orderId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRemovingOrderId(null);
    }
  };

  if (orders.length === 0) {
    return <p className="text-sm italic text-fg-muted">No orders yet</p>;
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-fg">
        Orders ({orders.length} orders, {uniqueUserCount} users)
      </h3>
      <div className="max-h-[65vh] space-y-1 overflow-y-auto pr-1">
        {ordersByUser.map(([userName, userOrders]) => (
          <div key={userName} className="rounded border border-border bg-surface-muted p-2">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">
              {userName} ({userOrders.length})
            </div>
            <div className="space-y-1">
              {userOrders.map((o) => (
                <div key={o.id} className="group flex items-center justify-between gap-2 rounded bg-surface px-2 py-1.5">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate text-sm text-fg">
                      {o.itemId && itemNumberById.has(o.itemId) && (
                        <span className="mr-1 text-fg-muted">{itemNumberById.get(o.itemId)}</span>
                      )}
                      <span>{o.itemName}</span>
                    </span>
                    {o.notes && <span className="truncate text-xs text-fg-muted">({o.notes})</span>}
                  </div>
                  <div className="ml-2 flex items-center gap-2">
                    <span className="w-20 text-right whitespace-nowrap text-xs font-semibold text-success-fg">
                      {o.itemId && priceByItemId.has(o.itemId)
                        ? formatPrice(priceByItemId.get(o.itemId) as number)
                        : '-'}
                    </span>
                    {(actorKey ? o.actorKey === actorKey || (!o.actorKey && o.nickname === nickname) : o.nickname === nickname) && (
                      <button
                        type="button"
                        onClick={() => void handleRemoveFromBoard(o.id)}
                        disabled={removingOrderId === o.id}
                        className="rounded border border-border px-2 py-1 text-xs text-fg-muted opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 hover:bg-surface-muted disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-end border-t border-border pt-2">
        <span className="text-sm font-semibold text-fg">Total: {formatPrice(totalPrice)}</span>
      </div>
      {error && <p className="text-sm text-danger-fg">{error}</p>}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────

export default function FoodSelectionActiveView() {
  const { activeFoodSelection, latestCompletedPoll, menus } = useAppState();
  const nickname = getAuthenticatedDisplayLabel();
  const actorKey = getAuthenticatedActorKey();
  const remaining = useCountdown(activeFoodSelection?.endsAt);
  const [submitting, setSubmitting] = useState(false);
  const [updatingTimer, setUpdatingTimer] = useState(false);
  const [error, setError] = useState('');
  const [manualRemainingMinutes, setManualRemainingMinutes] = useState('');
  const [preferences, setPreferences] = useState<UserPreferences>(EMPTY_PREFERENCES);
  const [preferencesError, setPreferencesError] = useState('');
  const [remindingMissing, setRemindingMissing] = useState(false);
  const [reminderMessage, setReminderMessage] = useState('');
  const [reminderError, setReminderError] = useState('');
  if (!activeFoodSelection || !nickname) return null;

  const selection = activeFoodSelection;
  const canManageFoodSelection = isAdminAuthenticatedUser();
  const canAdjustFoodSelectionTimer =
    canManageFoodSelection || isCreatorAuthenticatedUser(selection.createdBy);
  const canAdvanceToOrdering = true;

  // Find the winning menu's items
  const winningMenu = menus.find((m) => m.id === selection.menuId);
  const menuItems = winningMenu?.items ?? [];
  const itemWarningsById = useMemo(
    () =>
      new Map(
        menuItems.map((item) => [item.id, computeItemWarnings(item, preferences)]),
      ),
    [menuItems, preferences],
  );
  const priceByItemId = useMemo(
    () => new Map(menuItems.filter((item) => item.price !== null).map((item) => [item.id, item.price as number])),
    [menuItems],
  );
  const itemNumberById = useMemo(
    () =>
      new Map(
        menuItems
          .filter((item) => item.itemNumber)
          .map((item) => [item.id, item.itemNumber as string]),
      ),
    [menuItems],
  );
  const totalPrice = useMemo(
    () => selection.orders.reduce((sum, order) => {
      if (!order.itemId) return sum;
      return sum + (priceByItemId.get(order.itemId) ?? 0);
    }, 0),
    [selection.orders, priceByItemId],
  );

  // Find current user's existing orders
  const myOrders = useMemo(
    () =>
      selection.orders.filter((o) =>
        actorKey ? o.actorKey === actorKey || (!o.actorKey && o.nickname === nickname) : o.nickname === nickname,
      ),
    [selection.orders, actorKey, nickname],
  );
  const votersWithoutOrder = useMemo(() => {
    if (!latestCompletedPoll || latestCompletedPoll.id !== selection.pollId) {
      return [] as string[];
    }

    const winnerMenuId = selection.menuId;
    if (!winnerMenuId) {
      return [] as string[];
    }

    const votedForWinner = new Set(
      latestCompletedPoll.votes
        .filter((vote) => vote.menuId === winnerMenuId)
        .map((vote) => vote.nickname.trim())
        .filter((name) => name.length > 0),
    );
    const alreadyOrdered = new Set(
      selection.orders.map((order) => order.nickname.trim()).filter((name) => name.length > 0),
    );

    return [...votedForWinner]
      .filter((name) => !alreadyOrdered.has(name))
      .sort((left, right) => left.localeCompare(right));
  }, [latestCompletedPoll, selection.menuId, selection.orders, selection.pollId]);

  useEffect(() => {
    let cancelled = false;
    const loadPreferences = async () => {
      setPreferencesError('');
      try {
        const loaded = await api.getUserPreferences(nickname);
        if (cancelled) return;
        setPreferences(loaded);
      } catch (err) {
        if (cancelled) return;
        setPreferencesError((err as Error).message);
      }
    };
    void loadPreferences();
    return () => {
      cancelled = true;
    };
  }, [nickname]);

  const handleFinishNow = async (): Promise<boolean> => {
    const confirmed = window.confirm('Confirm completion?');
    if (!confirmed) return false;

    setSubmitting(true);
    setError('');
    try {
      await api.completeFoodSelectionNow(selection.id);
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateTimer = async (remainingMinutes: number): Promise<boolean> => {
    setUpdatingTimer(true);
    setError('');
    try {
      await api.updateFoodSelectionTimer(selection.id, remainingMinutes);
      setManualRemainingMinutes('');
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setUpdatingTimer(false);
    }
  };

  const handleAbort = async () => {
    const confirmed = window.confirm('Abort food selection?');
    if (!confirmed) return;

    setSubmitting(true);
    setError('');
    try {
      await api.abortFoodSelection(selection.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemindMissingOrders = async () => {
    setRemindingMissing(true);
    setReminderMessage('');
    setReminderError('');
    try {
      const result = await api.remindMissingOrders(selection.id);
      if (result.remindedCount === 0) {
        setReminderMessage('No reminder recipients found.');
        return;
      }
      setReminderMessage(
        result.remindedCount === 1
          ? 'Sent 1 reminder.'
          : `Sent ${result.remindedCount} reminders.`,
      );
    } catch (err) {
      setReminderError((err as Error).message);
    } finally {
      setRemindingMissing(false);
    }
  };

  const timerOptions = Array.from({ length: 24 }, (_, index) => (index + 1) * 5);
  const totalSeconds = Math.max(
    1,
    Math.ceil((new Date(selection.endsAt).getTime() - new Date(selection.startedAt).getTime()) / 1000),
  );

  return (
    <div className="mx-auto w-full max-w-[1400px] p-4 lg:px-6">
      <TimerActionHeader
        title={
          <>
            {selection.menuName} &mdash; Food Selection
          </>
        }
        timerLabel={formatTime(remaining)}
        remainingSeconds={remaining}
        totalSeconds={totalSeconds}
        triggerAriaLabel="Food selection timer actions"
      >
        {({ closeMenu }) => (
          <>
            {canAdvanceToOrdering && (
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    const done = await handleFinishNow();
                    if (done) closeMenu();
                  })();
                }}
                disabled={submitting}
                className="block w-full border-b border-border bg-success-soft px-3 py-2 text-left text-sm font-medium text-success-fg hover:bg-success-soft disabled:opacity-60"
              >
                Finish meal collection
              </button>
            )}

            {canManageFoodSelection && (
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    await handleAbort();
                    closeMenu();
                  })();
                }}
                disabled={submitting}
                className="block w-full border-b border-border bg-danger-soft px-3 py-2 text-left text-sm font-medium text-danger-fg hover:bg-danger-soft disabled:opacity-60"
              >
                Abort process
              </button>
            )}

            {canAdjustFoodSelectionTimer ? (
              <>
                <div className="max-h-40 overflow-y-auto border-b border-border py-1">
                  {timerOptions.map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      onClick={() => {
                        void (async () => {
                          const done = await handleUpdateTimer(minutes);
                          if (done) closeMenu();
                        })();
                      }}
                      disabled={updatingTimer}
                      className="block w-full px-3 py-1.5 text-left text-sm text-fg hover:bg-surface-muted disabled:opacity-60"
                    >
                      {minutes} min
                    </button>
                  ))}
                </div>

                <div className="p-2">
                  <input
                    type="text"
                    value={manualRemainingMinutes}
                    onChange={(event) => setManualRemainingMinutes(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void (async () => {
                          const done = await handleUpdateTimer(
                            Number.parseInt(manualRemainingMinutes, 10),
                          );
                          if (done) closeMenu();
                        })();
                      }
                    }}
                    placeholder="Manual minutes remaining"
                    className="w-full rounded border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
                    aria-label="Food selection manual minutes remaining"
                  />
                </div>
              </>
            ) : (
              <p className="border-b border-border px-3 py-2 text-sm text-fg-muted">
                Only admins or the food-selection creator can adjust this timer.
              </p>
            )}
          </>
        )}
      </TimerActionHeader>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Left: Order form */}
        <div className="rounded-lg border border-border bg-surface p-4 shadow-sm xl:col-span-2">
          <OrderForm
            selectionId={selection.id}
            menuItems={menuItems}
            nickname={nickname}
            existingOrders={myOrders.map((o) => ({ id: o.id, itemId: o.itemId, itemName: o.itemName, notes: o.notes }))}
            itemWarningsById={itemWarningsById}
            preferences={preferences}
          />
        </div>

        {/* Right: Order board */}
        <div className="space-y-4 xl:col-span-1">
          <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <OrderBoard
            orders={selection.orders}
            selectionId={selection.id}
            nickname={nickname}
            actorKey={actorKey}
            priceByItemId={priceByItemId}
            itemNumberById={itemNumberById}
            totalPrice={totalPrice}
          />
          </div>
          <div className="rounded-lg border border-accent bg-accent-soft p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-accent-fg">Recommended next action</h3>
            {votersWithoutOrder.length === 0 ? (
              <div className="mt-2 space-y-2">
                <p className="text-sm text-accent-fg">
                  Everyone who voted has ordered. Click below when you have placed the real order.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    void handleFinishNow();
                  }}
                  disabled={submitting}
                  className="w-full rounded bg-success-solid px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  Click here when you place the order.
                </button>
              </div>
            ) : (
              <>
                <h4 className="text-sm font-semibold text-accent-fg">
                  Voted for menu but not ordered yet ({votersWithoutOrder.length})
                </h4>
                <p className="mt-1 text-xs text-accent-fg">
                  CTA: remind these people personally, or use the reminder function below.
                </p>
                <ul className="mt-2 space-y-1">
                  {votersWithoutOrder.map((name) => (
                    <li key={name} className="text-sm text-accent-fg">
                      {name}
                    </li>
                  ))}
                </ul>
                {canManageFoodSelection ? (
                  <div className="mt-3 space-y-2">
                    <button
                      type="button"
                      onClick={() => void handleRemindMissingOrders()}
                      disabled={remindingMissing || votersWithoutOrder.length === 0}
                      className="rounded bg-accent-solid px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {remindingMissing ? 'Sending reminders...' : 'Ping missing users'}
                    </button>
                    {reminderMessage ? <p className="text-xs text-success-fg">{reminderMessage}</p> : null}
                    {reminderError ? <p className="text-xs text-danger-fg">{reminderError}</p> : null}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-accent-fg">
                    Personal reminders are available to everyone. Automatic reminder sending is admin-only.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {preferencesError && <p className="mt-4 text-sm text-danger-fg">{preferencesError}</p>}
      {error && <p className="mt-4 text-sm text-danger-fg">{error}</p>}
    </div>
  );
}
