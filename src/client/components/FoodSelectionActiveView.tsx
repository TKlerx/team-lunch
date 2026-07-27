import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAppState } from "../context/AppContext.js";
import { useToast } from "../context/ToastContext.js";
import { useCountdown, formatTime } from "../hooks/useCountdown.js";
import * as api from "../api.js";
import TimerActionHeader from "./TimerActionHeader.js";
import MealOnboardingDialog from "./MealOnboardingDialog.js";
import { Button } from "./ui/Button.js";
import { Input } from "./ui/Input.js";
import { useConfirmDialog } from "./ui/ConfirmDialog.js";
import { formatPrice } from "../utils/orderCopy.js";
import { getErrorMessage } from "../lib/errorMessage.js";
import {
  getFoodSelectionVisibleTags,
  isBeverageMenuItem,
  matchesAnySelectedTag,
} from "../../lib/menuItemTags.js";
import {
  getAuthenticatedActorKey,
  getAuthenticatedDisplayLabel,
  isAdminAuthenticatedUser,
  isCreatorAuthenticatedUser,
} from "../auth.js";
import type {
  MealAnticipatedLikeSentiment,
  MealRecommendationMark,
  MealRecommendationOnboardingCandidate,
  MealRecommendationResponse,
  UserPreferences,
} from "../../lib/types.js";

type ItemWarnings = {
  allergies: string[];
  dislikes: string[];
};

const EMPTY_PREFERENCES: UserPreferences = {
  userKey: "",
  allergies: [],
  dislikes: [],
  explorationRate: 0.5,
  recommendationCount: 3,
  updatedAt: new Date(0).toISOString(),
};

function normalizeForMatch(value: string): string {
  return value.toLocaleLowerCase().trim();
}

function computeItemWarnings(
  item: { name: string; description: string | null },
  preferences: UserPreferences,
): ItemWarnings {
  const haystack = `${item.name} ${item.description ?? ""}`.toLocaleLowerCase();
  const allergies = preferences.allergies.filter((term) =>
    haystack.includes(normalizeForMatch(term)),
  );
  const dislikes = preferences.dislikes.filter((term) =>
    haystack.includes(normalizeForMatch(term)),
  );
  return { allergies, dislikes };
}

function formatIngredientPreferencesTooltip(
  preferences: UserPreferences,
): string {
  const ingredientsToAvoid =
    preferences.allergies.length > 0
      ? preferences.allergies.join(", ")
      : "None configured";
  const lessPreferred =
    preferences.dislikes.length > 0
      ? preferences.dislikes.join(", ")
      : "None configured";

  return [
    "Ingredient Preferences",
    `Ingredients to avoid: ${ingredientsToAvoid}`,
    `Less preferred ingredients: ${lessPreferred}`,
  ].join("\n");
}

// ─── Order form ─────────────────────────────────────────────

type OrderMenuItem = {
  id: string;
  itemNumber?: string | null;
  name: string;
  description: string | null;
  price: number | null;
  tags: string[];
};

type ExistingOrder = {
  id: string;
  itemId: string | null;
  itemName: string;
  notes: string | null;
};

type OrderFormProps = {
  selectionId: string;
  menuItems: OrderMenuItem[];
  nickname: string;
  existingOrders: ExistingOrder[];
  itemWarningsById: Map<string, ItemWarnings>;
  preferences: UserPreferences;
  mealMarksByItemId: Map<string, MealRecommendationMark>;
  marksLoading: boolean;
  markingItemId: string | null;
  onToggleMealMark: (
    itemId: string,
    sentiment: MealAnticipatedLikeSentiment,
  ) => void;
};

type OrderItemCardProps = {
  item: OrderMenuItem;
  note: string;
  warnings: ItemWarnings | undefined;
  mark: MealRecommendationMark | undefined;
  adding: boolean;
  disabled: boolean;
  marksLoading: boolean;
  onNoteChange: (itemId: string, value: string) => void;
  onAdd: (itemId: string) => void;
  onToggleMealMark: (itemId: string, sentiment: MealAnticipatedLikeSentiment) => void;
};

function OrderItemCard({
  item,
  note,
  warnings,
  mark,
  adding,
  disabled,
  marksLoading,
  onNoteChange,
  onAdd,
  onToggleMealMark,
}: OrderItemCardProps) {
  const visibleTags = getFoodSelectionVisibleTags(item);
  return (
    <div id={`meal-item-${item.id}`} tabIndex={-1} className="space-y-2 rounded border border-border p-3 hover:bg-surface-muted">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
        <span className="truncate text-sm font-medium text-fg">
          {item.itemNumber && <span className="mr-1 text-fg-muted">{item.itemNumber}</span>}
          <span>{item.name}</span>
        </span>
        <span className="text-right text-xs font-semibold text-success-fg sm:w-20 sm:whitespace-nowrap">
          {item.price === null ? "-" : formatPrice(item.price)}
        </span>
      </div>
      <div>
        {item.description && <p className="text-xs text-fg-muted">{item.description}</p>}
        {visibleTags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {visibleTags.map((tag) => (
              <span key={tag} className="rounded-full bg-accent-soft/40 px-1.5 py-0.5 text-[10px] font-medium text-fg-muted">
                {tag}
              </span>
            ))}
          </div>
        )}
        {warnings?.allergies.length ? (
          <p className="mt-1 text-xs font-medium text-danger-fg">
            Ingredient alert: {warnings.allergies.join(", ")}
          </p>
        ) : null}
        {warnings?.dislikes.length ? (
          <p className="mt-1 text-xs font-medium text-warning-fg">
            Preference match: {warnings.dislikes.join(", ")}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={note}
          onChange={(event) => onNoteChange(item.id, event.target.value)}
          maxLength={200}
          className="min-w-0 flex-1"
          placeholder="Size / spiciness / extras / comments"
          aria-label={`Comment for ${item.name}`}
        />
        <Button onClick={() => onAdd(item.id)} disabled={adding || disabled} className="w-full shrink-0 px-3 sm:w-auto">
          Add
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {mark ? (
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
            mark.sentiment === "like" ? "bg-success-soft text-success-fg" : "bg-warning-soft text-warning-fg"
          }`}
          >
            Marked {mark.sentiment}
          </span>
        ) : (
          <span className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">Mark this dish</span>
        )}
        <Button
          variant="secondary"
          onClick={() => onToggleMealMark(item.id, "like")}
          disabled={disabled || marksLoading}
          className={`px-2.5 py-1 text-xs ${mark?.sentiment === "like" ? "border-success bg-success-soft text-success-fg" : "text-fg-muted"}`}
          aria-label={`Like ${item.name}`}
        >
          Like
        </Button>
        <Button
          variant="secondary"
          onClick={() => onToggleMealMark(item.id, "dislike")}
          disabled={disabled || marksLoading}
          className={`px-2.5 py-1 text-xs ${mark?.sentiment === "dislike" ? "border-warning bg-warning-soft text-warning-fg" : "text-fg-muted"}`}
          aria-label={`Dislike ${item.name}`}
        >
          Dislike
        </Button>
        {mark ? (
          <Button
            variant="secondary"
            onClick={() => onToggleMealMark(item.id, mark.sentiment)}
            disabled={disabled || marksLoading}
            className="px-2.5 py-1 text-xs text-fg-muted"
            aria-label={`Clear mark for ${item.name}`}
          >
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function OrderForm({
  selectionId,
  menuItems,
  nickname,
  existingOrders,
  itemWarningsById,
  preferences,
  mealMarksByItemId,
  marksLoading,
  markingItemId,
  onToggleMealMark,
}: OrderFormProps) {
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
  const [itemSearch, setItemSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"meal" | "beverage">("meal");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(() => new Set());
  const [addingItemId, setAddingItemId] = useState<string | null>(null);
  const [withdrawingAll, setWithdrawingAll] = useState(false);
  const { confirm, dialog } = useConfirmDialog();
  const { showToast } = useToast();

  const tabMenuItems = useMemo(
    () => menuItems.filter((item) => isBeverageMenuItem(item) === (activeTab === "beverage")),
    [activeTab, menuItems],
  );
  const availableTags = useMemo(
    () => Array.from(new Set(tabMenuItems.flatMap(getFoodSelectionVisibleTags))).sort(),
    [tabMenuItems],
  );
  const filteredMenuItems = useMemo(() => {
    const normalizedSearch = itemSearch.trim().toLowerCase();
    return tabMenuItems.filter((item) => {
      const description = item.description?.toLowerCase() ?? "";
      const matchesSearch = normalizedSearch.length < 3
        || item.name.toLowerCase().includes(normalizedSearch)
        || description.includes(normalizedSearch);
      return matchesSearch && matchesAnySelectedTag(item, selectedTags);
    });
  }, [itemSearch, selectedTags, tabMenuItems]);
  const itemNumberById = useMemo(
    () =>
      new Map(
        menuItems
          .filter((item) => item.itemNumber)
          .map((item) => [item.id, item.itemNumber as string]),
      ),
    [menuItems],
  );

  const toggleSelectedTag = (tag: string) => {
    setSelectedTags((current) => {
      const next = new Set(current);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const switchTab = (tab: "meal" | "beverage") => {
    setActiveTab(tab);
    setSelectedTags(new Set());
  };

  const handleAddItem = async (itemId: string) => {
    const warnings = itemWarningsById.get(itemId);
    const warningLines: string[] = [];
    if (warnings && warnings.allergies.length > 0) {
      warningLines.push(`Ingredient alert: ${warnings.allergies.join(", ")}`);
    }
    if (warnings && warnings.dislikes.length > 0) {
      warningLines.push(`Preference note: ${warnings.dislikes.join(", ")}`);
    }
    if (warningLines.length > 0) {
      const shouldContinue = await confirm({
        title: "Add this meal anyway?",
        consequenceText: warningLines.join("\n"),
        confirmLabel: "Add meal",
      });
      if (!shouldContinue) {
        return;
      }
    }

    setAddingItemId(itemId);
    try {
      const itemNote = itemNotes[itemId]?.trim() ?? "";
      await api.placeOrder(
        selectionId,
        nickname,
        itemId,
        itemNote || undefined,
      );
      setItemNotes((prev) => ({ ...prev, [itemId]: "" }));
    } catch (err) {
      showToast({ tone: "error", message: getErrorMessage(err, "Could not add this meal") });
    } finally {
      setAddingItemId(null);
    }
  };

  const handleWithdraw = async () => {
    setWithdrawingAll(true);
    try {
      await api.withdrawOrder(selectionId, nickname);
    } catch (err) {
      showToast({ tone: "error", message: getErrorMessage(err, "Could not withdraw your order") });
    } finally {
      setWithdrawingAll(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-fg">Your order</h3>
        <Link
          to="/settings"
          aria-label="Ingredient Preferences"
          title={formatIngredientPreferencesTooltip(preferences)}
          className="inline-flex min-h-9 w-full shrink-0 items-center justify-center gap-1.5 rounded border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:w-auto"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.49 4.04 3 5.5l7 7Z" />
          </svg>
          <span>Ingredient Preferences</span>
        </Link>
      </div>

      <div className="flex rounded-lg border border-border bg-surface-muted p-1" role="tablist" aria-label="Menu item type">
        {(["meal", "beverage"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => switchTab(tab)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
              activeTab === tab ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {availableTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Filter tags">
          {availableTags.map((tag) => (
            <button
              key={tag}
              type="button"
              aria-pressed={selectedTags.has(tag)}
              onClick={() => toggleSelectedTag(tag)}
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                selectedTags.has(tag)
                  ? "border-accent bg-accent-soft text-accent-fg"
                  : "border-transparent bg-surface-muted text-fg-muted hover:text-fg"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      <Input
        value={itemSearch}
        onChange={(e) => setItemSearch(e.target.value)}
        placeholder="Search items (min. 3 chars)"
      />

      <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
        {filteredMenuItems.map((item) => (
          <OrderItemCard
            key={item.id}
            item={item}
            note={itemNotes[item.id] ?? ""}
            warnings={itemWarningsById.get(item.id)}
            mark={mealMarksByItemId.get(item.id)}
            adding={addingItemId === item.id}
            disabled={withdrawingAll || markingItemId === item.id}
            marksLoading={marksLoading}
            onNoteChange={(itemId, value) => setItemNotes((prev) => ({ ...prev, [itemId]: value }))}
            onAdd={(itemId) => void handleAddItem(itemId)}
            onToggleMealMark={(itemId, sentiment) => void onToggleMealMark(itemId, sentiment)}
          />
        ))}
        {filteredMenuItems.length === 0 && (
          <p className="text-sm italic text-fg-muted">
            No matching items found
          </p>
        )}
      </div>

      {existingOrders.length > 0 && (
        <div className="space-y-1 rounded border border-accent bg-accent-soft/60 p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-accent-fg">
            Your added meals
          </h4>
          <ul className="space-y-1">
            {existingOrders.map((order) => {
              const itemNumber = order.itemId
                ? itemNumberById.get(order.itemId)
                : null;
              return (
                <li key={order.id} className="text-sm text-accent-fg">
                  {itemNumber ? `${itemNumber} ` : ""}
                  {order.itemName}
                  {order.notes ? (
                    <span className="text-xs text-accent-fg">
                      {" "}
                      ({order.notes})
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="danger"
          onClick={() => void handleWithdraw()}
          disabled={
            withdrawingAll ||
            addingItemId !== null ||
            existingOrders.length === 0
          }
        >
          Withdraw
        </Button>
      </div>
      {dialog}
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
  const { showToast } = useToast();
  const ordersByUser = useMemo(() => {
    const grouped = new Map<string, typeof orders>();
    for (const order of orders) {
      const existing = grouped.get(order.nickname) ?? [];
      grouped.set(order.nickname, [...existing, order]);
    }
    return [...grouped.entries()].sort((left, right) =>
      left[0].localeCompare(right[0]),
    );
  }, [orders]);
  const uniqueUserCount = ordersByUser.length;

  const handleRemoveFromBoard = async (orderId: string) => {
    setRemovingOrderId(orderId);
    try {
      await api.withdrawOrder(selectionId, nickname, orderId);
    } catch (err) {
      showToast({ tone: "error", message: getErrorMessage(err, "Could not remove that order") });
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
          <div
            key={userName}
            className="rounded border border-border bg-surface-muted p-2"
          >
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">
              {userName} ({userOrders.length})
            </div>
            <div className="space-y-1">
              {userOrders.map((o) => (
                <div
                  key={o.id}
                  className="group flex flex-col gap-2 rounded bg-surface px-2 py-1.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-2">
                    <span className="truncate text-sm text-fg">
                      {o.itemId && itemNumberById.has(o.itemId) && (
                        <span className="mr-1 text-fg-muted">
                          {itemNumberById.get(o.itemId)}
                        </span>
                      )}
                      <span>{o.itemName}</span>
                    </span>
                    {o.notes && (
                      <span className="truncate text-xs text-fg-muted">
                        ({o.notes})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 sm:ml-2 sm:justify-end">
                    <span className="text-right text-xs font-semibold text-success-fg sm:w-20 sm:whitespace-nowrap">
                      {o.itemId && priceByItemId.has(o.itemId)
                        ? formatPrice(priceByItemId.get(o.itemId) as number)
                        : "-"}
                    </span>
                    {(actorKey
                      ? o.actorKey === actorKey ||
                        (!o.actorKey && o.nickname === nickname)
                      : o.nickname === nickname) && (
                      <Button
                        variant="secondary"
                        onClick={() => void handleRemoveFromBoard(o.id)}
                        disabled={removingOrderId === o.id}
                        className="min-h-9 px-2 py-1 text-xs text-fg-muted opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-end border-t border-border pt-2">
        <span className="text-sm font-semibold text-fg">
          Total: {formatPrice(totalPrice)}
        </span>
      </div>
    </div>
  );
}

function MealRecommendationsList({
  recommendations,
  onJumpToMeal,
}: {
  recommendations: MealRecommendationResponse;
  onJumpToMeal: (itemId: string) => void;
}) {
  return (
    <div className="mt-3 space-y-2">
      {recommendations.source === "ai_assisted" && (
        <p className="text-xs font-medium text-accent-fg">
          AI-assisted suggestions
        </p>
      )}
      {recommendations.source === "explore" && (
        <p className="text-xs font-medium text-warning-fg">
          Exploratory suggestions
        </p>
      )}
      {recommendations.source === "safe_learned" && (
        <p className="text-xs font-medium text-accent-fg">
          Learned suggestions
        </p>
      )}
      {recommendations.warnings.map((warning) => (
        <p key={warning} className="text-xs text-warning-fg">
          {warning}
        </p>
      ))}
      <ul className="space-y-2">
        {recommendations.items.map((item) => (
          <li
            key={item.itemId ?? item.itemName}
            className="rounded border border-border"
          >
            <Button
              variant="ghost"
              onClick={() => item.itemId && onJumpToMeal(item.itemId)}
              disabled={!item.itemId}
              className="block w-full p-2 text-left disabled:cursor-default disabled:hover:bg-transparent"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-fg">
                  #{item.rank} {item.itemName}
                </span>
                <span className="text-xs text-fg-muted">Score: {item.score}</span>
              </span>
              <span className="mt-1 block text-xs text-fg-muted">
                {item.reason}
                {item.aiAssisted && (
                  <span className="ml-1 text-accent-fg">(AI-assisted)</span>
                )}
              </span>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MealRecommendationsPanel({
  recommendations,
  recommendationsLoading,
  recommendationsLoadingAction,
  recommendationsError,
  onRecommendMeal,
  onExploreMeal,
  onOpenOnboarding,
  onJumpToMeal,
}: {
  recommendations: MealRecommendationResponse | null;
  recommendationsLoading: boolean;
  recommendationsLoadingAction: "recommend" | "explore" | null;
  recommendationsError: string;
  onRecommendMeal: () => void;
  onExploreMeal: () => void;
  onOpenOnboarding: () => void;
  onJumpToMeal: (itemId: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h3 className="text-sm font-semibold text-fg">Meal recommendations</h3>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <Button
            onClick={onRecommendMeal}
            disabled={recommendationsLoading}
            className="w-full px-3 py-1.5 sm:w-auto"
          >
            {recommendationsLoading &&
            recommendationsLoadingAction === "recommend"
              ? "Thinking..."
              : "Recommend a meal"}
          </Button>
          <Button
            variant="warning"
            onClick={onExploreMeal}
            disabled={recommendationsLoading}
            className="w-full px-3 py-1.5 sm:w-auto"
          >
            {recommendationsLoading &&
            recommendationsLoadingAction === "explore"
              ? "Exploring..."
              : "Explore something new"}
          </Button>
          <Button
            variant="secondary"
            onClick={onOpenOnboarding}
            className="w-full border-accent px-3 py-1.5 text-accent-fg hover:bg-accent-soft sm:w-auto"
          >
            Mark dishes you expect to like
          </Button>
        </div>
      </div>
      {recommendationsError && (
        <p className="mt-2 text-sm text-danger-fg">{recommendationsError}</p>
      )}
      {recommendations ? (
        <MealRecommendationsList recommendations={recommendations} onJumpToMeal={onJumpToMeal} />
      ) : null}
    </div>
  );
}

function MissingOrdersEmptyState({
  submitting,
  onFinishNow,
}: {
  submitting: boolean;
  onFinishNow: () => void;
}) {
  return (
    <div className="mt-2 space-y-2">
      <p className="text-sm text-accent-fg">
        Everyone who voted has ordered. Click below when you have placed the
        real order.
      </p>
      <Button
        variant="success-solid"
        onClick={onFinishNow}
        disabled={submitting}
        className="w-full px-3"
      >
        Click here when you place the order.
      </Button>
    </div>
  );
}

function MissingOrdersReminderControls({
  votersWithoutOrderCount,
  remindingMissing,
  reminderMessage,
  reminderError,
  onRemindMissingOrders,
}: {
  votersWithoutOrderCount: number;
  remindingMissing: boolean;
  reminderMessage: string;
  reminderError: string;
  onRemindMissingOrders: () => void;
}) {
  return (
    <div className="mt-3 space-y-2">
      <Button
        onClick={onRemindMissingOrders}
        disabled={remindingMissing || votersWithoutOrderCount === 0}
        className="w-full px-3 py-1.5 sm:w-auto"
      >
        {remindingMissing ? "Sending reminders..." : "Ping missing users"}
      </Button>
      {reminderMessage ? (
        <p className="text-xs text-success-fg">{reminderMessage}</p>
      ) : null}
      {reminderError ? (
        <p className="text-xs text-danger-fg">{reminderError}</p>
      ) : null}
    </div>
  );
}

function MissingOrdersList({
  votersWithoutOrder,
  canManageFoodSelection,
  remindingMissing,
  reminderMessage,
  reminderError,
  onRemindMissingOrders,
}: {
  votersWithoutOrder: string[];
  canManageFoodSelection: boolean;
  remindingMissing: boolean;
  reminderMessage: string;
  reminderError: string;
  onRemindMissingOrders: () => void;
}) {
  return (
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
        <MissingOrdersReminderControls
          votersWithoutOrderCount={votersWithoutOrder.length}
          remindingMissing={remindingMissing}
          reminderMessage={reminderMessage}
          reminderError={reminderError}
          onRemindMissingOrders={onRemindMissingOrders}
        />
      ) : (
        <p className="mt-2 text-xs text-accent-fg">
          Personal reminders are available to everyone. Automatic reminder
          sending is admin-only.
        </p>
      )}
    </>
  );
}

function MissingOrdersPanel({
  votersWithoutOrder,
  canManageFoodSelection,
  submitting,
  remindingMissing,
  reminderMessage,
  reminderError,
  onFinishNow,
  onRemindMissingOrders,
}: {
  votersWithoutOrder: string[];
  canManageFoodSelection: boolean;
  submitting: boolean;
  remindingMissing: boolean;
  reminderMessage: string;
  reminderError: string;
  onFinishNow: () => void;
  onRemindMissingOrders: () => void;
}) {
  return (
    <div className="rounded-lg border border-accent bg-accent-soft p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-accent-fg">
        Recommended next action
      </h3>
      {votersWithoutOrder.length === 0 ? (
        <MissingOrdersEmptyState
          submitting={submitting}
          onFinishNow={onFinishNow}
        />
      ) : (
        <MissingOrdersList
          votersWithoutOrder={votersWithoutOrder}
          canManageFoodSelection={canManageFoodSelection}
          remindingMissing={remindingMissing}
          reminderMessage={reminderMessage}
          reminderError={reminderError}
          onRemindMissingOrders={onRemindMissingOrders}
        />
      )}
    </div>
  );
}

function TimerMinuteOptions({
  timerOptions,
  updatingTimer,
  onSelectMinutes,
}: {
  timerOptions: number[];
  updatingTimer: boolean;
  onSelectMinutes: (minutes: number) => void;
}) {
  return (
    <div className="max-h-40 overflow-y-auto border-b border-border py-1">
      {timerOptions.map((minutes) => (
        <Button
          key={minutes}
          variant="ghost"
          onClick={() => onSelectMinutes(minutes)}
          disabled={updatingTimer}
          className="w-full rounded-none px-3 py-1.5 text-left text-fg"
        >
          {minutes} min
        </Button>
      ))}
    </div>
  );
}

function ManualTimerInput({
  manualRemainingMinutes,
  onManualRemainingMinutesChange,
  onSubmitManualMinutes,
}: {
  manualRemainingMinutes: string;
  onManualRemainingMinutesChange: (value: string) => void;
  onSubmitManualMinutes: () => void;
}) {
  return (
    <div className="p-2">
      <Input
        value={manualRemainingMinutes}
        onChange={(event) => onManualRemainingMinutesChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSubmitManualMinutes();
          }
        }}
        placeholder="Manual minutes remaining"
        className="px-2 py-1.5"
        aria-label="Food selection manual minutes remaining"
      />
    </div>
  );
}

function FoodSelectionTimerActions({
  selection,
  remaining,
  totalSeconds,
  canAdvanceToOrdering,
  canManageFoodSelection,
  canAdjustFoodSelectionTimer,
  submitting,
  updatingTimer,
  manualRemainingMinutes,
  timerOptions,
  onFinishNow,
  onAbort,
  onUpdateTimer,
  onManualRemainingMinutesChange,
}: {
  selection: { menuName: string };
  remaining: number;
  totalSeconds: number;
  canAdvanceToOrdering: boolean;
  canManageFoodSelection: boolean;
  canAdjustFoodSelectionTimer: boolean;
  submitting: boolean;
  updatingTimer: boolean;
  manualRemainingMinutes: string;
  timerOptions: number[];
  onFinishNow: () => Promise<boolean>;
  onAbort: () => Promise<void>;
  onUpdateTimer: (remainingMinutes: number) => Promise<boolean>;
  onManualRemainingMinutesChange: (value: string) => void;
}) {
  return (
    <TimerActionHeader
      title={<>{selection.menuName} &mdash; Food Selection</>}
      timerLabel={formatTime(remaining)}
      remainingSeconds={remaining}
      totalSeconds={totalSeconds}
      triggerAriaLabel="Food selection timer actions"
    >
      {({ closeMenu }) => (
        <FoodSelectionTimerMenu
          closeMenu={closeMenu}
          canAdvanceToOrdering={canAdvanceToOrdering}
          canManageFoodSelection={canManageFoodSelection}
          canAdjustFoodSelectionTimer={canAdjustFoodSelectionTimer}
          submitting={submitting}
          updatingTimer={updatingTimer}
          manualRemainingMinutes={manualRemainingMinutes}
          timerOptions={timerOptions}
          onFinishNow={onFinishNow}
          onAbort={onAbort}
          onUpdateTimer={onUpdateTimer}
          onManualRemainingMinutesChange={onManualRemainingMinutesChange}
        />
      )}
    </TimerActionHeader>
  );
}

function FoodSelectionTimerMenu({
  closeMenu,
  canAdvanceToOrdering,
  canManageFoodSelection,
  canAdjustFoodSelectionTimer,
  submitting,
  updatingTimer,
  manualRemainingMinutes,
  timerOptions,
  onFinishNow,
  onAbort,
  onUpdateTimer,
  onManualRemainingMinutesChange,
}: {
  closeMenu: () => void;
  canAdvanceToOrdering: boolean;
  canManageFoodSelection: boolean;
  canAdjustFoodSelectionTimer: boolean;
  submitting: boolean;
  updatingTimer: boolean;
  manualRemainingMinutes: string;
  timerOptions: number[];
  onFinishNow: () => Promise<boolean>;
  onAbort: () => Promise<void>;
  onUpdateTimer: (remainingMinutes: number) => Promise<boolean>;
  onManualRemainingMinutesChange: (value: string) => void;
}) {
  const updateTimerAndClose = (minutes: number) => {
    void (async () => {
      const done = await onUpdateTimer(minutes);
      if (done) closeMenu();
    })();
  };

  return (
    <>
      {canAdvanceToOrdering && (
        <Button
          variant="success"
          onClick={() => {
            void (async () => {
              const done = await onFinishNow();
              if (done) closeMenu();
            })();
          }}
          disabled={submitting}
          className="w-full rounded-none border-x-0 border-t-0 px-3 text-left"
        >
          Finish meal collection
        </Button>
      )}
      {canManageFoodSelection && (
        <Button
          variant="danger"
          onClick={() => {
            void (async () => {
              await onAbort();
              closeMenu();
            })();
          }}
          disabled={submitting}
          className="w-full rounded-none border-x-0 border-t-0 px-3 text-left"
        >
          Abort process
        </Button>
      )}
      {canAdjustFoodSelectionTimer ? (
        <>
          <TimerMinuteOptions
            timerOptions={timerOptions}
            updatingTimer={updatingTimer}
            onSelectMinutes={updateTimerAndClose}
          />
          <ManualTimerInput
            manualRemainingMinutes={manualRemainingMinutes}
            onManualRemainingMinutesChange={onManualRemainingMinutesChange}
            onSubmitManualMinutes={() =>
              updateTimerAndClose(Number.parseInt(manualRemainingMinutes, 10))
            }
          />
        </>
      ) : (
        <p className="border-b border-border px-3 py-2 text-sm text-fg-muted">
          Only admins or the food-selection creator can adjust this timer.
        </p>
      )}
    </>
  );
}

function useUserPreferences(userKey: string) {
  const [preferences, setPreferences] =
    useState<UserPreferences>(EMPTY_PREFERENCES);
  const [preferencesError, setPreferencesError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const loadPreferences = async () => {
      setPreferencesError("");
      try {
        const loaded = await api.getUserPreferences(userKey);
        if (!cancelled) setPreferences(loaded);
      } catch (err) {
        if (!cancelled) setPreferencesError((err as Error).message);
      }
    };
    void loadPreferences();
    return () => {
      cancelled = true;
    };
  }, [userKey]);

  return { preferences, preferencesError };
}

function useMealRecommendations(selectionId: string) {
  const [recommendations, setRecommendations] =
    useState<MealRecommendationResponse | null>(null);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [recommendationsLoadingAction, setRecommendationsLoadingAction] =
    useState<"recommend" | "explore" | null>(null);
  const [recommendationsError, setRecommendationsError] = useState("");

  const loadRecommendations = async (action: "recommend" | "explore") => {
    setRecommendationsLoadingAction(action);
    setRecommendationsLoading(true);
    setRecommendationsError("");
    try {
      const result =
        action === "recommend"
          ? await api.recommendMeal(selectionId)
          : await api.exploreMeal(selectionId);
      setRecommendations(result);
    } catch (err) {
      setRecommendationsError((err as Error).message);
    } finally {
      setRecommendationsLoading(false);
      setRecommendationsLoadingAction(null);
    }
  };

  return {
    recommendations,
    recommendationsLoading,
    recommendationsLoadingAction,
    recommendationsError,
    recommendMeal: () => loadRecommendations("recommend"),
    exploreMeal: () => loadRecommendations("explore"),
  };
}

function useMissingOrderReminder(selectionId: string) {
  const [remindingMissing, setRemindingMissing] = useState(false);
  const [reminderMessage, setReminderMessage] = useState("");
  const [reminderError, setReminderError] = useState("");

  const remindMissingOrders = async () => {
    setRemindingMissing(true);
    setReminderMessage("");
    setReminderError("");
    try {
      const result = await api.remindMissingOrders(selectionId);
      setReminderMessage(
        result.remindedCount === 0
          ? "No reminder recipients found."
          : result.remindedCount === 1
            ? "Sent 1 reminder."
            : `Sent ${result.remindedCount} reminders.`,
      );
    } catch (err) {
      setReminderError((err as Error).message);
    } finally {
      setRemindingMissing(false);
    }
  };

  return {
    remindingMissing,
    reminderMessage,
    reminderError,
    remindMissingOrders,
  };
}

function useMealMarks(selectionId: string) {
  const [mealMarks, setMealMarks] = useState<MealRecommendationMark[]>([]);
  const [marksLoading, setMarksLoading] = useState(false);
  const [marksError, setMarksError] = useState("");
  const [markingItemId, setMarkingItemId] = useState<string | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [onboardingError, setOnboardingError] = useState("");
  const [onboardingCandidates, setOnboardingCandidates] = useState<
    MealRecommendationOnboardingCandidate[]
  >([]);
  const mealMarksByItemId = useMemo(
    () => new Map(mealMarks.map((mark) => [mark.itemId, mark])),
    [mealMarks],
  );

  useEffect(() => {
    let cancelled = false;
    const loadMarks = async () => {
      setMarksLoading(true);
      setMarksError("");
      try {
        const result = await api.fetchMealRecommendationMarks(selectionId);
        if (!cancelled) setMealMarks(result.marks);
      } catch (err) {
        if (!cancelled) setMarksError((err as Error).message);
      } finally {
        if (!cancelled) setMarksLoading(false);
      }
    };
    void loadMarks();
    return () => {
      cancelled = true;
    };
  }, [selectionId]);

  useEffect(() => {
    if (!onboardingOpen) return;
    let cancelled = false;
    const loadOnboardingCandidates = async () => {
      setOnboardingLoading(true);
      setOnboardingError("");
      try {
        const result = await api.fetchMealRecommendationOnboardingCandidates();
        if (!cancelled) setOnboardingCandidates(result.candidates);
      } catch (err) {
        if (!cancelled) setOnboardingError((err as Error).message);
      } finally {
        if (!cancelled) setOnboardingLoading(false);
      }
    };
    void loadOnboardingCandidates();
    return () => {
      cancelled = true;
    };
  }, [onboardingOpen]);

  const toggleMealMark = async (
    itemId: string,
    sentiment: MealAnticipatedLikeSentiment,
  ) => {
    const current = mealMarksByItemId.get(itemId);
    setMarkingItemId(itemId);
    setMarksError("");
    try {
      if (current?.sentiment === sentiment) {
        await api.deleteMealRecommendationMark(selectionId, itemId);
        setMealMarks((previous) =>
          previous.filter((mark) => mark.itemId !== itemId),
        );
      } else {
        const result = await api.upsertMealRecommendationMark(
          selectionId,
          itemId,
          sentiment,
        );
        setMealMarks((previous) => [
          ...previous.filter((mark) => mark.itemId !== itemId),
          {
            itemId,
            itemIdentityKey: result.itemIdentityKey,
            sentiment: result.sentiment,
          },
        ]);
      }

      if (onboardingOpen) {
        const refreshed =
          await api.fetchMealRecommendationOnboardingCandidates();
        setOnboardingCandidates(refreshed.candidates);
      }
    } catch (err) {
      setMarksError((err as Error).message);
    } finally {
      setMarkingItemId(null);
    }
  };

  const closeOnboarding = () => {
    setOnboardingOpen(false);
    setOnboardingError("");
  };

  return {
    mealMarksByItemId,
    marksLoading,
    marksError,
    markingItemId,
    onboardingOpen,
    onboardingLoading,
    onboardingError,
    onboardingCandidates,
    openOnboarding: () => setOnboardingOpen(true),
    closeOnboarding,
    toggleMealMark,
  };
}

// ─── Main component ─────────────────────────────────────────

export default function FoodSelectionActiveView() {
  const { activeFoodSelection, latestCompletedPoll, menus } = useAppState();
  const nickname = getAuthenticatedDisplayLabel();
  const actorKey = getAuthenticatedActorKey();
  const remaining = useCountdown(activeFoodSelection?.endsAt);
  const [submitting, setSubmitting] = useState(false);
  const [updatingTimer, setUpdatingTimer] = useState(false);
  const [manualRemainingMinutes, setManualRemainingMinutes] = useState("");
  const { confirm, dialog } = useConfirmDialog();
  const { showToast } = useToast();
  if (!activeFoodSelection || !nickname) return null;

  const selection = activeFoodSelection;
  const { preferences, preferencesError } = useUserPreferences(nickname);
  const recommendationState = useMealRecommendations(selection.id);
  const reminderState = useMissingOrderReminder(selection.id);
  const mealMarkState = useMealMarks(selection.id);
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
        menuItems.map((item) => [
          item.id,
          computeItemWarnings(item, preferences),
        ]),
      ),
    [menuItems, preferences],
  );
  const priceByItemId = useMemo(
    () =>
      new Map(
        menuItems
          .filter((item) => item.price !== null)
          .map((item) => [item.id, item.price as number]),
      ),
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
    () =>
      selection.orders.reduce((sum, order) => {
        if (!order.itemId) return sum;
        return sum + (priceByItemId.get(order.itemId) ?? 0);
      }, 0),
    [selection.orders, priceByItemId],
  );

  // Find current user's existing orders
  const myOrders = useMemo(
    () =>
      selection.orders.filter((o) =>
        actorKey
          ? o.actorKey === actorKey || (!o.actorKey && o.nickname === nickname)
          : o.nickname === nickname,
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
      selection.orders
        .map((order) => order.nickname.trim())
        .filter((name) => name.length > 0),
    );

    return [...votedForWinner]
      .filter((name) => !alreadyOrdered.has(name))
      .sort((left, right) => left.localeCompare(right));
  }, [
    latestCompletedPoll,
    selection.menuId,
    selection.orders,
    selection.pollId,
  ]);

  const handleFinishNow = async (): Promise<boolean> => {
    const confirmed = await confirm({
      title: "Confirm completion?",
      consequenceText: "This ends meal selection and moves Team Lunch to ordering.",
      confirmLabel: "Confirm completion",
    });
    if (!confirmed) return false;

    setSubmitting(true);
    try {
      await api.completeFoodSelectionNow(selection.id);
      return true;
    } catch (err) {
      showToast({ tone: "error", message: getErrorMessage(err, "Could not complete food selection") });
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateTimer = async (
    remainingMinutes: number,
  ): Promise<boolean> => {
    setUpdatingTimer(true);
    try {
      await api.updateFoodSelectionTimer(selection.id, remainingMinutes);
      setManualRemainingMinutes("");
      return true;
    } catch (err) {
      showToast({ tone: "error", message: getErrorMessage(err, "Could not update the timer") });
      return false;
    } finally {
      setUpdatingTimer(false);
    }
  };

  const handleAbort = async () => {
    const confirmed = await confirm({
      title: "Abort food selection?",
      consequenceText: "Current meal orders for this selection will stop changing.",
      confirmLabel: "Abort food selection",
      destructive: true,
    });
    if (!confirmed) return;

    setSubmitting(true);
    try {
      await api.abortFoodSelection(selection.id);
    } catch (err) {
      showToast({ tone: "error", message: getErrorMessage(err, "Could not abort food selection") });
    } finally {
      setSubmitting(false);
    }
  };

  const handleJumpToMeal = (itemId: string) => {
    const target = document.getElementById(`meal-item-${itemId}`);
    target?.scrollIntoView({ block: "center" });
    target?.focus({ preventScroll: true });
  };

  const timerOptions = Array.from(
    { length: 24 },
    (_, index) => (index + 1) * 5,
  );
  const totalSeconds = Math.max(
    1,
    Math.ceil(
      (new Date(selection.endsAt).getTime() -
        new Date(selection.startedAt).getTime()) /
        1000,
    ),
  );

  return (
    <div className="mx-auto w-full max-w-[1400px] p-4 lg:px-6">
      <FoodSelectionTimerActions
        selection={selection}
        remaining={remaining}
        totalSeconds={totalSeconds}
        canAdvanceToOrdering={canAdvanceToOrdering}
        canManageFoodSelection={canManageFoodSelection}
        canAdjustFoodSelectionTimer={canAdjustFoodSelectionTimer}
        submitting={submitting}
        updatingTimer={updatingTimer}
        manualRemainingMinutes={manualRemainingMinutes}
        timerOptions={timerOptions}
        onFinishNow={handleFinishNow}
        onAbort={handleAbort}
        onUpdateTimer={handleUpdateTimer}
        onManualRemainingMinutesChange={setManualRemainingMinutes}
      />

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Left: Order form */}
        <div className="rounded-lg border border-border bg-surface p-4 shadow-sm xl:col-span-2">
          <OrderForm
            selectionId={selection.id}
            menuItems={menuItems}
            nickname={nickname}
            existingOrders={myOrders.map((o) => ({
              id: o.id,
              itemId: o.itemId,
              itemName: o.itemName,
              notes: o.notes,
            }))}
            itemWarningsById={itemWarningsById}
            preferences={preferences}
            mealMarksByItemId={mealMarkState.mealMarksByItemId}
            marksLoading={mealMarkState.marksLoading}
            markingItemId={mealMarkState.markingItemId}
            onToggleMealMark={mealMarkState.toggleMealMark}
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
          <MealRecommendationsPanel
            recommendations={recommendationState.recommendations}
            recommendationsLoading={recommendationState.recommendationsLoading}
            recommendationsLoadingAction={
              recommendationState.recommendationsLoadingAction
            }
            recommendationsError={recommendationState.recommendationsError}
            onRecommendMeal={() => void recommendationState.recommendMeal()}
            onExploreMeal={() => void recommendationState.exploreMeal()}
            onOpenOnboarding={mealMarkState.openOnboarding}
            onJumpToMeal={handleJumpToMeal}
          />
          <MissingOrdersPanel
            votersWithoutOrder={votersWithoutOrder}
            canManageFoodSelection={canManageFoodSelection}
            submitting={submitting}
            remindingMissing={reminderState.remindingMissing}
            reminderMessage={reminderState.reminderMessage}
            reminderError={reminderState.reminderError}
            onFinishNow={() => void handleFinishNow()}
            onRemindMissingOrders={() =>
              void reminderState.remindMissingOrders()
            }
          />
        </div>
      </div>

      <MealOnboardingDialog
        open={mealMarkState.onboardingOpen}
        loading={mealMarkState.onboardingLoading}
        error={mealMarkState.onboardingError}
        candidates={mealMarkState.onboardingCandidates}
        onClose={mealMarkState.closeOnboarding}
        onMarkCandidate={async (itemId, sentiment) => {
          await mealMarkState.toggleMealMark(itemId, sentiment);
        }}
      />

      {preferencesError && (
        <p className="mt-4 text-sm text-danger-fg">{preferencesError}</p>
      )}
      {mealMarkState.marksError && (
        <p className="mt-4 text-sm text-danger-fg">
          {mealMarkState.marksError}
        </p>
      )}
      {dialog}
    </div>
  );
}
