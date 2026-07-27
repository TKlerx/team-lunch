import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FoodSelection, Poll } from '../../lib/types.js';
import * as api from '../api.js';
import { useAppState } from '../context/AppContext.js';
import { useToast } from '../context/ToastContext.js';
import { getAuthenticatedDisplayLabel } from '../auth.js';
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
import { Button } from './ui/Button.js';
import { Card } from './ui/Card.js';
import { Input } from './ui/Input.js';
import { Select } from './ui/Select.js';
import { sectionTitleClass } from './ui/Section.js';
import { getErrorMessage } from '../lib/errorMessage.js';

const POLL_DURATIONS = [5, 10, 15, 30, 45, 60, 120, 240, 480, 720] as const;
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
    <Card className="bg-surface-muted p-5">
      <h3 className={`mb-3 ${sectionTitleClass}`}>{title}</h3>
      {children}
    </Card>
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
        <div className="rounded-xl border border-border bg-surface-muted p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">Last winner</p>
          <p className="mt-1 text-base font-semibold text-fg">{lastWinner ?? 'No winner yet'}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface-muted p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">Average rating</p>
          <p className="mt-1 text-base font-semibold text-fg">
            {averageRating === null ? 'No ratings yet' : `${averageRating.toFixed(1)} / 5`}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface-muted p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">
            Most ordered item
          </p>
          <p className="mt-1 text-base font-semibold text-fg">
            {mostOrderedItem ? `${mostOrderedItem.itemName} (${mostOrderedItem.count})` : 'No orders yet'}
          </p>
          {mostOrderedItem && (
            <p className="mt-1 text-xs text-fg-muted">Most often from {mostOrderedItem.sourceMenuName}</p>
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
            <p className="text-sm text-fg-muted">You are caught up on meal ratings.</p>
          ) : (
            <div className="space-y-3">
              {pendingRatings.map((selection) => (
                <div
                  key={selection.selectionId}
                  className="flex items-center justify-between gap-3 rounded-xl bg-warning-soft px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-fg">{selection.menuName}</p>
                    <p className="text-sm text-fg-muted">
                      {selection.unratedCount} unrated meal{selection.unratedCount === 1 ? '' : 's'} |{' '}
                      {formatCompletedAt(selection.completedAt)}
                    </p>
                  </div>
                  <Button
                    variant="warning-solid"
                    onClick={() => onOpenHistorySelection?.(selection.selectionId)}
                    className="px-3"
                  >
                    Rate now
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="Team Lunch History">
          {recentHistory.length === 0 ? (
            <p className="text-sm text-fg-muted">No completed lunches yet.</p>
          ) : (
            <div className="space-y-2">
              {recentHistory.map((selection) => (
                <Button
                  key={selection.id}
                  variant="secondary"
                  onClick={() => onOpenHistorySelection?.(selection.id)}
                  className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left"
                >
                  <span>
                    <span className="block font-medium text-fg">{selection.menuName}</span>
                    <span className="block text-sm text-fg-muted">
                      {selection.orders.length} order{selection.orders.length === 1 ? '' : 's'}
                    </span>
                  </span>
                  <span className="text-sm text-fg-muted">{formatCompletedAt(selection.completedAt)}</span>
                </Button>
              ))}
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="Most Popular Menus">
          {popularMenus.length === 0 ? (
            <p className="text-sm text-fg-muted">No menu history yet.</p>
          ) : (
            <ol className="space-y-2">
              {popularMenus.map((menu, index) => (
                <li
                  key={menu.menuName}
                  className="flex items-center justify-between rounded-xl bg-surface-muted px-4 py-3"
                >
                  <span className="font-medium text-fg">
                    {index + 1}. {menu.menuName}
                  </span>
                  <span className="text-sm text-fg-muted">
                    {menu.count} lunch{menu.count === 1 ? '' : 'es'}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </DashboardCard>

        <DashboardCard title="Most Popular Meals">
          {popularMeals.length === 0 ? (
            <p className="text-sm text-fg-muted">No meal history yet.</p>
          ) : (
            <ol className="space-y-2">
              {popularMeals.map((meal, index) => (
                <li key={meal.itemName} className="rounded-xl bg-surface-muted px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-fg">
                      {index + 1}. {meal.itemName}
                    </span>
                    <span className="text-sm text-fg-muted">
                      {meal.count} order{meal.count === 1 ? '' : 's'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-fg-muted">Most often from {meal.sourceMenuName}</p>
                </li>
              ))}
            </ol>
          )}
        </DashboardCard>

        <DashboardCard title="Recently Used Menus">
          {recentMenus.length === 0 ? (
            <p className="text-sm text-fg-muted">No recent menu activity yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {recentMenus.map((menuName) => (
                <span
                  key={menuName}
                  className="rounded-full border border-accent bg-accent-soft px-3 py-1 text-sm text-accent-fg"
                >
                  {menuName}
                </span>
              ))}
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="My Previous Orders">
          {myOrders.length === 0 ? (
            <p className="text-sm text-fg-muted">You have not placed any orders yet.</p>
          ) : (
            <div className="space-y-2">
              {myOrders.map((order, index) => (
                <Button
                  key={`${order.selectionId}-${order.itemName}-${index}`}
                  variant="secondary"
                  onClick={() => onOpenHistorySelection?.(order.selectionId)}
                  className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-fg">{order.itemName}</span>
                    <span className="block text-sm text-fg-muted">{order.menuName}</span>
                    {order.notes && (
                      <span className="block truncate text-xs text-fg-muted">({order.notes})</span>
                    )}
                  </span>
                  <span className="ml-3 flex flex-col items-end gap-1">
                    {order.rating !== null ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning-fg">
                        {order.rating}/5
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-surface-muted px-2 py-0.5 text-xs text-fg-muted">
                        Not rated
                      </span>
                    )}
                    {order.feedbackComment && (
                      <span className="max-w-[160px] truncate text-xs text-fg-muted" title={order.feedbackComment}>
                        {order.feedbackComment}
                      </span>
                    )}
                    <span className="text-xs text-fg-muted">{formatCompletedAt(order.completedAt)}</span>
                  </span>
                </Button>
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
        <Button
          variant="secondary"
          onClick={() => navigate('/menus')}
          className="rounded-2xl px-4 py-3 text-left"
        >
          <span className="block font-medium text-fg">Manage menus</span>
          <span className="mt-1 block text-sm text-fg-muted">
            Create, update, clean up, and import menus from the menu management screen.
          </span>
        </Button>
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
  const actorLabel = getAuthenticatedDisplayLabel();
  const [duration, setDuration] = useState<number>(defaultDuration);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    setDuration(defaultDuration);
  }, [defaultDuration]);

  const handleQuickStart = async (event: FormEvent) => {
    event.preventDefault();
    if (!actorLabel) {
      setError('Sign in first');
      return;
    }

    setSubmitting(true);
    try {
      await api.quickStartFoodSelection(duration);
      setError('');
    } catch (err) {
      showToast({ tone: 'error', message: getErrorMessage(err, 'Could not start food selection') });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardCard title="Start Food Selection">
      <p className="mb-4 text-sm text-fg-muted">
        Only one menu is currently available, so the lunch flow can skip straight to ordering.
      </p>
      <p className="mb-4 text-base font-semibold text-fg">{menuName}</p>
      <form onSubmit={(event) => void handleQuickStart(event)} className="space-y-4">
        <div>
          <label htmlFor="quick-duration" className="mb-1 block text-sm font-medium text-fg">
            Duration
          </label>
          <Select
            id="quick-duration"
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value))}
            className="focus:border-success"
          >
            {FOOD_DURATIONS.map((value) => (
              <option key={value} value={value}>
                {value} min
              </option>
            ))}
          </Select>
        </div>

        {error && <p className="text-sm text-danger-fg">{error}</p>}

        <Button
          type="submit"
          variant="success-solid"
          disabled={submitting}
          className="w-full py-3"
        >
          {submitting ? 'Starting...' : 'Start Food Selection'}
        </Button>
      </form>
    </DashboardCard>
  );
}

function PollStartForm({
  menus,
}: {
  menus: Array<{ id: string; name: string }>;
}) {
  const actorLabel = getAuthenticatedDisplayLabel();
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(5);
  const [excludedReasons, setExcludedReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useToast();

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
    if (!actorLabel) {
      setError('Sign in first');
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
      showToast({ tone: 'error', message: getErrorMessage(err, 'Could not start poll') });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardCard title="Start New Team Lunch">
      <form onSubmit={(event) => void handleStart(event)} className="space-y-4">
        <div>
          <label htmlFor="poll-desc" className="mb-1 block text-sm font-medium text-fg">
            Description
          </label>
          <Input
            id="poll-desc"
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              setError('');
            }}
            maxLength={120}
            placeholder="What do we eat today?"
          />
          <p className="mt-1 text-xs text-fg-muted">{description.length}/120</p>
        </div>

        <div>
          <label htmlFor="poll-duration" className="mb-1 block text-sm font-medium text-fg">
            Duration
          </label>
          <Select
            id="poll-duration"
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value))}
          >
            {POLL_DURATIONS.map((value) => (
              <option key={value} value={value}>
                {formatDuration(value)}
              </option>
            ))}
          </Select>
        </div>

        <div className="rounded-xl border border-border bg-surface-muted p-3">
          <p className="mb-2 text-sm font-medium text-fg">Exclude menu options (optional)</p>
          <div className="space-y-2">
            {menus.map((menu) => {
              const isExcluded = Object.prototype.hasOwnProperty.call(excludedReasons, menu.id);

              return (
                <div key={menu.id} className="rounded-xl border border-border bg-surface p-3">
                  <label className="flex items-center gap-2 text-sm text-fg">
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
                    <Input
                      value={excludedReasons[menu.id]}
                      onChange={(event) => {
                        setExcludedReasons((previous) => ({
                          ...previous,
                          [menu.id]: event.target.value,
                        }));
                        setError('');
                      }}
                      maxLength={240}
                      className="mt-2 px-2 py-1.5"
                      placeholder="Why is this option excluded?"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {error && <p className="text-sm text-danger-fg">{error}</p>}

        <Button type="submit" disabled={submitting} className="w-full py-3">
          {submitting ? 'Starting...' : 'Start new Team Lunch'}
        </Button>
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
  const actorLabel = getAuthenticatedDisplayLabel();
  const menusWithItems = menus.filter((menu) => menu.items.length > 0);

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[1500px] flex-1 flex-col gap-6 p-4 lg:px-6">
      <Card className="bg-surface-muted p-6">
        <p className={sectionTitleClass}>Dashboard</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg">
          Team Lunch home base
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-fg-muted">
          Start the next lunch round, catch up on ratings, and use recent history to make faster decisions.
        </p>
      </Card>

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
          nickname={actorLabel}
          latestCompletedPoll={latestCompletedPoll}
          latestCompletedFoodSelection={latestCompletedFoodSelection}
          onOpenHistorySelection={onOpenHistorySelection}
        />
      </div>
    </div>
  );
}
