import { useEffect, useRef } from 'react';
import { useAppDispatch } from '../context/AppContext.js';
import { sendBrowserNotification } from './usePhaseNotifications.js';
import type {
  InitialStatePayload,
  Menu,
  MenuItem,
  Poll,
  FoodSelection,
  FoodOrder,
  ShoppingListItem,
} from '../../lib/types.js';
import { withBasePath, withOfficeLocationContext } from '../config.js';

interface HealthResponse {
  status: 'ok' | 'degraded';
  db: {
    connected: boolean;
    attemptCount: number;
  };
}

function notificationsEnabledInStorage(): boolean {
  try {
    const stored = localStorage.getItem('team_lunch_phase_notifications_enabled');
    return stored === null || stored === 'true';
  } catch {
    return true;
  }
}

function currentNicknameFromStorage(): string | null {
  try {
    const value = localStorage.getItem('team_lunch_nickname')?.trim() ?? '';
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function isHealthResponse(value: unknown): value is HealthResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.status !== 'ok' && candidate.status !== 'degraded') return false;
  if (!candidate.db || typeof candidate.db !== 'object') return false;
  const db = candidate.db as Record<string, unknown>;
  return typeof db.connected === 'boolean' && typeof db.attemptCount === 'number';
}

/**
 * Connects to the SSE endpoint and dispatches state updates.
 * Also fetches the initial menus list via REST.
 * Must be called inside an AppProvider.
 */
export function useSSE(selectedOfficeLocationId?: string | null): void {
  const dispatch = useAppDispatch();
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  useEffect(() => {
    let isMounted = true;
    dispatchRef.current({ type: 'RESET_TO_INITIAL_STATE' });

    const fetchHealthStatus = async () => {
      try {
        const response = await fetch(withBasePath('/api/health'), { cache: 'no-store' });
        const payload = (await response.json()) as unknown;

        if (!isMounted) {
          return;
        }

        if (!isHealthResponse(payload)) {
          dispatchRef.current({ type: 'RESET_TO_INITIAL_STATE' });
          return;
        }

        dispatchRef.current({
          type: 'SET_DB_CONNECTIVITY',
          payload: {
            connected: payload.db.connected,
            attemptCount: payload.db.attemptCount,
          },
        });
      } catch {
        if (!isMounted) {
          return;
        }

        dispatchRef.current({
          type: 'SET_DB_CONNECTIVITY',
          payload: {
            connected: false,
            attemptCount: 0,
          },
        });
      }
    };

    void fetchHealthStatus();
    const healthInterval = window.setInterval(() => {
      void fetchHealthStatus();
    }, 2000);

    // Fetch menus list (not included in SSE initial_state)
    fetch(withOfficeLocationContext('/api/menus', selectedOfficeLocationId))
      .then((r) => r.json() as Promise<Menu[]>)
      .then((menus) => dispatchRef.current({ type: 'SET_MENUS', payload: menus }))
      .catch(() => {
        /* menu fetch failure is non-fatal — SSE events will provide updates */
      });

    fetch(withOfficeLocationContext('/api/food-selections/history', selectedOfficeLocationId))
      .then((r) => r.json() as Promise<FoodSelection[]>)
      .then((history) => dispatchRef.current({ type: 'SET_COMPLETED_HISTORY', payload: history }))
      .catch(() => {
        /* history fetch failure is non-fatal — initial_state or later events will sync */
      });

    fetch(withOfficeLocationContext('/api/shopping-list', selectedOfficeLocationId))
      .then((r) => r.json() as Promise<ShoppingListItem[]>)
      .then((items) => dispatchRef.current({ type: 'SET_SHOPPING_LIST', payload: items }))
      .catch(() => {
        /* shopping-list fetch failure is non-fatal — later SSE events will sync */
      });

    // Connect to SSE endpoint
    const es = new EventSource(withOfficeLocationContext('/api/events', selectedOfficeLocationId));

    es.addEventListener('initial_state', (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data) as InitialStatePayload;
        dispatchRef.current({ type: 'INITIAL_STATE', payload });
      } catch {
        dispatchRef.current({ type: 'RESET_TO_INITIAL_STATE' });
      }
    });

    // ── Menu events ────────────────────────────────────
    es.addEventListener('menu_created', (e: MessageEvent) => {
      const payload = JSON.parse(e.data) as { menu: Menu };
      dispatchRef.current({ type: 'MENU_CREATED', payload });
    });

    es.addEventListener('menu_updated', (e: MessageEvent) => {
      const payload = JSON.parse(e.data) as { menu: Menu };
      dispatchRef.current({ type: 'MENU_UPDATED', payload });
    });

    es.addEventListener('menu_deleted', (e: MessageEvent) => {
      const payload = JSON.parse(e.data) as { menuId: string };
      dispatchRef.current({ type: 'MENU_DELETED', payload });
    });

    es.addEventListener('item_created', (e: MessageEvent) => {
      const payload = JSON.parse(e.data) as { item: MenuItem };
      dispatchRef.current({ type: 'ITEM_CREATED', payload });
    });

    es.addEventListener('item_updated', (e: MessageEvent) => {
      const payload = JSON.parse(e.data) as { item: MenuItem };
      dispatchRef.current({ type: 'ITEM_UPDATED', payload });
    });

    es.addEventListener('item_deleted', (e: MessageEvent) => {
      const payload = JSON.parse(e.data) as { itemId: string; menuId: string };
      dispatchRef.current({ type: 'ITEM_DELETED', payload });
    });

    es.addEventListener('shopping_list_item_added', (e: MessageEvent) => {
      const payload = JSON.parse(e.data) as { item: ShoppingListItem };
      dispatchRef.current({ type: 'SHOPPING_LIST_ITEM_ADDED', payload });
    });

    es.addEventListener('shopping_list_item_updated', (e: MessageEvent) => {
      const payload = JSON.parse(e.data) as { item: ShoppingListItem };
      dispatchRef.current({ type: 'SHOPPING_LIST_ITEM_UPDATED', payload });
    });

    // ── Poll events ────────────────────────────────────
    es.addEventListener('poll_started', (e: MessageEvent) => {
      const payload = JSON.parse(e.data) as { poll: Poll };
      dispatchRef.current({ type: 'POLL_STARTED', payload });
    });

    es.addEventListener('vote_cast', (e: MessageEvent) => {
      const payload = JSON.parse(e.data) as { poll: Poll };
      dispatchRef.current({ type: 'VOTE_CAST', payload });
    });

    es.addEventListener('vote_withdrawn', (e: MessageEvent) => {
      const payload = JSON.parse(e.data) as { poll: Poll };
      dispatchRef.current({ type: 'VOTE_WITHDRAWN', payload });
    });

    es.addEventListener('poll_ended', (e: MessageEvent) => {
      const payload = JSON.parse(e.data) as {
        pollId: string;
        status: 'finished' | 'tied' | 'aborted';
        endedPrematurely?: boolean;
        winner?: { menuId: string; menuName: string; selectedRandomly: boolean };
      };
      dispatchRef.current({ type: 'POLL_ENDED', payload });
    });

    es.addEventListener('poll_extended', (e: MessageEvent) => {
      const payload = JSON.parse(e.data) as { pollId: string; newEndsAt: string };
      dispatchRef.current({ type: 'POLL_EXTENDED', payload });
    });

    // ── Food selection events ──────────────────────────
    es.addEventListener('food_selection_started', (e: MessageEvent) => {
      const payload = JSON.parse(e.data) as { foodSelection: FoodSelection };
      dispatchRef.current({ type: 'FOOD_SELECTION_STARTED', payload });
    });

    es.addEventListener('order_placed', (e: MessageEvent) => {
      const payload = JSON.parse(e.data) as { order: FoodOrder };
      dispatchRef.current({ type: 'ORDER_PLACED', payload });
    });

    es.addEventListener('order_updated', (e: MessageEvent) => {
      const payload = JSON.parse(e.data) as { order: FoodOrder };
      dispatchRef.current({ type: 'ORDER_UPDATED', payload });
    });

    es.addEventListener('order_withdrawn', (e: MessageEvent) => {
      const payload = JSON.parse(e.data) as { nickname: string; selectionId: string; orderId?: string };
      dispatchRef.current({ type: 'ORDER_WITHDRAWN', payload });
    });

    es.addEventListener('food_selection_overtime', (e: MessageEvent) => {
      const payload = JSON.parse(e.data) as { foodSelectionId: string };
      dispatchRef.current({ type: 'FOOD_SELECTION_OVERTIME', payload });
    });

    es.addEventListener('food_selection_extended', (e: MessageEvent) => {
      const payload = JSON.parse(e.data) as { foodSelectionId: string; newEndsAt: string };
      dispatchRef.current({ type: 'FOOD_SELECTION_EXTENDED', payload });
    });

    es.addEventListener('food_selection_ordering_started', (e: MessageEvent) => {
      const payload = JSON.parse(e.data) as { foodSelection: FoodSelection };
      dispatchRef.current({ type: 'FOOD_SELECTION_ORDERING_STARTED', payload });
    });

    es.addEventListener('food_selection_ordering_claimed', (e: MessageEvent) => {
      const payload = JSON.parse(e.data) as { foodSelection: FoodSelection };
      dispatchRef.current({ type: 'FOOD_SELECTION_ORDERING_CLAIMED', payload });
    });

    es.addEventListener('food_selection_fallback_pinged', (e: MessageEvent) => {
      const payload = JSON.parse(e.data) as {
        foodSelectionId: string;
        menuName: string;
        targetNickname: string;
        actorNickname: string;
        itemName: string;
        itemNumber?: string | null;
      };

      const currentNickname = currentNicknameFromStorage();
      if (!notificationsEnabledInStorage() || !currentNickname) {
        return;
      }
      if (currentNickname.trim().toLowerCase() !== payload.targetNickname.trim().toLowerCase()) {
        return;
      }

      const defaultMealLabel = payload.itemNumber
        ? `${payload.itemNumber} ${payload.itemName}`
        : payload.itemName;
      void sendBrowserNotification(
        'Team Lunch is waiting for your order',
        `${payload.actorNickname} is waiting for your ${payload.menuName} choice. ` +
          `Your saved default meal is ${defaultMealLabel}.`,
      );
    });

    es.addEventListener('food_selection_delivery_started', (e: MessageEvent) => {
      const payload = JSON.parse(e.data) as { foodSelection: FoodSelection };
      dispatchRef.current({ type: 'FOOD_SELECTION_DELIVERY_STARTED', payload });
    });

    es.addEventListener('food_selection_delivery_due', (e: MessageEvent) => {
      const payload = JSON.parse(e.data) as { foodSelectionId: string };
      dispatchRef.current({ type: 'FOOD_SELECTION_DELIVERY_DUE', payload });
    });

    es.addEventListener('food_selection_completed', (e: MessageEvent) => {
      const payload = JSON.parse(e.data) as { foodSelection: FoodSelection };
      dispatchRef.current({ type: 'FOOD_SELECTION_COMPLETED', payload });
    });

    es.addEventListener('food_selection_aborted', (e: MessageEvent) => {
      const payload = JSON.parse(e.data) as { foodSelectionId: string };
      dispatchRef.current({ type: 'FOOD_SELECTION_ABORTED', payload });
    });

    es.addEventListener('food_selection_eta_updated', (e: MessageEvent) => {
      const payload = JSON.parse(e.data) as {
        foodSelectionId: string;
        etaMinutes: number;
        etaSetAt: string;
        deliveryDueAt: string;
      };
      dispatchRef.current({ type: 'FOOD_SELECTION_ETA_UPDATED', payload });
    });

    // ── Connection status ──────────────────────────────
    es.onopen = () => {
      dispatchRef.current({ type: 'SET_CONNECTED', payload: true });
    };

    es.onerror = () => {
      dispatchRef.current({ type: 'SET_CONNECTED', payload: false });
    };

    return () => {
      isMounted = false;
      window.clearInterval(healthInterval);
      es.close();
    };
  }, [selectedOfficeLocationId]);
}
