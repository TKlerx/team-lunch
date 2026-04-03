import type {
  Menu,
  MenuItem,
  Poll,
  FoodSelection,
  FoodOrder,
  UserPreferences,
  UserMenuDefaultPreference,
  ImportMenuResponse,
  ImportMenuViolation,
  ImportMenuPreviewResponse,
  RemindMissingOrdersResponse,
  FoodSelectionFallbackCandidate,
  PlaceFallbackOrderRequest,
  PingFallbackCandidateRequest,
  PingFallbackCandidateResponse,
  ShoppingListItem,
} from '../lib/types.js';
import { withOfficeLocationContext } from './config.js';

type ApiErrorBody = {
  error?: string;
  violations?: ImportMenuViolation[];
};

type RequestError = Error & {
  status?: number;
  body?: ApiErrorBody;
};

// ─── Generic helpers ───────────────────────────────────────

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};
  if (options?.body) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, {
    headers,
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText })) as ApiErrorBody;
    const err = new Error(body.error ?? res.statusText) as RequestError;
    err.status = res.status;
    err.body = body;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function apiPath(path: string): string {
  return withOfficeLocationContext(`/api${path}`);
}

// ─── Menu API ──────────────────────────────────────────────

export function fetchMenus(): Promise<Menu[]> {
  return request<Menu[]>(apiPath('/menus'));
}

export function createMenu(name: string): Promise<Menu> {
  return request<Menu>(apiPath('/menus'), {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export type ImportMenuError = Error & {
  status?: number;
  violations?: ImportMenuViolation[];
};

function wrapImportViolations(err: unknown): never {
  const e = err as RequestError;
  const wrapped = e as ImportMenuError;
  if (e.body?.violations) {
    wrapped.violations = e.body.violations;
  }
  throw wrapped;
}

export async function importMenuJson(payload: unknown): Promise<ImportMenuResponse> {
  try {
    return await request<ImportMenuResponse>(apiPath('/menus/import'), {
      method: 'POST',
      body: JSON.stringify({ payload }),
    });
  } catch (err) {
    wrapImportViolations(err);
  }
}

export async function previewImportMenuJson(payload: unknown): Promise<ImportMenuPreviewResponse> {
  try {
    return await request<ImportMenuPreviewResponse>(apiPath('/menus/import/preview'), {
      method: 'POST',
      body: JSON.stringify({ payload }),
    });
  } catch (err) {
    wrapImportViolations(err);
  }
}

export type UpdateMenuPayload = {
  name: string;
  location?: string | null;
  phone?: string | null;
  url?: string | null;
};

export function updateMenu(id: string, payload: string | UpdateMenuPayload): Promise<Menu> {
  const bodyPayload = typeof payload === 'string' ? { name: payload } : payload;
  return request<Menu>(apiPath(`/menus/${id}`), {
    method: 'PUT',
    body: JSON.stringify(bodyPayload),
  });
}

export function deleteMenu(id: string): Promise<void> {
  return request<void>(apiPath(`/menus/${id}`), { method: 'DELETE' });
}

export function createMenuItem(
  menuId: string,
  payload: {
    name: string;
    description?: string;
    itemNumber?: string | null;
    price?: number | null;
  },
): Promise<MenuItem> {
  return request<MenuItem>(apiPath(`/menus/${menuId}/items`), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateMenuItem(
  menuId: string,
  itemId: string,
  payload: {
    name: string;
    description?: string;
    itemNumber?: string | null;
    price?: number | null;
  },
): Promise<MenuItem> {
  return request<MenuItem>(apiPath(`/menus/${menuId}/items/${itemId}`), {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function deleteMenuItem(menuId: string, itemId: string): Promise<void> {
  return request<void>(apiPath(`/menus/${menuId}/items/${itemId}`), { method: 'DELETE' });
}

// ─── Poll API ──────────────────────────────────────────────

export function startPoll(
  description: string,
  durationMinutes: number,
  excludedMenuJustifications?: Array<{ menuId: string; reason: string }>,
): Promise<Poll> {
  return request<Poll>(apiPath('/polls'), {
    method: 'POST',
    body: JSON.stringify({ description, durationMinutes, excludedMenuJustifications }),
  });
}

export function castVote(pollId: string, menuId: string, nickname: string): Promise<Poll> {
  return request<Poll>(apiPath(`/polls/${pollId}/votes`), {
    method: 'POST',
    body: JSON.stringify({ menuId, nickname }),
  });
}

export function withdrawVote(pollId: string, menuId: string, nickname: string): Promise<Poll> {
  return request<Poll>(apiPath(`/polls/${pollId}/votes`), {
    method: 'DELETE',
    body: JSON.stringify({ menuId, nickname }),
  });
}

export function withdrawAllVotes(pollId: string, nickname: string): Promise<Poll> {
  return request<Poll>(apiPath(`/polls/${pollId}/votes/all`), {
    method: 'DELETE',
    body: JSON.stringify({ nickname }),
  });
}

export function extendPoll(pollId: string, extensionMinutes: number): Promise<Poll> {
  return request<Poll>(apiPath(`/polls/${pollId}/extend`), {
    method: 'POST',
    body: JSON.stringify({ extensionMinutes }),
  });
}

export function endPoll(pollId: string): Promise<Poll> {
  return request<Poll>(apiPath(`/polls/${pollId}/end`), { method: 'POST' });
}

export function updatePollTimer(pollId: string, remainingMinutes: number): Promise<Poll> {
  return request<Poll>(apiPath(`/polls/${pollId}/timer`), {
    method: 'POST',
    body: JSON.stringify({ remainingMinutes }),
  });
}

export function randomWinner(pollId: string): Promise<Poll> {
  return request<Poll>(apiPath(`/polls/${pollId}/random-winner`), { method: 'POST' });
}

export function abortPoll(pollId: string): Promise<Poll> {
  return request<Poll>(apiPath(`/polls/${pollId}/abort`), { method: 'POST' });
}

// ─── Food Selection API ────────────────────────────────────

export function startFoodSelection(
  pollId: string,
  durationMinutes: number,
): Promise<FoodSelection> {
  return request<FoodSelection>(apiPath('/food-selections'), {
    method: 'POST',
    body: JSON.stringify({ pollId, durationMinutes }),
  });
}

export function placeOrder(
  selectionId: string,
  nickname: string,
  itemId: string,
  notes?: string,
): Promise<FoodOrder> {
  return request<FoodOrder>(apiPath(`/food-selections/${selectionId}/orders`), {
    method: 'POST',
    body: JSON.stringify({ nickname, itemId, notes }),
  });
}

export function withdrawOrder(selectionId: string, nickname: string, orderId?: string): Promise<void> {
  return request<void>(apiPath(`/food-selections/${selectionId}/orders`), {
    method: 'DELETE',
    body: JSON.stringify({ nickname, orderId }),
  });
}

export function extendFoodSelection(
  selectionId: string,
  extensionMinutes: number,
): Promise<FoodSelection> {
  return request<FoodSelection>(apiPath(`/food-selections/${selectionId}/extend`), {
    method: 'POST',
    body: JSON.stringify({ extensionMinutes }),
  });
}

export function completeFoodSelection(selectionId: string): Promise<FoodSelection> {
  return request<FoodSelection>(apiPath(`/food-selections/${selectionId}/complete`), {
    method: 'POST',
  });
}

export function completeFoodSelectionNow(selectionId: string): Promise<FoodSelection> {
  return request<FoodSelection>(apiPath(`/food-selections/${selectionId}/complete-now`), {
    method: 'POST',
  });
}

export function remindMissingOrders(selectionId: string): Promise<RemindMissingOrdersResponse> {
  return request<RemindMissingOrdersResponse>(apiPath(`/food-selections/${selectionId}/remind-missing`), {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function fetchFallbackOrderCandidates(
  selectionId: string,
): Promise<FoodSelectionFallbackCandidate[]> {
  return request<FoodSelectionFallbackCandidate[]>(apiPath(`/food-selections/${selectionId}/fallback-candidates`));
}

export function placeFallbackOrder(
  selectionId: string,
  payload: PlaceFallbackOrderRequest,
): Promise<FoodOrder> {
  return request<FoodOrder>(apiPath(`/food-selections/${selectionId}/fallback-orders`), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function pingFallbackCandidate(
  selectionId: string,
  payload: PingFallbackCandidateRequest,
): Promise<PingFallbackCandidateResponse> {
  return request<PingFallbackCandidateResponse>(apiPath(`/food-selections/${selectionId}/fallback-reminders`), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function rateOrder(
  selectionId: string,
  orderId: string,
  nickname: string,
  rating: number,
  feedbackComment?: string | null,
): Promise<FoodOrder> {
  return request<FoodOrder>(apiPath(`/food-selections/${selectionId}/orders/${orderId}/rating`), {
    method: 'POST',
    body: JSON.stringify({ nickname, rating, feedbackComment }),
  });
}

export function setOrderProcessed(
  selectionId: string,
  orderId: string,
  processed: boolean,
  nickname?: string,
): Promise<FoodOrder> {
  return request<FoodOrder>(apiPath(`/food-selections/${selectionId}/orders/${orderId}/processed`), {
    method: 'PATCH',
    body: JSON.stringify({ processed, nickname }),
  });
}

export function setOrderDelivered(
  selectionId: string,
  orderId: string,
  delivered: boolean,
  nickname?: string,
): Promise<FoodOrder> {
  return request<FoodOrder>(apiPath(`/food-selections/${selectionId}/orders/${orderId}/delivered`), {
    method: 'PATCH',
    body: JSON.stringify({ delivered, nickname }),
  });
}

export async function exportMyOrdersExcel(nickname: string): Promise<Blob> {
  const url = `${apiPath('/food-selections/export/mine')}?nickname=${encodeURIComponent(nickname)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText })) as ApiErrorBody;
    const err = new Error(body.error ?? res.statusText) as RequestError;
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return res.blob();
}

export function placeDeliveryOrder(
  selectionId: string,
  etaMinutes: number,
  nickname?: string,
): Promise<FoodSelection> {
  return request<FoodSelection>(apiPath(`/food-selections/${selectionId}/place-order`), {
    method: 'POST',
    body: JSON.stringify({ etaMinutes, nickname }),
  });
}

export function claimOrderingResponsibility(
  selectionId: string,
  nickname?: string,
): Promise<FoodSelection> {
  return request<FoodSelection>(apiPath(`/food-selections/${selectionId}/claim-ordering`), {
    method: 'POST',
    body: JSON.stringify({ nickname }),
  });
}

export function updateFoodSelectionTimer(
  selectionId: string,
  remainingMinutes: number,
): Promise<FoodSelection> {
  return request<FoodSelection>(apiPath(`/food-selections/${selectionId}/timer`), {
    method: 'POST',
    body: JSON.stringify({ remainingMinutes }),
  });
}

export function abortFoodSelection(selectionId: string): Promise<FoodSelection> {
  return request<FoodSelection>(apiPath(`/food-selections/${selectionId}/abort`), {
    method: 'POST',
  });
}

export function fetchFoodSelectionsHistory(): Promise<FoodSelection[]> {
  return request<FoodSelection[]>(apiPath('/food-selections/history'));
}

export function updateFoodSelectionEta(
  selectionId: string,
  etaMinutes: number,
): Promise<FoodSelection> {
  return request<FoodSelection>(apiPath(`/food-selections/${selectionId}/eta`), {
    method: 'POST',
    body: JSON.stringify({ etaMinutes }),
  });
}

export function confirmFoodArrival(selectionId: string): Promise<FoodSelection> {
  return request<FoodSelection>(apiPath(`/food-selections/${selectionId}/confirm-arrival`), {
    method: 'POST',
  });
}

export function quickStartFoodSelection(durationMinutes: number): Promise<FoodSelection> {
  return request<FoodSelection>(apiPath('/food-selections/quick-start'), {
    method: 'POST',
    body: JSON.stringify({ durationMinutes }),
  });
}

export function getUserPreferences(nickname: string): Promise<UserPreferences> {
  const url = `${apiPath('/user/preferences')}?nickname=${encodeURIComponent(nickname)}`;
  return request<UserPreferences>(url);
}

export function updateUserPreferences(
  nickname: string,
  allergies: string[],
  dislikes: string[],
): Promise<UserPreferences> {
  return request<UserPreferences>(apiPath('/user/preferences'), {
    method: 'PUT',
    body: JSON.stringify({ nickname, allergies, dislikes }),
  });
}

export function getUserMenuDefaultPreferences(nickname: string): Promise<UserMenuDefaultPreference[]> {
  const url = `${apiPath('/user/menu-defaults')}?nickname=${encodeURIComponent(nickname)}`;
  return request<UserMenuDefaultPreference[]>(url);
}

export function updateUserMenuDefaultPreference(
  menuId: string,
  nickname: string,
  itemId: string | null,
  defaultComment: string | null,
  allowOrganizerFallback: boolean,
): Promise<UserMenuDefaultPreference> {
  return request<UserMenuDefaultPreference>(apiPath(`/user/menu-defaults/${menuId}`), {
    method: 'PUT',
    body: JSON.stringify({ nickname, itemId, defaultComment, allowOrganizerFallback }),
  });
}

export function fetchShoppingListItems(): Promise<ShoppingListItem[]> {
  return request<ShoppingListItem[]>(apiPath('/shopping-list'));
}

export function createShoppingListItem(name: string, nickname?: string): Promise<ShoppingListItem> {
  return request<ShoppingListItem>(apiPath('/shopping-list'), {
    method: 'POST',
    body: JSON.stringify({ name, nickname }),
  });
}

export function markShoppingListItemBought(
  itemId: string,
  nickname?: string,
): Promise<ShoppingListItem> {
  return request<ShoppingListItem>(apiPath(`/shopping-list/${itemId}/bought`), {
    method: 'POST',
    body: JSON.stringify({ nickname }),
  });
}
