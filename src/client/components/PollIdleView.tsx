import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FoodSelection, Poll } from '../../lib/types.js';
import * as api from '../api.js';
import { useAppState } from '../context/AppContext.js';
import { useNickname } from '../hooks/useNickname.js';
import {
  getAverageMealRating,
  getLastWinnerLabel,
  getMostOrderedItemAcrossMenus,
  getMostPopularMeals,
  getMostPopularMenus,
  getMyPreviousOrders,
  getRecentlyUsedMenus,
  getSelectionsWaitingForRating,
} from '../utils/dashboard.js';

const POLL_DURATIONS = Array.from({ length: (720 - 5) / 5 + 1 }, (_, i) => 5 + i * 5);
const FOOD_DURATIONS = [1, 5, 10, 15, 20, 25, 30] as const;

function formatDuration(mins: number): string {
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function formatCompletedAt(value: string | null): string {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function DashboardCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
        {title}
      </h3>
      {children}
    </section>
  );
}

function DashboardStats({
  latestCompletedPoll,
  latestCompletedFoodSelection,
  history,
}: {
  latestCompletedPoll: Poll | null;
  latestCompletedFoodSelection: FoodSelection | null;
  history: FoodSelection[];
}) {
  const averageRating = getAverageMealRating(history);
  const mostOrderedItem = getMostOrderedItemAcrossMenus(history);
  const lastWinner = getLastWinnerLabel(latestCompletedPoll, latestCompletedFoodSelection);

  return (
    <DashboardCard title="Quick Stats">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Last winner</p>
          <p className="mt-1 text-base font-semibold text-slate-900">{lastWinner ?? 'No winner yet'}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Average rating</p>
          <p className="mt-1 text-base font-semibold text-slate-900">
            {averageRating === null ? 'No ratings yet' : `${averageRating.toFixed(1)} / 5`}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Most ordered item
          </p>
          <p className="mt-1 text-base font-semibold text-slate-900">
            {mostOrderedItem ? `${mostOrderedItem.itemName} (${mostOrderedItem.count})` : 'No orders yet'}
          </p>
          {mostOrderedItem && (
            <p className="mt-1 text-xs text-slate-500">Most often from {mostOrderedItem.sourceMenuName}</p>
          )}
        </div>
      </div>
    </DashboardCard>
  );
}

function DashboardInsights({
  history,
  nickname,
  latestCompletedPoll,
  latestCompletedFoodSelection,
  onOpenHistorySelection,
}: {
  history: FoodSelection[];
  nickname: string | null;
  latestCompletedPoll: Poll | null;
  latestCompletedFoodSelection: FoodSelection | null;
  onOpenHistorySelection?: (selectionId: string) => void;
}) {
  const pendingRatings = getSelectionsWaitingForRating(history, nickname).slice(0, 3);
  const popularMenus = getMostPopularMenus(history).slice(0, 4);
  const popularMeals = getMostPopularMeals(history).slice(0, 4);
  const recentMenus = getRecentlyUsedMenus(history).slice(0, 4);
  const recentHistory = history.slice(0, 4);
  const myOrders = getMyPreviousOrders(history, nickname).slice(0, 6);

  return (
    <div className="space-y-4">
      <DashboardStats
        latestCompletedPoll={latestCompletedPoll}
        latestCompletedFoodSelection={latestCompletedFoodSelection}
        history={history}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <DashboardCard title="Meals Waiting For Your Rating">
          {pendingRatings.length === 0 ? (
            <p className="text-sm text-slate-600">You are caught up on meal ratings.</p>
          ) : (
            <div className="space-y-3">
              {pendingRatings.map((selection) => (
                <div
                  key={selection.selectionId}
                  className="flex items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-slate-900">{selection.menuName}</p>
                    <p className="text-sm text-slate-600">
                      {selection.unratedCount} unrated meal{selection.unratedCount === 1 ? '' : 's'} |{' '}
                      {formatCompletedAt(selection.completedAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenHistorySelection?.(selection.selectionId)}
                    className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600"
                  >
                    Rate now
                  </button>
                </div>
              ))}
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="Team Lunch History">
          {recentHistory.length === 0 ? (
            <p className="text-sm text-slate-600">No completed lunches yet.</p>
          ) : (
            <div className="space-y-2">
              {recentHistory.map((selection) => (
                <button
                  key={selection.id}
                  type="button"
                  onClick={() => onOpenHistorySelection?.(selection.id)}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left hover:border-slate-300 hover:bg-slate-50"
                >
                  <span>
                    <span className="block font-medium text-slate-900">{selection.menuName}</span>
                    <span className="block text-sm text-slate-500">
                      {selection.orders.length} order{selection.orders.length === 1 ? '' : 's'}
                    </span>
                  </span>
                  <span className="text-sm text-slate-500">{formatCompletedAt(selection.completedAt)}</span>
                </button>
              ))}
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="Most Popular Menus">
          {popularMenus.length === 0 ? (
            <p className="text-sm text-slate-600">No menu history yet.</p>
          ) : (
            <ol className="space-y-2">
              {popularMenus.map((menu, index) => (
                <li
                  key={menu.menuName}
                  className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"
                >
                  <span className="font-medium text-slate-900">
                    {index + 1}. {menu.menuName}
                  </span>
                  <span className="text-sm text-slate-500">
                    {menu.count} lunch{menu.count === 1 ? '' : 'es'}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </DashboardCard>

        <DashboardCard title="Most Popular Meals">
          {popularMeals.length === 0 ? (
            <p className="text-sm text-slate-600">No meal history yet.</p>
          ) : (
            <ol className="space-y-2">
              {popularMeals.map((meal, index) => (
                <li key={meal.itemName} className="rounded-xl bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-slate-900">
                      {index + 1}. {meal.itemName}
                    </span>
                    <span className="text-sm text-slate-500">
                      {meal.count} order{meal.count === 1 ? '' : 's'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">Most often from {meal.sourceMenuName}</p>
                </li>
              ))}
            </ol>
          )}
        </DashboardCard>

        <DashboardCard title="Recently Used Menus">
          {recentMenus.length === 0 ? (
            <p className="text-sm text-slate-600">No recent menu activity yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {recentMenus.map((menuName) => (
                <span
                  key={menuName}
                  className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sm text-sky-800"
                >
                  {menuName}
                </span>
              ))}
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="My Previous Orders">
          {myOrders.length === 0 ? (
            <p className="text-sm text-slate-600">You have not placed any orders yet.</p>
          ) : (
            <div className="space-y-2">
              {myOrders.map((order, index) => (
                <button
                  key={`${order.selectionId}-${order.itemName}-${index}`}
                  type="button"
                  onClick={() => onOpenHistorySelection?.(order.selectionId)}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left hover:border-slate-300 hover:bg-slate-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-slate-900">{order.itemName}</span>
                    <span className="block text-sm text-slate-500">{order.menuName}</span>
                    {order.notes && (
                      <span className="block truncate text-xs text-slate-400">({order.notes})</span>
                    )}
                  </span>
                  <span className="ml-3 flex flex-col items-end gap-1">
                    {order.rating !== null ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        {order.rating}/5
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-400">
                        Not rated
                      </span>
                    )}
                    {order.feedbackComment && (
                      <span className="max-w-[160px] truncate text-xs text-slate-400" title={order.feedbackComment}>
                        {order.feedbackComment}
                      </span>
                    )}
                    <span className="text-xs text-slate-400">{formatCompletedAt(order.completedAt)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </DashboardCard>
      </div>
    </div>
  );
}

function QuickActions() {
  const navigate = useNavigate();

  return (
    <DashboardCard title="Quick Actions">
      <div className="grid gap-2">
        <button
          type="button"
          onClick={() => navigate('/menus')}
          className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-left hover:bg-slate-50"
        >
          <span className="block font-medium text-slate-900">Manage menus</span>
          <span className="mt-1 block text-sm text-slate-500">
            Create, update, clean up, and import menus from the menu management screen.
          </span>
        </button>
      </div>
    </DashboardCard>
  );
}

function SingleMenuQuickStart({
  menuName,
  defaultDuration,
}: {
  menuName: string;
  defaultDuration: number;
}) {
  const { nickname } = useNickname();
  const [duration, setDuration] = useState<number>(defaultDuration);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setDuration(defaultDuration);
  }, [defaultDuration]);

  const handleQuickStart = async (event: FormEvent) => {
    event.preventDefault();
    if (!nickname) {
      setError('Set a nickname first');
      return;
    }

    setSubmitting(true);
    try {
      await api.quickStartFoodSelection(duration);
      setError('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardCard title="Start Food Selection">
      <p className="mb-4 text-sm text-slate-600">
        Only one menu is currently available, so the lunch flow can skip straight to ordering.
      </p>
      <p className="mb-4 text-base font-semibold text-slate-900">{menuName}</p>
      <form onSubmit={(event) => void handleQuickStart(event)} className="space-y-4">
        <div>
          <label htmlFor="quick-duration" className="mb-1 block text-sm font-medium text-slate-700">
            Duration
          </label>
          <select
            id="quick-duration"
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value))}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
          >
            {FOOD_DURATIONS.map((value) => (
              <option key={value} value={value}>
                {value} min
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-green-600 px-4 py-3 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {submitting ? 'Starting...' : 'Start Food Selection'}
        </button>
      </form>
    </DashboardCard>
  );
}

function PollStartForm({
  menus,
}: {
  menus: Array<{ id: string; name: string }>;
}) {
  const { nickname } = useNickname();
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(5);
  const [excludedReasons, setExcludedReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleStart = async (event: FormEvent) => {
    event.preventDefault();

    const trimmed = description.trim();
    if (!trimmed) {
      setError('Description is required');
      return;
    }
    if (trimmed.length > 120) {
      setError('Description must be 120 characters or fewer');
      return;
    }
    if (!nickname) {
      setError('Set a nickname first');
      return;
    }

    const excludedMenuJustifications = Object.entries(excludedReasons).map(([menuId, reason]) => ({
      menuId,
      reason: reason.trim(),
    }));
    if (excludedMenuJustifications.some((entry) => !entry.reason)) {
      setError('Provide a justification for every excluded menu');
      return;
    }

    setSubmitting(true);
    try {
      await api.startPoll(trimmed, duration, excludedMenuJustifications);
      setDescription('');
      setExcludedReasons({});
      setError('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardCard title="Start New Team Lunch">
      <form onSubmit={(event) => void handleStart(event)} className="space-y-4">
        <div>
          <label htmlFor="poll-desc" className="mb-1 block text-sm font-medium text-slate-700">
            Description
          </label>
          <input
            id="poll-desc"
            type="text"
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              setError('');
            }}
            maxLength={120}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="What do we eat today?"
          />
          <p className="mt-1 text-xs text-slate-400">{description.length}/120</p>
        </div>

        <div>
          <label htmlFor="poll-duration" className="mb-1 block text-sm font-medium text-slate-700">
            Duration
          </label>
          <select
            id="poll-duration"
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value))}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            {POLL_DURATIONS.map((value) => (
              <option key={value} value={value}>
                {formatDuration(value)}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-sm font-medium text-slate-700">Exclude menu options (optional)</p>
          <div className="space-y-2">
            {menus.map((menu) => {
              const isExcluded = Object.prototype.hasOwnProperty.call(excludedReasons, menu.id);

              return (
                <div key={menu.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={isExcluded}
                      onChange={(event) => {
                        setExcludedReasons((previous) => {
                          if (event.target.checked) {
                            return { ...previous, [menu.id]: '' };
                          }

                          const { [menu.id]: _removed, ...rest } = previous;
                          return rest;
                        });
                        setError('');
                      }}
                    />
                    {menu.name}
                  </label>
                  {isExcluded && (
                    <input
                      type="text"
                      value={excludedReasons[menu.id]}
                      onChange={(event) => {
                        setExcludedReasons((previous) => ({
                          ...previous,
                          [menu.id]: event.target.value,
                        }));
                        setError('');
                      }}
                      maxLength={240}
                      className="mt-2 w-full rounded-xl border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                      placeholder="Why is this option excluded?"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Starting...' : 'Start new Team Lunch'}
        </button>
      </form>
    </DashboardCard>
  );
}

export default function PollIdleView({
  onOpenHistorySelection,
}: {
  onOpenHistorySelection?: (selectionId: string) => void;
}) {
  const {
    latestCompletedPoll,
    latestCompletedFoodSelection,
    completedFoodSelectionsHistory,
    menus,
    defaultFoodSelectionDurationMinutes,
  } = useAppState();
  const { nickname } = useNickname();
  const menusWithItems = menus.filter((menu) => menu.items.length > 0);

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[1500px] flex-1 flex-col gap-6 p-4 lg:px-6">
      <section className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-white via-sky-50 to-amber-50 p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-700">Dashboard</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
          Team Lunch home base
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Start the next lunch round, catch up on ratings, and use recent history to make faster decisions.
        </p>
      </section>

      <div className="grid min-h-0 gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          {menusWithItems.length === 1 ? (
            <SingleMenuQuickStart
              menuName={menusWithItems[0].name}
              defaultDuration={defaultFoodSelectionDurationMinutes}
            />
          ) : (
            <PollStartForm menus={menusWithItems.map((menu) => ({ id: menu.id, name: menu.name }))} />
          )}
          <QuickActions />
        </div>

        <DashboardInsights
          history={completedFoodSelectionsHistory}
          nickname={nickname}
          latestCompletedPoll={latestCompletedPoll}
          latestCompletedFoodSelection={latestCompletedFoodSelection}
          onOpenHistorySelection={onOpenHistorySelection}
        />
      </div>
    </div>
  );
}
