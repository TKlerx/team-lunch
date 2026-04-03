// ─── Domain Enums ──────────────────────────────────────────

export type PollStatus = 'active' | 'tied' | 'finished' | 'aborted';

export type FoodSelectionStatus =
  | 'active'
  | 'overtime'
  | 'ordering'
  | 'delivering'
  | 'delivery_due'
  | 'completed'
  | 'aborted';

export type AppPhase =
  | 'NICKNAME_PROMPT'
  | 'NO_MENUS'
  | 'POLL_IDLE'
  | 'POLL_ACTIVE'
  | 'POLL_TIED'
  | 'POLL_FINISHED'
  | 'FOOD_SELECTION_ACTIVE'
  | 'FOOD_SELECTION_OVERTIME'
  | 'FOOD_ORDERING'
  | 'FOOD_DELIVERY_ACTIVE'
  | 'FOOD_DELIVERY_DUE'
  | 'FOOD_SELECTION_COMPLETED';

// ─── Domain models (API response shapes) ───────────────────

export interface Menu {
  id: string;
  name: string;
  location: string | null;
  phone: string | null;
  url: string | null;
  sourceDateCreated: string | null;
  createdAt: string;
  items: MenuItem[];
  itemCount: number;
}

export interface OfficeLocation {
  id: string;
  key: string;
  name: string;
  isActive: boolean;
  autoStartPollEnabled: boolean;
  autoStartPollWeekdays: OfficeWeekday[];
  autoStartPollFinishTime: string | null;
  defaultFoodSelectionDurationMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export type OfficeWeekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export interface MenuItem {
  id: string;
  menuId: string;
  itemNumber?: string | null;
  name: string;
  description: string | null;
  price: number | null;
  createdAt: string;
}

export interface Poll {
  id: string;
  createdBy?: string | null;
  description: string;
  status: PollStatus;
  startedAt: string;
  endsAt: string;
  endedPrematurely: boolean;
  winnerMenuId: string | null;
  winnerMenuName: string | null;
  winnerSelectedRandomly: boolean;
  createdAt: string;
  excludedMenuJustifications: PollExcludedMenuJustification[];
  votes: PollVote[];
  voteCounts: Record<string, number>;
}

export interface PollExcludedMenuJustification {
  menuId: string;
  menuName: string;
  reason: string;
}

export interface PollVote {
  id: string;
  pollId: string;
  menuId: string;
  menuName: string;
  nickname: string;
  castAt: string;
}

export interface FoodSelection {
  id: string;
  createdBy?: string | null;
  pollId: string;
  menuId: string | null;
  menuName: string;
  status: FoodSelectionStatus;
  startedAt: string;
  endsAt: string;
  orderPlacedAt: string | null;
  orderPlacedBy: string | null;
  completedAt: string | null;
  etaMinutes: number | null;
  etaSetAt: string | null;
  deliveryDueAt: string | null;
  createdAt: string;
  orders: FoodOrder[];
}

export interface FoodOrder {
  id: string;
  selectionId: string;
  nickname: string;
  itemId: string | null;
  itemName: string;
  notes: string | null;
  feedbackComment?: string | null;
  processed?: boolean;
  processedAt?: string | null;
  delivered?: boolean;
  deliveredAt?: string | null;
  orderedAt: string;
  rating?: number | null;
  ratedAt?: string | null;
}

export interface FoodSelectionFallbackCandidate {
  nickname: string;
  itemId: string;
  itemName: string;
  itemNumber?: string | null;
  defaultComment?: string | null;
}

export interface UserPreferences {
  userKey: string;
  allergies: string[];
  dislikes: string[];
  updatedAt: string;
}

export interface UserMenuDefaultPreference {
  userKey: string;
  menuId: string;
  itemId: string | null;
  defaultComment: string | null;
  allowOrganizerFallback: boolean;
  updatedAt: string;
}

export interface ShoppingListItem {
  id: string;
  name: string;
  requestedBy: string;
  bought: boolean;
  boughtBy: string | null;
  boughtAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── API Request shapes ────────────────────────────────────

export interface CreateMenuRequest {
  name: string;
}

export interface UpdateMenuRequest {
  name: string;
  location?: string | null;
  phone?: string | null;
  url?: string | null;
}

export interface CreateMenuItemRequest {
  name: string;
  description?: string;
  itemNumber?: string | null;
  price?: number | null;
}

export interface UpdateMenuItemRequest {
  name: string;
  description?: string;
  itemNumber?: string | null;
  price?: number | null;
}

export interface ImportMenuViolation {
  path: string;
  message: string;
}

export interface ImportMenuRequest {
  payload: unknown;
}

export interface ImportMenuResponse {
  menu: Menu;
  created: boolean;
}

export interface ImportMenuItemSummary {
  created: number;
  updated: number;
  deleted: number;
}

export interface ImportMenuPreviewResponse {
  menuName: string;
  menuExists: boolean;
  itemSummary: ImportMenuItemSummary;
}

export interface StartPollRequest {
  description: string;
  durationMinutes: number;
  excludedMenuJustifications?: Array<{
    menuId: string;
    reason: string;
  }>;
}

export interface CastVoteRequest {
  menuId: string;
  nickname: string;
}

export interface WithdrawVoteRequest {
  menuId: string;
  nickname: string;
}

export interface ExtendPollRequest {
  extensionMinutes: number;
}

export type RandomWinnerRequest = Record<string, never>;

export interface StartFoodSelectionRequest {
  pollId: string;
  durationMinutes: number;
}

export interface PlaceOrderRequest {
  nickname: string;
  itemId: string;
  notes?: string;
}

export interface WithdrawOrderRequest {
  nickname: string;
  orderId?: string;
}

export interface RateFoodOrderRequest {
  nickname: string;
  rating: number;
  feedbackComment?: string | null;
}

export interface UpdateFoodOrderProcessedRequest {
  processed: boolean;
  nickname?: string;
}

export interface UpdateFoodOrderDeliveredRequest {
  delivered: boolean;
  nickname?: string;
}

export interface AbortFoodSelectionRequest {
  reason?: string;
}

export interface ExtendFoodSelectionRequest {
  extensionMinutes: number;
}

export interface UpdateRemainingTimerRequest {
  remainingMinutes: number;
}

export interface QuickStartFoodSelectionRequest {
  durationMinutes: number;
}

export interface UpdateFoodSelectionEtaRequest {
  etaMinutes: number;
}

export interface PlaceDeliveryOrderRequest {
  etaMinutes: number;
  nickname?: string;
}

export interface ClaimOrderingResponsibilityRequest {
  nickname?: string;
}

export type RemindMissingOrdersRequest = Record<string, never>;

export interface RemindMissingOrdersResponse {
  remindedCount: number;
}

export interface PlaceFallbackOrderRequest {
  nickname: string;
  actingNickname?: string;
}

export interface PingFallbackCandidateRequest {
  nickname: string;
  actingNickname?: string;
}

export interface PingFallbackCandidateResponse {
  targetNickname: string;
}

export interface UpdateUserPreferencesRequest {
  nickname?: string;
  allergies: string[];
  dislikes: string[];
}

export interface UpdateUserMenuDefaultPreferenceRequest {
  nickname?: string;
  itemId: string | null;
  defaultComment?: string | null;
  allowOrganizerFallback: boolean;
}

export interface CreateShoppingListItemRequest {
  name: string;
  nickname?: string;
}

export interface MarkShoppingListItemBoughtRequest {
  nickname?: string;
}

export interface LocalLoginRequest {
  username: string;
  password: string;
}

export interface LocalLoginResponse {
  username: string;
}

export interface UpdateOfficeLocationSettingsRequest {
  autoStartPollEnabled: boolean;
  autoStartPollWeekdays: OfficeWeekday[];
  autoStartPollFinishTime: string | null;
  defaultFoodSelectionDurationMinutes: number;
}

// ─── API Response shapes ───────────────────────────────────

export interface ErrorResponse {
  error: string;
}

// ─── SSE Event Types ───────────────────────────────────────

export interface InitialStatePayload {
  activePoll: Poll | null;
  activeFoodSelection: FoodSelection | null;
  latestCompletedPoll: Poll | null;
  latestCompletedFoodSelection: FoodSelection | null;
  completedFoodSelectionsHistory: FoodSelection[];
  defaultFoodSelectionDurationMinutes: number;
}

export type SSEEvent =
  | { type: 'initial_state'; payload: InitialStatePayload }
  | { type: 'menu_created'; payload: { menu: Menu } }
  | { type: 'menu_updated'; payload: { menu: Menu } }
  | { type: 'menu_deleted'; payload: { menuId: string } }
  | { type: 'item_created'; payload: { item: MenuItem } }
  | { type: 'item_updated'; payload: { item: MenuItem } }
  | { type: 'item_deleted'; payload: { itemId: string; menuId: string } }
  | { type: 'shopping_list_item_added'; payload: { item: ShoppingListItem } }
  | { type: 'shopping_list_item_updated'; payload: { item: ShoppingListItem } }
  | { type: 'poll_started'; payload: { poll: Poll } }
  | { type: 'vote_cast'; payload: { poll: Poll } }
  | { type: 'vote_withdrawn'; payload: { poll: Poll } }
  | { type: 'poll_ended'; payload: { pollId: string; status: 'finished' | 'tied' | 'aborted'; endedPrematurely?: boolean; winner?: { menuId: string; menuName: string; selectedRandomly: boolean } } }
  | { type: 'poll_extended'; payload: { pollId: string; newEndsAt: string } }
  | { type: 'food_selection_started'; payload: { foodSelection: FoodSelection } }
  | { type: 'order_placed'; payload: { order: FoodOrder } }
  | { type: 'order_updated'; payload: { order: FoodOrder } }
  | { type: 'order_withdrawn'; payload: { nickname: string; selectionId: string; orderId?: string } }
  | { type: 'food_selection_overtime'; payload: { foodSelectionId: string } }
  | { type: 'food_selection_extended'; payload: { foodSelectionId: string; newEndsAt: string } }
  | { type: 'food_selection_ordering_started'; payload: { foodSelection: FoodSelection } }
  | { type: 'food_selection_ordering_claimed'; payload: { foodSelection: FoodSelection } }
  | {
      type: 'food_selection_fallback_pinged';
      payload: {
        foodSelectionId: string;
        menuName: string;
        targetNickname: string;
        actorNickname: string;
        itemName: string;
        itemNumber?: string | null;
      };
    }
  | { type: 'food_selection_delivery_started'; payload: { foodSelection: FoodSelection } }
  | { type: 'food_selection_delivery_due'; payload: { foodSelectionId: string } }
  | { type: 'food_selection_completed'; payload: { foodSelection: FoodSelection } }
  | { type: 'food_selection_aborted'; payload: { foodSelectionId: string } }
  | {
      type: 'food_selection_eta_updated';
      payload: { foodSelectionId: string; etaMinutes: number; etaSetAt: string; deliveryDueAt: string };
    };
