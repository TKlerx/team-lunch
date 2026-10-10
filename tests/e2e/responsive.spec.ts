import { test, expect, type Page, type Locator } from '@playwright/test';
import type { FoodSelection, InitialStatePayload, Menu, Poll } from '../../src/lib/types.js';

const email = process.env.E2E_LOGIN_EMAIL || 'e2e-user@team-lunch.test';
const password = process.env.E2E_LOGIN_PASSWORD || 'E2ePassword!123';
const longName = 'verylongaccountname'.repeat(5) + '@team-lunch.test';
const longMeal = 'DeliciousRestaurantSpecial'.repeat(4);
const timestamp = '2026-10-01T12:00:00Z';

function fixtures() {
  const menu: Menu = {
    id: 'menu-1', name: longMeal.slice(0, 60), location: 'LongRestaurantAddress'.repeat(6),
    phone: null, url: `https://${'restaurant.'.repeat(8)}example/menu`, orderUrl: null,
    sourceDateCreated: null, createdAt: timestamp, itemCount: 1,
    items: [{ id: 'item-1', menuId: 'menu-1', itemNumber: '12', name: longMeal,
      description: 'A meal with a very long name', price: 12.5, createdAt: timestamp,
      tags: [], allergens: [], additives: [] }],
  };
  const poll: Poll = {
    id: 'poll-1', description: 'Where should we eat?', status: 'finished', startedAt: timestamp,
    endsAt: new Date(Date.now() + 3600_000).toISOString(), endedPrematurely: false,
    winnerMenuId: menu.id, winnerMenuName: menu.name, winnerSelectedRandomly: false,
    createdAt: timestamp, excludedMenuJustifications: [], votes: [], voteCounts: {},
  };
  const selection: FoodSelection = {
    id: 'selection-1', pollId: poll.id, menuId: menu.id, menuName: menu.name,
    status: 'active', startedAt: timestamp, endsAt: poll.endsAt, orderPlacedAt: null,
    orderPlacedBy: null, completedAt: null, etaMinutes: null, etaSetAt: null,
    deliveryDueAt: null, createdAt: timestamp,
    orders: [{ id: 'order-1', selectionId: 'selection-1', nickname: longName, actorKey: email,
      itemId: 'item-1', itemName: longMeal, notes: 'ExtraSpicyPlease'.repeat(8),
      feedbackComment: null, rating: null, ratedAt: null, orderedAt: timestamp }],
  };
  const history = Array.from({ length: 30 }, (_, index) => ({
    ...selection, id: `history-${index}`, menuName: `Past lunch ${index}`,
    status: 'completed' as const, completedAt: timestamp,
  }));
  const payload: InitialStatePayload = {
    orderingPolicy: null, activePoll: null, activeFoodSelection: null,
    latestCompletedPoll: null, latestCompletedFoodSelection: null,
    completedFoodSelectionsHistory: history, defaultFoodSelectionDurationMinutes: 30,
  };
  return { menu, poll, selection, history, payload };
}

async function login(page: Page) {
  await page.goto('/');
  await page.getByPlaceholder(/username/i).fill(email);
  await page.getByPlaceholder(/password/i).fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page.getByRole('button', { name: email })).toBeVisible();
}

async function installReadFixtures(page: Page, displayName = longName) {
  const data = fixtures();
  await page.route('**/api/auth/config', async route => {
    const response = await route.fetch();
    const body = await response.json();
    body.auth.user.displayName = displayName;
    await route.fulfill({ response, json: body });
  });
  await page.route('**/api/menus*', route => route.fulfill({ json: [data.menu] }));
  await page.route('**/api/food-selections/history*', route => route.fulfill({ json: data.history }));
  await page.route('**/api/events*', route => route.fulfill({
    contentType: 'text/event-stream',
    body: `event: initial_state\ndata: ${JSON.stringify(data.payload)}\n\n`,
  }));
  await page.route('**/api/user/preferences*', route => route.fulfill({ json: {
    userKey: email, allergies: [], dislikes: [], explorationRate: 0.5,
    recommendationCount: 3, updatedAt: timestamp,
  } }));
  await page.route('**/api/food-selections/*/marks*', route => route.fulfill({ json: { marks: [] } }));
  await page.route('**/api/food-selections/*/fallback-candidates*', route => route.fulfill({ json: [] }));
  await page.route(/\/api\/polls\/poll-1(?:\?.*)?$/, route =>
    route.fulfill({ json: { ...data.poll, orderingPolicyException: null } }));
  await page.route(/\/api\/food-selections\/(?:selection-1|history-\d+)(?:\?.*)?$/, route => {
    const id = new URL(route.request().url()).pathname.split('/').pop();
    const selection = id === 'selection-1' ? data.selection : data.history.find(entry => entry.id === id);
    return route.fulfill({ json: { ...selection, orderingPolicyException: null } });
  });
  return data;
}

async function contained(locator: Locator, page: Page) {
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(-1);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
}

async function usableLayout(page: Page) {
  await expect(page.getByRole('button', { name: longName })).toBeVisible();
  await contained(page.getByRole('button', { name: longName }), page);
  await expect.poll(() => page.locator('main > div').evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(100);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(await page.locator('main > div').evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
}

for (const width of [320, 375, 768, 1280]) {
  test(`routes and lunch phases remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await login(page);
    const data = await installReadFixtures(page);
    for (const path of ['/', '/menus', '/shopping-list', '/settings', '/admin']) {
      await page.goto(path);
      await usableLayout(page);
    }
    await page.getByRole('button', { name: longName }).click();
    await contained(page.getByRole('menu'), page);
    await page.getByRole('menuitem', { name: /settings/i }).click();
    await expect(page).toHaveURL(/\/settings$/);

    await page.goto('/');
    const pastLunch = page.getByRole('complementary').getByRole('button', { name: /Past lunch 0 / });
    if (width < 768) {
      const disclosure = page.getByRole('button', { name: /Past Lunches/ });
      await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
      await expect(pastLunch).toBeHidden();
      await disclosure.click();
      await expect(pastLunch).toBeVisible();
      await pastLunch.click();
      await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
      await expect(disclosure).toBeFocused();
    } else {
      await expect(pastLunch).toBeVisible();
      await pastLunch.click();
    }
    await usableLayout(page);

    data.payload.activePoll = { ...data.poll, status: 'active', winnerMenuId: null, winnerMenuName: null };
    await page.goto('/');
    await expect(page.getByRole('button', { name: /Show suggestions/ })).toBeVisible();
    await usableLayout(page);
    data.payload.activePoll = null;
    data.payload.latestCompletedPoll = data.poll;
    for (const status of ['active', 'ordering', 'delivering', 'delivery_due'] as const) {
      data.selection.status = status;
      data.payload.activeFoodSelection = data.selection;
      await page.goto('/');
      await expect(page.getByText(longMeal, { exact: false }).first()).toBeVisible();
      await usableLayout(page);
    }
  });
}

test('tall meal dialogs scroll and keep the final action reachable on a short phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await login(page);
  const data = await installReadFixtures(page);
  data.payload.activeFoodSelection = data.selection;
  const candidates = Array.from({ length: 20 }, (_, index) => ({
    itemId: `candidate-${index}`, itemIdentityKey: `identity-${index}`, itemName: `Candidate ${index}`, tags: [],
  }));
  await page.route('**/api/recommender/onboarding/candidates*', route => route.fulfill({ json: { candidates } }));
  let marked = '';
  await page.route('**/api/food-selections/*/marks/candidate-*', route => {
    marked = new URL(route.request().url()).pathname.split('/').pop()!;
    return route.fulfill({ json: { itemIdentityKey: marked, sentiment: 'like' } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Mark dishes you expect to like' }).click();
  const dialog = page.getByRole('dialog');
  await contained(dialog, page);
  const bounds = await dialog.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(480);
  expect(await dialog.evaluate(element => element.scrollHeight)).toBeGreaterThan(bounds!.height);
  await dialog.getByRole('button', { name: 'Like Candidate 19', exact: true }).click();
  await expect.poll(() => marked).toBe('candidate-19');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Mark dishes you expect to like' })).toBeFocused();
});

test('menu editing fits a short phone screen and supports keyboard dismissal', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await login(page);
  await installReadFixtures(page);
  await page.goto('/menus');
  await page.getByRole('button', { name: /^Expand / }).press('Enter');
  const edit = page.getByRole('button', { name: 'Edit', exact: true }).first();
  await edit.click();
  const dialog = page.getByRole('dialog', { name: /Edit menu/ });
  await contained(dialog, page);
  const bounds = await dialog.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(480);
  await dialog.getByRole('button', { name: 'Save changes' }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(edit).toBeFocused();
});

test('short account names also keep the phone account menu inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await login(page);
  await installReadFixtures(page, 'Ivonne Dorsz');
  await page.goto('/');
  await page.getByRole('button', { name: 'Ivonne Dorsz' }).click();
  await contained(page.getByRole('menu'), page);
  await page.getByRole('menuitem', { name: /settings/i }).click();
  await expect(page).toHaveURL(/\/settings$/);
});
