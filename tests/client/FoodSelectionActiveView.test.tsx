import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from './testRender.js';
import { MemoryRouter } from 'react-router-dom';
import { makeFoodSelection, makeFoodOrder, makeMenu, makeMenuItem, makePoll, setupUser } from './helpers.js';
import type { AppState } from '../../src/client/context/AppContext.js';
import { initialAppState } from '../../src/client/context/AppContext.js';

// ─── Mocks ─────────────────────────────────────────────────

const mockUseAppState = vi.fn<() => AppState>();

vi.mock('../../src/client/context/AppContext.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/client/context/AppContext.js')>();
  return {
    ...mod,
    useAppState: (...args: unknown[]) => mockUseAppState(...(args as [])),
  };
});

const mockUseCountdown = vi.fn<() => number>();
vi.mock('../../src/client/hooks/useCountdown.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/client/hooks/useCountdown.js')>();
  return {
    ...mod,
    useCountdown: (...args: unknown[]) => mockUseCountdown(...(args as [])),
  };
});

const mockIsAdminAuthenticatedUser = vi.fn(() => true);
const mockIsCreatorAuthenticatedUser = vi.fn<(createdBy: string | null | undefined) => boolean>(() => false);
vi.mock('../../src/client/auth.js', () => ({
  getAuthenticatedActorKey: () => 'alice@example.com',
  getAuthenticatedDisplayLabel: () => 'Alice',
  isAdminAuthenticatedUser: () => mockIsAdminAuthenticatedUser(),
  isCreatorAuthenticatedUser: (createdBy: string | null | undefined) =>
    mockIsCreatorAuthenticatedUser(createdBy),
}));

const mockPlaceOrder = vi.fn();
const mockWithdrawOrder = vi.fn();
const mockCompleteFoodSelectionNow = vi.fn();
const mockAbortFoodSelection = vi.fn();
const mockUpdateFoodSelectionTimer = vi.fn();
const mockGetUserPreferences = vi.fn();
const mockUpdateUserPreferences = vi.fn();
const mockRemindMissingOrders = vi.fn();
const mockRecommendMeal = vi.fn();
const mockExploreMeal = vi.fn();
const mockFetchMealRecommendationMarks = vi.fn();
const mockUpsertMealRecommendationMark = vi.fn();
const mockDeleteMealRecommendationMark = vi.fn();
const mockFetchMealRecommendationOnboardingCandidates = vi.fn();
const scrollIntoViewMock = vi.fn();
vi.mock('../../src/client/api.js', () => ({
  placeOrder: (...args: unknown[]) => mockPlaceOrder(...args),
  withdrawOrder: (...args: unknown[]) => mockWithdrawOrder(...args),
  completeFoodSelectionNow: (...args: unknown[]) => mockCompleteFoodSelectionNow(...args),
  abortFoodSelection: (...args: unknown[]) => mockAbortFoodSelection(...args),
  updateFoodSelectionTimer: (...args: unknown[]) => mockUpdateFoodSelectionTimer(...args),
  getUserPreferences: (...args: unknown[]) => mockGetUserPreferences(...args),
  updateUserPreferences: (...args: unknown[]) => mockUpdateUserPreferences(...args),
  remindMissingOrders: (...args: unknown[]) => mockRemindMissingOrders(...args),
  recommendMeal: (...args: unknown[]) => mockRecommendMeal(...args),
  exploreMeal: (...args: unknown[]) => mockExploreMeal(...args),
  fetchMealRecommendationMarks: (...args: unknown[]) => mockFetchMealRecommendationMarks(...args),
  upsertMealRecommendationMark: (...args: unknown[]) => mockUpsertMealRecommendationMark(...args),
  deleteMealRecommendationMark: (...args: unknown[]) => mockDeleteMealRecommendationMark(...args),
  fetchMealRecommendationOnboardingCandidates: (...args: unknown[]) =>
    mockFetchMealRecommendationOnboardingCandidates(...args),
}));

import FoodSelectionActiveView from '../../src/client/components/FoodSelectionActiveView.js';

function renderView() {
  return render(
    <MemoryRouter>
      <FoodSelectionActiveView />
    </MemoryRouter>,
  );
}

describe('FoodSelectionActiveView', () => {
  const menuItems = [
    makeMenuItem({ id: 'item-1', itemNumber: '12', name: 'Margherita', description: 'Classic pizza', price: 9.5 }),
    makeMenuItem({ id: 'item-2', name: 'Pepperoni', description: null, price: 11 }),
  ];
  const menus = [makeMenu({ id: 'menu-1', name: 'Pizza Place', items: menuItems })];

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock,
    });
    mockGetUserPreferences.mockResolvedValue({
      userKey: 'Alice',
      allergies: [],
      dislikes: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockUpdateUserPreferences.mockResolvedValue({
      userKey: 'Alice',
      allergies: [],
      dislikes: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockRemindMissingOrders.mockResolvedValue({ remindedCount: 1 });
    mockFetchMealRecommendationMarks.mockResolvedValue({ marks: [] });
    mockFetchMealRecommendationOnboardingCandidates.mockResolvedValue({ candidates: [] });
    mockUseCountdown.mockReturnValue(600); // 10 min
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus,
      latestCompletedPoll: makePoll({
        id: 'poll-1',
        status: 'finished',
        winnerMenuId: 'menu-1',
        winnerMenuName: 'Pizza Place',
        votes: [
          {
            id: 'vote-1',
            pollId: 'poll-1',
            menuId: 'menu-1',
            menuName: 'Pizza Place',
            nickname: 'Alice',
            castAt: '2026-01-01T12:01:00.000Z',
          },
          {
            id: 'vote-2',
            pollId: 'poll-1',
            menuId: 'menu-1',
            menuName: 'Pizza Place',
            nickname: 'Bob',
            castAt: '2026-01-01T12:02:00.000Z',
          },
        ],
        voteCounts: { 'menu-1': 2 },
      }),
      activeFoodSelection: makeFoodSelection({
        menuId: 'menu-1',
        menuName: 'Pizza Place',
        orders: [],
      }),
    });
  });

  it('shows countdown bar with menu name and time', () => {
    renderView();
    expect(screen.getByText(/pizza place/i)).toBeInTheDocument();
    expect(screen.getByText('10:00')).toBeInTheDocument();
  });

  it('renders "Your order" title and menu items', () => {
    renderView();
    expect(screen.getByText('Your order')).toBeInTheDocument();
    const preferencesLink = screen.getByRole('link', { name: /ingredient preferences/i });
    expect(preferencesLink).toHaveAttribute('href', '/settings');
    expect(preferencesLink).toHaveAttribute(
      'title',
      [
        'Ingredient Preferences',
        'Ingredients to avoid: None configured',
        'Less preferred ingredients: None configured',
      ].join('\n'),
    );
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Margherita')).toBeInTheDocument();
    expect(screen.getByText('Classic pizza')).toBeInTheDocument();
    expect(screen.getByText('Pepperoni')).toBeInTheDocument();
    expect(screen.getByText('€9.50')).toBeInTheDocument();
    expect(screen.getByText('€11.00')).toBeInTheDocument();
  });

  it('renders per-item comment fields for extras/spiciness', () => {
    renderView();
    expect(screen.getByLabelText('Comment for Margherita')).toBeInTheDocument();
    expect(screen.getByLabelText('Comment for Pepperoni')).toBeInTheDocument();
  });

  it('shows tags, allergens, and additives in the item-label tooltip', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus: [makeMenu({
        id: 'menu-1',
        name: 'Pizza Place',
        items: [
          makeMenuItem({
            id: 'item-safety',
            name: 'Safety pizza',
            tags: ['vegetarian'],
            allergens: ['gluten', 'milk'],
            additives: ['preservative'],
          }),
        ],
      })],
      latestCompletedPoll: makePoll({ status: 'finished', winnerMenuId: 'menu-1', winnerMenuName: 'Pizza Place' }),
      activeFoodSelection: makeFoodSelection({ menuId: 'menu-1', menuName: 'Pizza Place', status: 'active' }),
    });

    renderView();

    const card = within(document.getElementById('meal-item-item-safety')!);
    expect(card.getByRole('button', { name: 'Labels for Safety pizza' })).toBeInTheDocument();
    expect(card.getByText('Tag: vegetarian')).toHaveClass('bg-accent-soft/45');
    expect(card.getByText('Allergen: gluten')).toHaveClass('bg-danger/35');
    expect(card.getByText('Allergen: milk')).toHaveClass('bg-danger/35');
    expect(card.getByText('Additive: preservative')).toHaveClass('bg-warning/35');
  });

  it('shows item-label tooltips when any label kind is present', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus: [makeMenu({
        id: 'menu-1',
        name: 'Pizza Place',
        items: [
          makeMenuItem({
            id: 'item-safety-only',
            name: 'Safety-only dish',
            tags: [],
            allergens: ['sesame'],
            additives: ['colouring'],
          }),
          makeMenuItem({
            id: 'item-tags-only',
            name: 'Tags-only dish',
            tags: ['vegan'],
            allergens: [],
            additives: [],
          }),
        ],
      })],
      latestCompletedPoll: makePoll({ status: 'finished', winnerMenuId: 'menu-1', winnerMenuName: 'Pizza Place' }),
      activeFoodSelection: makeFoodSelection({ menuId: 'menu-1', menuName: 'Pizza Place', status: 'active' }),
    });

    renderView();

    const safetyOnlyCard = within(document.getElementById('meal-item-item-safety-only')!);
    expect(safetyOnlyCard.getByRole('button', { name: 'Labels for Safety-only dish' })).toBeInTheDocument();
    expect(safetyOnlyCard.getByText('Allergen: sesame')).toHaveClass('bg-danger/35');
    expect(safetyOnlyCard.getByText('Additive: colouring')).toHaveClass('bg-warning/35');

    const tagsOnlyCard = within(document.getElementById('meal-item-item-tags-only')!);
    expect(tagsOnlyCard.getByRole('button', { name: 'Labels for Tags-only dish' })).toBeInTheDocument();
    expect(tagsOnlyCard.getByText('Tag: vegan')).toHaveClass('bg-accent-soft/45');
  });

  it('shows an item search field', () => {
    renderView();
    expect(screen.getByPlaceholderText(/search items \(min\. 3 chars\)/i)).toBeInTheDocument();
  });

  it('does not filter items when search has fewer than 3 characters', async () => {
    const user = setupUser();
    renderView();

    await user.type(screen.getByPlaceholderText(/search items \(min\. 3 chars\)/i), 'ma');

    expect(screen.getByText('Margherita')).toBeInTheDocument();
    expect(screen.getByText('Pepperoni')).toBeInTheDocument();
  });

  it('filters items when search has at least 3 characters', async () => {
    const user = setupUser();
    renderView();

    await user.type(screen.getByPlaceholderText(/search items \(min\. 3 chars\)/i), 'mar');

    expect(screen.getByText('Margherita')).toBeInTheDocument();
    expect(screen.queryByText('Pepperoni')).not.toBeInTheDocument();
  });

  it('splits meals and beverages into tabs', async () => {
    const user = setupUser();
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus: [makeMenu({
        id: 'menu-1',
        name: 'Pizza Place',
        items: [
          makeMenuItem({ id: 'item-1', name: 'Pizza', tags: ['vegetarian'] }),
          makeMenuItem({ id: 'item-2', name: 'Cola', tags: ['beverage', 'cold'] }),
        ],
      })],
      latestCompletedPoll: makePoll({ status: 'finished', winnerMenuId: 'menu-1', winnerMenuName: 'Pizza Place' }),
      activeFoodSelection: makeFoodSelection({ menuId: 'menu-1', menuName: 'Pizza Place', status: 'active' }),
    });

    renderView();

    expect(screen.getByText('Pizza')).toBeInTheDocument();
    expect(screen.queryByText('Cola')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /beverage/i }));

    expect(screen.getByText('Cola')).toBeInTheDocument();
    expect(screen.queryByText('Pizza')).not.toBeInTheDocument();
  });

  it('filters the active tab by selected tags using OR semantics', async () => {
    const user = setupUser();
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus: [makeMenu({
        id: 'menu-1',
        name: 'Pizza Place',
        items: [
          makeMenuItem({ id: 'item-1', name: 'Falafel', tags: ['vegan'] }),
          makeMenuItem({ id: 'item-2', name: 'Curry', tags: ['spicy'] }),
          makeMenuItem({ id: 'item-3', name: 'Burger', tags: ['classic'] }),
        ],
      })],
      latestCompletedPoll: makePoll({ status: 'finished', winnerMenuId: 'menu-1', winnerMenuName: 'Pizza Place' }),
      activeFoodSelection: makeFoodSelection({ menuId: 'menu-1', menuName: 'Pizza Place', status: 'active' }),
    });

    renderView();

    await user.click(screen.getByRole('button', { name: 'vegan' }));
    await user.click(screen.getByRole('button', { name: 'spicy' }));

    expect(screen.getByText('Falafel')).toBeInTheDocument();
    expect(screen.getByText('Curry')).toBeInTheDocument();
    expect(screen.queryByText('Burger')).not.toBeInTheDocument();
  });

  it('hides items matching selected allergen or additive exclusions and restores them when toggled', async () => {
    const user = setupUser();
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus: [makeMenu({
        id: 'menu-1',
        name: 'Pizza Place',
        items: [
          makeMenuItem({ id: 'item-gluten', name: 'Gluten pizza', allergens: ['gluten'] }),
          makeMenuItem({ id: 'item-additive', name: 'Preserved salad', additives: ['preservative'] }),
          makeMenuItem({ id: 'item-safe', name: 'Fresh soup', allergens: [], additives: [] }),
        ],
      })],
      latestCompletedPoll: makePoll({ status: 'finished', winnerMenuId: 'menu-1', winnerMenuName: 'Pizza Place' }),
      activeFoodSelection: makeFoodSelection({ menuId: 'menu-1', menuName: 'Pizza Place', status: 'active' }),
    });

    renderView();

    const safetyControls = screen.getByRole('group', { name: /exclude safety labels/i });
    expect(within(safetyControls).getAllByRole('button', { name: 'Exclude allergen gluten' })).toHaveLength(1);

    await user.click(within(safetyControls).getByRole('button', { name: 'Exclude allergen gluten' }));
    expect(screen.queryByText('Gluten pizza')).not.toBeInTheDocument();
    expect(screen.getByText('Preserved salad')).toBeInTheDocument();
    expect(screen.getByText('Fresh soup')).toBeInTheDocument();

    await user.click(within(safetyControls).getByRole('button', { name: 'Exclude additive preservative' }));
    expect(screen.queryByText('Preserved salad')).not.toBeInTheDocument();
    expect(screen.getByText('Fresh soup')).toBeInTheDocument();

    await user.click(within(safetyControls).getByRole('button', { name: 'Exclude allergen gluten' }));
    expect(screen.getByText('Gluten pizza')).toBeInTheDocument();
    expect(screen.queryByText('Preserved salad')).not.toBeInTheDocument();

    await user.click(within(safetyControls).getByRole('button', { name: 'Exclude additive preservative' }));
    expect(screen.getByText('Preserved salad')).toBeInTheDocument();
  });

  it('composes safety exclusions with tag and search filters', async () => {
    const user = setupUser();
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus: [makeMenu({
        id: 'menu-1',
        name: 'Pizza Place',
        items: [
          makeMenuItem({ id: 'item-safe-vegan', name: 'Vegan curry', tags: ['vegan'] }),
          makeMenuItem({ id: 'item-gluten-vegan', name: 'Vegan gluten bowl', tags: ['vegan'], allergens: ['gluten'] }),
          makeMenuItem({ id: 'item-gluten-classic', name: 'Classic gluten pizza', tags: ['classic'], allergens: ['gluten'] }),
        ],
      })],
      latestCompletedPoll: makePoll({ status: 'finished', winnerMenuId: 'menu-1', winnerMenuName: 'Pizza Place' }),
      activeFoodSelection: makeFoodSelection({ menuId: 'menu-1', menuName: 'Pizza Place', status: 'active' }),
    });

    renderView();

    await user.click(screen.getByRole('button', { name: 'vegan' }));
    await user.click(screen.getByPlaceholderText(/search items/i));
    await user.type(screen.getByPlaceholderText(/search items/i), 'veg');
    const safetyControls = screen.getByRole('group', { name: /exclude safety labels/i });
    await user.click(within(safetyControls).getByRole('button', { name: 'Exclude allergen gluten' }));

    expect(screen.getByText('Vegan curry')).toBeInTheDocument();
    expect(screen.queryByText('Vegan gluten bowl')).not.toBeInTheDocument();
    expect(screen.queryByText('Classic gluten pizza')).not.toBeInTheDocument();

    await user.click(within(safetyControls).getByRole('button', { name: 'Exclude allergen gluten' }));
    expect(screen.getByText('Vegan gluten bowl')).toBeInTheDocument();
    expect(screen.queryByText('Classic gluten pizza')).not.toBeInTheDocument();
  });

  it('applies exclusions in meal and beverage tabs and shows the filtered empty state', async () => {
    const user = setupUser();
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus: [makeMenu({
        id: 'menu-1',
        name: 'Pizza Place',
        items: [
          makeMenuItem({ id: 'item-meal', name: 'Milk pasta', allergens: ['milk'] }),
          makeMenuItem({ id: 'item-beverage', name: 'Milkshake', tags: ['beverage'], allergens: ['milk'] }),
        ],
      })],
      latestCompletedPoll: makePoll({ status: 'finished', winnerMenuId: 'menu-1', winnerMenuName: 'Pizza Place' }),
      activeFoodSelection: makeFoodSelection({ menuId: 'menu-1', menuName: 'Pizza Place', status: 'active' }),
    });

    renderView();

    await user.click(
      within(screen.getByRole('group', { name: /exclude safety labels/i })).getByRole('button', { name: 'Exclude allergen milk' }),
    );
    expect(screen.queryByText('Milk pasta')).not.toBeInTheDocument();
    expect(screen.getByText(/no matching items found/i)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /beverage/i }));
    expect(screen.queryByText('Milkshake')).not.toBeInTheDocument();
    expect(screen.getByText(/no matching items found/i)).toBeInTheDocument();
  });

  it('does not persist safety exclusions after rerendering a new view or remounting', async () => {
    const user = setupUser();
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus: [makeMenu({
        id: 'menu-1',
        name: 'Pizza Place',
        items: [makeMenuItem({ id: 'item-gluten', name: 'Gluten pizza', allergens: ['gluten'] })],
      })],
      latestCompletedPoll: makePoll({ status: 'finished', winnerMenuId: 'menu-1', winnerMenuName: 'Pizza Place' }),
      activeFoodSelection: makeFoodSelection({ menuId: 'menu-1', menuName: 'Pizza Place', status: 'active' }),
    });
    const view = renderView();

    await user.click(
      within(screen.getByRole('group', { name: /exclude safety labels/i })).getByRole('button', { name: 'Exclude allergen gluten' }),
    );
    expect(screen.queryByText('Gluten pizza')).not.toBeInTheDocument();

    view.rerender(
      <MemoryRouter key="fresh-food-selection-view">
        <FoodSelectionActiveView />
      </MemoryRouter>,
    );
    expect(screen.getByText('Gluten pizza')).toBeInTheDocument();

    view.unmount();
    renderView();
    expect(screen.getByText('Gluten pizza')).toBeInTheDocument();
  });

  it('shows per-item add actions and withdraw action', () => {
    renderView();
    expect(screen.getAllByRole('button', { name: /^add$/i })).toHaveLength(2);
    expect(screen.getByRole('button', { name: /^like margherita$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^dislike pepperoni$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /withdraw/i })).toBeInTheDocument();
  });

  it('loads existing anticipated-like marks and can clear them', async () => {
    const user = setupUser();
    mockFetchMealRecommendationMarks.mockResolvedValue({
      marks: [
        {
          itemId: 'item-1',
          itemIdentityKey: 'margherita',
          sentiment: 'like',
        },
      ],
    });
    mockDeleteMealRecommendationMark.mockResolvedValue({ removed: true });

    renderView();

    expect(await screen.findByText(/marked like/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /clear mark for margherita/i }));

    expect(mockDeleteMealRecommendationMark).toHaveBeenCalledWith('fs-1', 'item-1');
  });

  it('does not render the food alerts editor in the order flow', () => {
    renderView();
    expect(screen.queryByText(/your ingredient preferences/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save alerts/i })).not.toBeInTheDocument();
  });

  it('calls placeOrder when clicking Add for an item', async () => {
    const user = setupUser();
    mockPlaceOrder.mockResolvedValue({});
    renderView();

    await user.click(screen.getAllByRole('button', { name: /^add$/i })[0]);

    expect(mockPlaceOrder).toHaveBeenCalledWith('fs-1', 'Alice', 'item-1', undefined);
  });

  it('shows ingredient preference badges from user preferences', async () => {
    mockGetUserPreferences.mockResolvedValue({
      userKey: 'Alice',
      allergies: ['pizza'],
      dislikes: ['pepperoni'],
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    renderView();

    expect(await screen.findByText(/ingredient alert: pizza/i)).toBeInTheDocument();
    expect(await screen.findByText(/preference match: pepperoni/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ingredient preferences/i })).toHaveAttribute(
      'title',
      [
        'Ingredient Preferences',
        'Ingredients to avoid: pizza',
        'Less preferred ingredients: pepperoni',
      ].join('\n'),
    );
  });

  it('asks for confirmation before adding an item with an ingredient alert', async () => {
    const user = setupUser();
    mockGetUserPreferences.mockResolvedValue({
      userKey: 'Alice',
      allergies: ['pizza'],
      dislikes: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    renderView();

    await screen.findByText(/ingredient alert: pizza/i);
    await user.click(screen.getAllByRole('button', { name: /^add$/i })[0]);
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(mockPlaceOrder).not.toHaveBeenCalled();
  });

  it('includes order comment when clicking Add', async () => {
    const user = setupUser();
    mockPlaceOrder.mockResolvedValue({});
    renderView();

    await user.type(screen.getByLabelText('Comment for Margherita'), 'Extra cheese');
    await user.click(screen.getAllByRole('button', { name: /^add$/i })[0]);

    expect(mockPlaceOrder).toHaveBeenCalledWith('fs-1', 'Alice', 'item-1', 'Extra cheese');
  });

  it('clears the order comment field after adding an item', async () => {
    const user = setupUser();
    mockPlaceOrder.mockResolvedValue({});
    renderView();

    const commentField = screen.getByLabelText('Comment for Margherita');
    await user.type(commentField, 'No onions');
    await user.click(screen.getAllByRole('button', { name: /^add$/i })[0]);

    expect(commentField).toHaveValue('');
  });

  it('shows my added meals with persisted note and item number', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus,
      activeFoodSelection: makeFoodSelection({
        orders: [
          makeFoodOrder({
            id: 'order-1',
            nickname: 'Alice',
            itemId: 'item-1',
            itemName: 'Margherita',
            notes: 'extra cheese',
          }),
        ],
      }),
    });
    renderView();

    const myMealsHeading = screen.getByText(/your added meals/i);
    expect(myMealsHeading).toBeInTheDocument();
    expect(myMealsHeading.parentElement).toHaveTextContent('12');
    expect(myMealsHeading.parentElement).toHaveTextContent('Margherita');
    expect(myMealsHeading.parentElement).toHaveTextContent('(extra cheese)');
  });

  it('does not render the selected line-items summary panel', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus,
      activeFoodSelection: makeFoodSelection({
        orders: [
          makeFoodOrder({ nickname: 'Alice', itemId: 'item-1', itemName: 'Margherita', notes: null }),
          makeFoodOrder({ id: 'order-2', nickname: 'Alice', itemId: 'item-1', itemName: 'Margherita', notes: 'hot' }),
        ],
      }),
    });
    renderView();
    expect(screen.queryByText(/your selected line items/i)).not.toBeInTheDocument();
  });

  it('allows removing own item directly from order list', async () => {
    const user = setupUser();
    mockWithdrawOrder.mockResolvedValue({});
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus,
      activeFoodSelection: makeFoodSelection({
        orders: [
          makeFoodOrder({ id: 'order-1', nickname: 'Alice', itemId: 'item-1', itemName: 'Margherita' }),
          makeFoodOrder({ id: 'order-2', nickname: 'Bob', itemId: 'item-2', itemName: 'Pepperoni' }),
        ],
      }),
    });

    renderView();

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(mockWithdrawOrder).toHaveBeenCalledWith('fs-1', 'Alice', 'order-1');
  });

  it('keeps the own-order remove action visible on small screens', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus,
      activeFoodSelection: makeFoodSelection({
        orders: [
          makeFoodOrder({ id: 'order-1', nickname: 'Alice', itemId: 'item-1', itemName: 'Margherita' }),
        ],
      }),
    });

    renderView();

    expect(screen.getByRole('button', { name: 'Remove' })).toHaveClass('opacity-100');
  });

  it('calls withdrawOrder when clicking Withdraw', async () => {
    const user = setupUser();
    mockWithdrawOrder.mockResolvedValue({});
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus,
      activeFoodSelection: makeFoodSelection({
        orders: [makeFoodOrder({ nickname: 'Alice', itemId: 'item-1', itemName: 'Margherita' })],
      }),
    });
    renderView();

    await user.click(screen.getByRole('button', { name: /withdraw/i }));
    expect(mockWithdrawOrder).toHaveBeenCalledWith('fs-1', 'Alice');
  });

  it('shows "No orders yet" when order board is empty', () => {
    renderView();
    expect(screen.getByText('No orders yet')).toBeInTheDocument();
  });

  it('shows voters who voted for the selected menu but have not ordered yet', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus,
      latestCompletedPoll: makePoll({
        id: 'poll-1',
        status: 'finished',
        winnerMenuId: 'menu-1',
        winnerMenuName: 'Pizza Place',
        votes: [
          {
            id: 'vote-1',
            pollId: 'poll-1',
            menuId: 'menu-1',
            menuName: 'Pizza Place',
            nickname: 'Alice',
            castAt: '2026-01-01T12:01:00.000Z',
          },
          {
            id: 'vote-2',
            pollId: 'poll-1',
            menuId: 'menu-1',
            menuName: 'Pizza Place',
            nickname: 'Bob',
            castAt: '2026-01-01T12:02:00.000Z',
          },
          {
            id: 'vote-3',
            pollId: 'poll-1',
            menuId: 'menu-2',
            menuName: 'Other',
            nickname: 'Carol',
            castAt: '2026-01-01T12:03:00.000Z',
          },
        ],
        voteCounts: { 'menu-1': 2, 'menu-2': 1 },
      }),
      activeFoodSelection: makeFoodSelection({
        menuId: 'menu-1',
        menuName: 'Pizza Place',
        orders: [makeFoodOrder({ nickname: 'Alice', itemId: 'item-1', itemName: 'Margherita' })],
      }),
    });

    renderView();

    expect(screen.getByText(/voted for menu but not ordered yet \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.queryByText('Carol')).not.toBeInTheDocument();
  });

  it('allows admin to ping users who have not ordered yet', async () => {
    const user = setupUser();
    renderView();

    await user.click(screen.getByRole('button', { name: /ping missing users/i }));

    expect(mockRemindMissingOrders).toHaveBeenCalledWith('fs-1');
    expect(await screen.findByText('Sent 1 reminder.')).toBeInTheDocument();
  });

  it('shows fallback text when all voters already ordered', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus,
      latestCompletedPoll: makePoll({
        id: 'poll-1',
        status: 'finished',
        winnerMenuId: 'menu-1',
        winnerMenuName: 'Pizza Place',
        votes: [
          {
            id: 'vote-1',
            pollId: 'poll-1',
            menuId: 'menu-1',
            menuName: 'Pizza Place',
            nickname: 'Alice',
            castAt: '2026-01-01T12:01:00.000Z',
          },
        ],
        voteCounts: { 'menu-1': 1 },
      }),
      activeFoodSelection: makeFoodSelection({
        menuId: 'menu-1',
        menuName: 'Pizza Place',
        orders: [makeFoodOrder({ nickname: 'Alice', itemId: 'item-1', itemName: 'Margherita' })],
      }),
    });

    renderView();

    expect(screen.queryByText(/voted for menu but not ordered yet/i)).not.toBeInTheDocument();
    expect(screen.getByText(/everyone who voted has ordered/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /click here when you place the order\./i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ping missing users/i })).not.toBeInTheDocument();
  });

  it('uses CTA button to complete meal collection when everyone already ordered', async () => {
    const user = setupUser();
    mockCompleteFoodSelectionNow.mockResolvedValue({});
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus,
      latestCompletedPoll: makePoll({
        id: 'poll-1',
        status: 'finished',
        winnerMenuId: 'menu-1',
        winnerMenuName: 'Pizza Place',
        votes: [
          {
            id: 'vote-1',
            pollId: 'poll-1',
            menuId: 'menu-1',
            menuName: 'Pizza Place',
            nickname: 'Alice',
            castAt: '2026-01-01T12:01:00.000Z',
          },
        ],
        voteCounts: { 'menu-1': 1 },
      }),
      activeFoodSelection: makeFoodSelection({
        menuId: 'menu-1',
        menuName: 'Pizza Place',
        orders: [makeFoodOrder({ nickname: 'Alice', itemId: 'item-1', itemName: 'Margherita' })],
      }),
    });

    renderView();
    await user.click(screen.getByRole('button', { name: /click here when you place the order\./i }));
    await user.click(screen.getByRole('button', { name: /confirm completion/i }));

    expect(mockCompleteFoodSelectionNow).toHaveBeenCalledWith('fs-1');
  });

  it('shows order board with other users\' orders', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus,
      activeFoodSelection: makeFoodSelection({
        orders: [
          makeFoodOrder({ nickname: 'Bob', itemId: 'item-2', itemName: 'Pepperoni', notes: 'spicy' }),
          makeFoodOrder({ id: 'order-2', nickname: 'Carol', itemId: 'item-1', itemName: 'Margherita', notes: null }),
        ],
      }),
    });
    renderView();

    expect(screen.getByText(/Bob\s*\(1\)/)).toBeInTheDocument();
    // 'Pepperoni' appears in both the order form item card and the order board
    expect(screen.getAllByText('Pepperoni').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('(spicy)')).toBeInTheDocument();
    expect(screen.getAllByText('12').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Carol\s*\(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/orders \(2 orders, 2 users\)/i)).toBeInTheDocument();
    expect(screen.getByText('Total: €20.50')).toBeInTheDocument();
  });

  it('returns null when no activeFoodSelection', () => {
    mockUseAppState.mockReturnValue({
      ...initialAppState,
      initialized: true,
      menus,
      activeFoodSelection: null,
    });
    const { container } = renderView();
    expect(container.innerHTML).toBe('');
  });

  it('opens timer action menu and confirms completion', async () => {
    const user = setupUser();
    mockCompleteFoodSelectionNow.mockResolvedValue({});
    renderView();

    await user.click(screen.getByRole('button', { name: /food selection timer actions/i }));
    await user.click(screen.getByRole('button', { name: /finish meal collection/i }));
    await user.click(screen.getByRole('button', { name: /confirm completion/i }));

    expect(mockCompleteFoodSelectionNow).toHaveBeenCalledWith('fs-1');
  });

  it('updates food selection timer from preset entry in timer menu', async () => {
    const user = setupUser();
    mockUpdateFoodSelectionTimer.mockResolvedValue({});
    renderView();

    await user.click(screen.getByRole('button', { name: /food selection timer actions/i }));
    await user.click(screen.getByRole('button', { name: /^10 min$/i }));

    expect(mockUpdateFoodSelectionTimer).toHaveBeenCalledWith('fs-1', 10);
  });

  it('updates food selection timer from manual minutes input', async () => {
    const user = setupUser();
    mockUpdateFoodSelectionTimer.mockResolvedValue({});
    renderView();

    await user.click(screen.getByRole('button', { name: /food selection timer actions/i }));
    await user.type(screen.getByLabelText(/food selection manual minutes remaining/i), '33{enter}');

    expect(mockUpdateFoodSelectionTimer).toHaveBeenCalledWith('fs-1', 33);
  });

  it('closes timer menu when clicking outside', async () => {
    const user = setupUser();
    renderView();

    await user.click(screen.getByRole('button', { name: /food selection timer actions/i }));
    expect(screen.getByRole('button', { name: /finish meal collection/i })).toBeInTheDocument();

    await user.click(screen.getByText('Your order'));

    expect(screen.queryByRole('button', { name: /finish meal collection/i })).not.toBeInTheDocument();
  });

  it('calls abortFoodSelection from timer menu abort process action', async () => {
    const user = setupUser();
    mockAbortFoodSelection.mockResolvedValue({});
    renderView();

    await user.click(screen.getByRole('button', { name: /food selection timer actions/i }));
    await user.click(screen.getByRole('button', { name: /abort process/i }));
    await user.click(screen.getByRole('button', { name: /abort food selection/i }));

    expect(mockAbortFoodSelection).toHaveBeenCalledWith('fs-1');
  });

  // ─── Meal recommendations ────────────────────────────────

  it('shows ranked recommendations when clicking "Recommend a meal"', async () => {
    const user = setupUser();
    let resolveRecommend: (value: unknown) => void = () => {};
    mockRecommendMeal.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRecommend = resolve;
        }),
    );
    renderView();

    const button = screen.getByRole('button', { name: /recommend a meal/i });
    await user.click(button);

    expect(mockRecommendMeal).toHaveBeenCalledWith('fs-1');
    expect(await screen.findByRole('button', { name: /thinking/i })).toBeInTheDocument();

    resolveRecommend({
      impressionId: 'impression-1',
      foodSelectionId: 'fs-1',
      source: 'deterministic',
      generatedAt: '2026-01-01T12:00:00.000Z',
      warnings: [],
      items: [
        {
          itemId: 'item-1',
          itemName: 'Margherita',
          rank: 1,
          score: 80,
          reason: 'Recommended because you rated this highly before.',
          sourceSignals: ['personal_rating'],
          aiAssisted: false,
        },
        {
          itemId: 'item-2',
          itemName: 'Pepperoni',
          rank: 2,
          score: 50,
          reason: 'Recommended from the current menu.',
          sourceSignals: [],
          aiAssisted: false,
        },
      ],
    });

    expect(await screen.findByText('#1 Margherita')).toBeInTheDocument();
    expect(screen.getByText('Recommended because you rated this highly before.')).toBeInTheDocument();
    expect(screen.getByText('#2 Pepperoni')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /recommend a meal/i })).toBeInTheDocument();
  });

  it('jumps to the matching meal card when clicking a recommendation', async () => {
    const user = setupUser();
    mockRecommendMeal.mockResolvedValue({
      impressionId: 'impression-1',
      foodSelectionId: 'fs-1',
      source: 'deterministic',
      generatedAt: '2026-01-01T12:00:00.000Z',
      warnings: [],
      items: [
        {
          itemId: 'item-1',
          itemName: 'Margherita',
          rank: 1,
          score: 80,
          reason: 'Recommended from the current menu.',
          sourceSignals: [],
          aiAssisted: false,
        },
      ],
    });
    renderView();

    await user.click(screen.getByRole('button', { name: /recommend a meal/i }));
    await user.click(await screen.findByRole('button', { name: /#1 margherita/i }));

    expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: 'center' });
    expect(document.getElementById('meal-item-item-1')).toHaveFocus();
  });

  it('shows exploratory recommendations when clicking "Explore something new"', async () => {
    const user = setupUser();
    mockExploreMeal.mockResolvedValue({
      impressionId: 'impression-2',
      foodSelectionId: 'fs-1',
      source: 'explore',
      generatedAt: '2026-01-01T12:00:00.000Z',
      warnings: ['Exploratory suggestions are intentionally less certain than safe recommendations.'],
      items: [
        {
          itemId: 'item-2',
          itemName: 'Pepperoni',
          rank: 1,
          score: 88,
          reason: 'Exploratory pick: it leans into newer flavors like pepperoni.',
          sourceSignals: [],
          aiAssisted: false,
        },
      ],
    });

    renderView();

    await user.click(screen.getByRole('button', { name: /explore something new/i }));

    expect(mockExploreMeal).toHaveBeenCalledWith('fs-1');
    expect(await screen.findByText('Exploratory suggestions')).toBeInTheDocument();
    expect(screen.getByText(/exploratory pick/i)).toBeInTheDocument();
  });

  it('opens the onboarding dialog and can mark a candidate there', async () => {
    const user = setupUser();
    mockFetchMealRecommendationOnboardingCandidates.mockResolvedValue({
      candidates: [
        {
          itemId: 'candidate-1',
          itemName: 'Chicken Pad Thai',
          itemIdentityKey: 'chicken-pad-thai',
          tags: ['ingredient:chicken', 'style:thai'],
        },
      ],
    });
    mockUpsertMealRecommendationMark.mockResolvedValue({
      itemIdentityKey: 'chicken-pad-thai',
      sentiment: 'like',
    });

    renderView();

    await user.click(screen.getByRole('button', { name: /mark dishes you expect to like/i }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByText('Chicken Pad Thai')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^like chicken pad thai$/i }));

    expect(mockUpsertMealRecommendationMark).toHaveBeenCalledWith('fs-1', 'candidate-1', 'like');
  });

  it('shows an AI-assisted label when recommendations are AI-enriched', async () => {
    const user = setupUser();
    mockRecommendMeal.mockResolvedValue({
      impressionId: 'impression-1',
      foodSelectionId: 'fs-1',
      source: 'ai_assisted',
      generatedAt: '2026-01-01T12:00:00.000Z',
      warnings: [],
      items: [
        {
          itemId: 'item-1',
          itemName: 'Margherita',
          rank: 1,
          score: 80,
          reason: 'You loved this last time.',
          sourceSignals: ['personal_rating'],
          aiAssisted: true,
        },
      ],
    });
    renderView();

    await user.click(screen.getByRole('button', { name: /recommend a meal/i }));

    expect(await screen.findByText('AI-assisted suggestions')).toBeInTheDocument();
    expect(screen.getByText('You loved this last time.')).toBeInTheDocument();
    expect(screen.getByText('(AI-assisted)')).toBeInTheDocument();
  });

  it('shows a warning when recommendations fall back to deterministic', async () => {
    const user = setupUser();
    mockRecommendMeal.mockResolvedValue({
      impressionId: 'impression-1',
      foodSelectionId: 'fs-1',
      source: 'deterministic_fallback',
      generatedAt: '2026-01-01T12:00:00.000Z',
      warnings: ['AI assistance was unavailable; showing standard recommendations.'],
      items: [
        {
          itemId: 'item-1',
          itemName: 'Margherita',
          rank: 1,
          score: 50,
          reason: 'Recommended from the current menu.',
          sourceSignals: ['office_popularity'],
          aiAssisted: false,
        },
      ],
    });
    renderView();

    await user.click(screen.getByRole('button', { name: /recommend a meal/i }));

    expect(
      await screen.findByText('AI assistance was unavailable; showing standard recommendations.'),
    ).toBeInTheDocument();
    expect(screen.getByText('#1 Margherita')).toBeInTheDocument();
  });

  it('shows an error message when the recommendation request fails', async () => {
    const user = setupUser();
    mockRecommendMeal.mockRejectedValue(new Error('Recommendation failed'));
    renderView();

    await user.click(screen.getByRole('button', { name: /recommend a meal/i }));

    expect(await screen.findByText('Recommendation failed')).toBeInTheDocument();
  });

  it('still allows placing an order after a failed recommendation request', async () => {
    const user = setupUser();
    mockPlaceOrder.mockResolvedValue({});
    mockRecommendMeal.mockRejectedValue(new Error('Recommendation failed'));
    renderView();

    await user.click(screen.getByRole('button', { name: /recommend a meal/i }));
    await screen.findByText('Recommendation failed');

    await user.click(screen.getAllByRole('button', { name: /^add$/i })[0]);
    expect(mockPlaceOrder).toHaveBeenCalledWith('fs-1', 'Alice', 'item-1', undefined);
  });

  it('does not affect order placement when recommendations are shown', async () => {
    const user = setupUser();
    mockPlaceOrder.mockResolvedValue({});
    mockRecommendMeal.mockResolvedValue({
      impressionId: 'impression-1',
      foodSelectionId: 'fs-1',
      source: 'deterministic',
      generatedAt: '2026-01-01T12:00:00.000Z',
      warnings: [],
      items: [
        {
          itemId: 'item-1',
          itemName: 'Margherita',
          rank: 1,
          score: 80,
          reason: 'Recommended from the current menu.',
          sourceSignals: [],
          aiAssisted: false,
        },
      ],
    });
    renderView();

    await user.click(screen.getByRole('button', { name: /recommend a meal/i }));
    await screen.findByText('#1 Margherita');

    await user.click(screen.getAllByRole('button', { name: /^add$/i })[0]);
    expect(mockPlaceOrder).toHaveBeenCalledWith('fs-1', 'Alice', 'item-1', undefined);
  });
});
