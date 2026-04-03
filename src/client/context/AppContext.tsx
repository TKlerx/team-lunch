import React, { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react';
import type {
  Poll,
  FoodSelection,
  FoodOrder,
  Menu,
  MenuItem,
  InitialStatePayload,
  ShoppingListItem,
} from '../../lib/types.js';

// ─── State shape ───────────────────────────────────────────

export interface AppState {
  activePoll: Poll | null;
  activeFoodSelection: FoodSelection | null;
  latestCompletedPoll: Poll | null;
  latestCompletedFoodSelection: FoodSelection | null;
  completedFoodSelectionsHistory: FoodSelection[];
  defaultFoodSelectionDurationMinutes: number;
  shoppingListItems: ShoppingListItem[];
  menus: Menu[];
  connected: boolean;
  dbConnected: boolean;
  dbReconnectAttempts: number;
  initialized: boolean;
}

export const initialAppState: AppState = {
  activePoll: null,
  activeFoodSelection: null,
  latestCompletedPoll: null,
  latestCompletedFoodSelection: null,
  completedFoodSelectionsHistory: [],
  defaultFoodSelectionDurationMinutes: 30,
  shoppingListItems: [],
  menus: [],
  connected: false,
  dbConnected: true,
  dbReconnectAttempts: 0,
  initialized: false,
};

function resetTeamLunchProcess(state: AppState): AppState {
  return {
    ...state,
    activePoll: null,
    activeFoodSelection: null,
    latestCompletedPoll: null,
    latestCompletedFoodSelection: null,
  };
}

// ─── Actions ───────────────────────────────────────────────

export type AppAction =
  | { type: 'INITIAL_STATE'; payload: InitialStatePayload }
  | { type: 'SET_MENUS'; payload: Menu[] }
  | { type: 'SET_SHOPPING_LIST'; payload: ShoppingListItem[] }
  | { type: 'SET_COMPLETED_HISTORY'; payload: FoodSelection[] }
  | { type: 'MENU_CREATED'; payload: { menu: Menu } }
  | { type: 'MENU_UPDATED'; payload: { menu: Menu } }
  | { type: 'MENU_DELETED'; payload: { menuId: string } }
  | { type: 'ITEM_CREATED'; payload: { item: MenuItem } }
  | { type: 'ITEM_UPDATED'; payload: { item: MenuItem } }
  | { type: 'ITEM_DELETED'; payload: { itemId: string; menuId: string } }
  | { type: 'SHOPPING_LIST_ITEM_ADDED'; payload: { item: ShoppingListItem } }
  | { type: 'SHOPPING_LIST_ITEM_UPDATED'; payload: { item: ShoppingListItem } }
  | { type: 'POLL_STARTED'; payload: { poll: Poll } }
  | {
      type: 'VOTE_CAST';
      payload: { poll: Poll };
    }
  | {
      type: 'VOTE_WITHDRAWN';
      payload: { poll: Poll };
    }
  | {
      type: 'POLL_ENDED';
      payload: {
        pollId: string;
        status: 'finished' | 'tied' | 'aborted';
        endedPrematurely?: boolean;
        winner?: { menuId: string; menuName: string; selectedRandomly: boolean };
      };
    }
  | { type: 'POLL_EXTENDED'; payload: { pollId: string; newEndsAt: string } }
  | { type: 'FOOD_SELECTION_STARTED'; payload: { foodSelection: FoodSelection } }
  | { type: 'ORDER_PLACED'; payload: { order: FoodOrder } }
  | { type: 'ORDER_UPDATED'; payload: { order: FoodOrder } }
  | { type: 'ORDER_WITHDRAWN'; payload: { nickname: string; selectionId: string; orderId?: string } }
  | { type: 'FOOD_SELECTION_OVERTIME'; payload: { foodSelectionId: string } }
  | {
      type: 'FOOD_SELECTION_EXTENDED';
      payload: { foodSelectionId: string; newEndsAt: string };
    }
  | { type: 'FOOD_SELECTION_ORDERING_STARTED'; payload: { foodSelection: FoodSelection } }
  | { type: 'FOOD_SELECTION_ORDERING_CLAIMED'; payload: { foodSelection: FoodSelection } }
  | { type: 'FOOD_SELECTION_DELIVERY_STARTED'; payload: { foodSelection: FoodSelection } }
  | { type: 'FOOD_SELECTION_DELIVERY_DUE'; payload: { foodSelectionId: string } }
  | { type: 'FOOD_SELECTION_COMPLETED'; payload: { foodSelection: FoodSelection } }
  | { type: 'FOOD_SELECTION_ABORTED'; payload: { foodSelectionId: string } }
  | {
      type: 'FOOD_SELECTION_ETA_UPDATED';
      payload: { foodSelectionId: string; etaMinutes: number; etaSetAt: string; deliveryDueAt: string };
    }
  | { type: 'START_NEW_TEAM_LUNCH' }
  | { type: 'SET_CONNECTED'; payload: boolean }
  | { type: 'SET_DB_CONNECTIVITY'; payload: { connected: boolean; attemptCount: number } }
  | { type: 'RESET_TO_INITIAL_STATE' };

// ─── Reducer ───────────────────────────────────────────────

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'INITIAL_STATE':
      return {
        ...state,
        activePoll: action.payload.activePoll,
        activeFoodSelection: action.payload.activeFoodSelection,
        latestCompletedPoll: action.payload.latestCompletedPoll,
        latestCompletedFoodSelection: action.payload.latestCompletedFoodSelection,
        completedFoodSelectionsHistory: action.payload.completedFoodSelectionsHistory,
        defaultFoodSelectionDurationMinutes: action.payload.defaultFoodSelectionDurationMinutes,
        initialized: true,
      };

    case 'SET_MENUS':
      return { ...state, menus: action.payload };

    case 'SET_SHOPPING_LIST':
      return { ...state, shoppingListItems: action.payload };

    case 'SET_COMPLETED_HISTORY':
      return { ...state, completedFoodSelectionsHistory: action.payload };

    case 'SET_CONNECTED':
      return { ...state, connected: action.payload };

    case 'SET_DB_CONNECTIVITY':
      return {
        ...state,
        dbConnected: action.payload.connected,
        dbReconnectAttempts: action.payload.attemptCount,
      };

    case 'RESET_TO_INITIAL_STATE':
      return initialAppState;

    // ── Menu events ──────────────────────────────────────

    case 'MENU_CREATED':
      return { ...state, menus: [...state.menus, action.payload.menu] };

    case 'MENU_UPDATED':
      return {
        ...state,
        menus: state.menus.map((m) =>
          m.id === action.payload.menu.id ? action.payload.menu : m,
        ),
      };

    case 'MENU_DELETED':
      return {
        ...state,
        menus: state.menus.filter((m) => m.id !== action.payload.menuId),
      };

    case 'ITEM_CREATED': {
      const { item } = action.payload;
      return {
        ...state,
        menus: state.menus.map((m) =>
          m.id === item.menuId
            ? { ...m, items: [...m.items, item], itemCount: m.items.length + 1 }
            : m,
        ),
      };
    }

    case 'ITEM_UPDATED': {
      const { item } = action.payload;
      return {
        ...state,
        menus: state.menus.map((m) =>
          m.id === item.menuId
            ? { ...m, items: m.items.map((i) => (i.id === item.id ? item : i)) }
            : m,
        ),
      };
    }

    case 'ITEM_DELETED': {
      const { itemId, menuId } = action.payload;
      return {
        ...state,
        menus: state.menus.map((m) =>
          m.id === menuId
            ? {
                ...m,
                items: m.items.filter((i) => i.id !== itemId),
                itemCount: m.items.length - 1,
              }
            : m,
        ),
      };
    }

    case 'SHOPPING_LIST_ITEM_ADDED':
      return {
        ...state,
        shoppingListItems: [action.payload.item, ...state.shoppingListItems],
      };

    case 'SHOPPING_LIST_ITEM_UPDATED':
      return {
        ...state,
        shoppingListItems: state.shoppingListItems.map((item) =>
          item.id === action.payload.item.id ? action.payload.item : item,
        ),
      };

    // ── Poll events ──────────────────────────────────────

    case 'POLL_STARTED':
      return { ...state, activePoll: action.payload.poll };

    case 'VOTE_CAST':
    case 'VOTE_WITHDRAWN': {
      if (!state.activePoll || state.activePoll.id !== action.payload.poll.id) return state;
      return {
        ...state,
        activePoll: action.payload.poll,
      };
    }

    case 'POLL_ENDED': {
      if (!state.activePoll || state.activePoll.id !== action.payload.pollId) return state;

      if (action.payload.status === 'tied') {
        return {
          ...state,
          activePoll: { ...state.activePoll, status: 'tied' },
        };
      }

      if (action.payload.status === 'aborted') {
        // Aborted — clear active poll, return to idle
        return {
          ...state,
          activePoll: null,
        };
      }

      // finished — move from active to latestCompleted
      const finishedPoll: Poll = {
        ...state.activePoll,
        status: 'finished',
        endedPrematurely: action.payload.endedPrematurely ?? false,
        winnerMenuId: action.payload.winner?.menuId ?? null,
        winnerMenuName: action.payload.winner?.menuName ?? null,
        winnerSelectedRandomly: action.payload.winner?.selectedRandomly ?? false,
      };

      return {
        ...state,
        activePoll: null,
        latestCompletedPoll: finishedPoll,
      };
    }

    case 'POLL_EXTENDED': {
      if (!state.activePoll || state.activePoll.id !== action.payload.pollId) return state;
      return {
        ...state,
        activePoll: {
          ...state.activePoll,
          status: 'active',
          endsAt: action.payload.newEndsAt,
        },
      };
    }

    // ── Food selection events ────────────────────────────

    case 'FOOD_SELECTION_STARTED':
      return { ...state, activeFoodSelection: action.payload.foodSelection };

    case 'ORDER_PLACED': {
      if (!state.activeFoodSelection) return state;
      const { order } = action.payload;
      const existingIdx = state.activeFoodSelection.orders.findIndex((o) => o.id === order.id);
      const orders =
        existingIdx >= 0
          ? state.activeFoodSelection.orders.map((o, i) => (i === existingIdx ? order : o))
          : [...state.activeFoodSelection.orders, order];
      return {
        ...state,
        activeFoodSelection: { ...state.activeFoodSelection, orders },
      };
    }

    case 'ORDER_UPDATED': {
      const { order } = action.payload;
      const updateOrderList = (orders: FoodOrder[]): FoodOrder[] =>
        orders.map((o) => (o.id === order.id ? order : o));

      return {
        ...state,
        activeFoodSelection: state.activeFoodSelection
          ? {
              ...state.activeFoodSelection,
              orders: updateOrderList(state.activeFoodSelection.orders),
            }
          : null,
        latestCompletedFoodSelection: state.latestCompletedFoodSelection
          ? {
              ...state.latestCompletedFoodSelection,
              orders: updateOrderList(state.latestCompletedFoodSelection.orders),
            }
          : null,
        completedFoodSelectionsHistory: state.completedFoodSelectionsHistory.map((selection) =>
          selection.orders.some((o) => o.id === order.id)
            ? { ...selection, orders: updateOrderList(selection.orders) }
            : selection,
        ),
      };
    }

    case 'ORDER_WITHDRAWN': {
      if (!state.activeFoodSelection) return state;
      const { nickname, orderId } = action.payload;
      return {
        ...state,
        activeFoodSelection: {
          ...state.activeFoodSelection,
          orders: state.activeFoodSelection.orders.filter((o) => {
            if (o.nickname !== nickname) return true;
            if (!orderId) return false;
            return o.id !== orderId;
          }),
        },
      };
    }

    case 'FOOD_SELECTION_OVERTIME': {
      if (
        !state.activeFoodSelection ||
        state.activeFoodSelection.id !== action.payload.foodSelectionId
      )
        return state;
      return {
        ...state,
        activeFoodSelection: { ...state.activeFoodSelection, status: 'overtime' },
      };
    }

    case 'FOOD_SELECTION_EXTENDED': {
      if (
        !state.activeFoodSelection ||
        state.activeFoodSelection.id !== action.payload.foodSelectionId
      )
        return state;
      return {
        ...state,
        activeFoodSelection: {
          ...state.activeFoodSelection,
          status: 'active',
          endsAt: action.payload.newEndsAt,
        },
      };
    }

    case 'FOOD_SELECTION_DELIVERY_STARTED':
      return {
        ...state,
        activeFoodSelection: action.payload.foodSelection,
      };

    case 'FOOD_SELECTION_ORDERING_STARTED':
    case 'FOOD_SELECTION_ORDERING_CLAIMED':
      return {
        ...state,
        activeFoodSelection: action.payload.foodSelection,
      };

    case 'FOOD_SELECTION_DELIVERY_DUE': {
      if (
        !state.activeFoodSelection ||
        state.activeFoodSelection.id !== action.payload.foodSelectionId
      ) {
        return state;
      }
      return {
        ...state,
        activeFoodSelection: {
          ...state.activeFoodSelection,
          status: 'delivery_due',
        },
      };
    }

    case 'FOOD_SELECTION_COMPLETED':
      return {
        ...state,
        activeFoodSelection: null,
        latestCompletedFoodSelection: action.payload.foodSelection,
        completedFoodSelectionsHistory: [
          action.payload.foodSelection,
          ...state.completedFoodSelectionsHistory.filter(
            (selection) => selection.id !== action.payload.foodSelection.id,
          ),
        ],
      };

    case 'FOOD_SELECTION_ETA_UPDATED': {
      const updateEta = (selection: FoodSelection): FoodSelection => ({
        ...selection,
        status: 'delivering',
        etaMinutes: action.payload.etaMinutes,
        etaSetAt: action.payload.etaSetAt,
        deliveryDueAt: action.payload.deliveryDueAt,
      });

      return {
        ...state,
        activeFoodSelection:
          state.activeFoodSelection?.id === action.payload.foodSelectionId
            ? updateEta(state.activeFoodSelection)
            : state.activeFoodSelection,
        latestCompletedFoodSelection:
          state.latestCompletedFoodSelection?.id === action.payload.foodSelectionId
            ? updateEta(state.latestCompletedFoodSelection)
            : state.latestCompletedFoodSelection,
        completedFoodSelectionsHistory: state.completedFoodSelectionsHistory.map((selection) =>
          selection.id === action.payload.foodSelectionId ? updateEta(selection) : selection,
        ),
      };
    }

    case 'FOOD_SELECTION_ABORTED': {
      if (
        state.activeFoodSelection &&
        state.activeFoodSelection.id !== action.payload.foodSelectionId
      ) {
        return state;
      }
      return resetTeamLunchProcess(state);
    }

    case 'START_NEW_TEAM_LUNCH':
      return resetTeamLunchProcess(state);

    default:
      return initialAppState;
  }
}

// ─── Context ───────────────────────────────────────────────

const AppStateContext = createContext<AppState>(initialAppState);
const AppDispatchContext = createContext<Dispatch<AppAction>>(() => {
  /* noop default */
});

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialAppState);

  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>{children}</AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppState {
  return useContext(AppStateContext);
}

export function useAppDispatch(): Dispatch<AppAction> {
  return useContext(AppDispatchContext);
}
