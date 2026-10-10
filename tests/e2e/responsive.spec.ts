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
  // Outer overflow-hidden containers can hide an oversized grid while these checks pass.
  const clipped = await page.locator('main button, main input, main select, main textarea, main .grid > *').evaluateAll(elements =>
    elements.flatMap(element => {
      const bounds = element.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return [];
      return bounds.left < -1 || bounds.right > window.innerWidth + 1
        ? [{ text: element.textContent?.trim().slice(0, 80), left: bounds.left, right: bounds.right }]
        : [];
    }));
  expect(clipped).toEqual([]);
}

for (const width of [320, 375, 768, 1280]) {
  test(`routes and lunch phases remain usable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 700 });
    await login(page);
    const data = await installReadFixtures(page);
    for (const path of ['/', '/menus', '/shopping-list', '/settings', '/admin']) {
      await page.goto(path);
      await usableLayout(page);
      await page.screenshot({ path: testInfo.outputPath(`${path.replaceAll('/', '_') || 'home'}.png`), fullPage: true });
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
    expect((await page.getByRole('button', { name: /Show suggestions/ }).boundingBox())!.height).toBeLessThanOrEqual(48);
    await usableLayout(page);
    await page.screenshot({ path: testInfo.outputPath('poll.png'), fullPage: true });
    data.payload.activePoll = null;
    data.payload.latestCompletedPoll = data.poll;
    for (const status of ['active', 'overtime', 'ordering', 'delivering', 'delivery_due'] as const) {
      data.selection.status = status;
      data.payload.activeFoodSelection = data.selection;
      await page.goto('/');
      await expect(page.getByText(longMeal, { exact: false }).first()).toBeVisible();
      await usableLayout(page);
      for (const price of await page.getByText('€12.50', { exact: true }).all()) {
        expect((await price.boundingBox())!.height).toBeLessThanOrEqual(20);
      }
      const timer = page.getByRole('button', { name: /^(Food selection|Delivery) timer actions$/ });
      if (await timer.count()) expect((await timer.boundingBox())!.height).toBeLessThanOrEqual(48);
      await page.screenshot({ path: testInfo.outputPath(`${status}.png`), fullPage: true });
    }
  });
}

test('tall meal dialogs scroll and keep the final action reachable on a short phone viewport', async ({ page }, testInfo) => {
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
  await page.getByRole('button', { name: 'Mark dishes you expect to like' }).press('Enter');
  const dialog = page.getByRole('dialog');
  await contained(dialog, page);
  const bounds = await dialog.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(480);
  expect(await dialog.evaluate(element => element.scrollHeight)).toBeGreaterThan(bounds!.height);
  expect((await dialog.getByRole('button', { name: 'Skip', exact: true }).boundingBox())!.height).toBeLessThanOrEqual(48);
  await page.screenshot({ path: testInfo.outputPath('dialog-top.png') });
  await dialog.getByRole('button', { name: 'Like Candidate 19', exact: true }).click();
  await expect.poll(() => marked).toBe('candidate-19');
  await page.screenshot({ path: testInfo.outputPath('dialog-final-action.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Mark dishes you expect to like' })).toBeFocused();
});

test.describe('phone touch controls', () => {
  test.use({ isMobile: true, hasTouch: true });

  for (const width of [320, 375]) {
    test(`long meal controls can be tapped at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 667 });
      await login(page);
      const data = await installReadFixtures(page);
      data.payload.activeFoodSelection = data.selection;
      let added = false;
      let removed = '';
      await page.route('**/api/food-selections/selection-1/orders*', async route => {
        if (route.request().method() === 'POST') {
          added = route.request().postDataJSON().itemId === 'item-1';
          await route.fulfill({ json: data.selection.orders[0] });
        } else {
          removed = route.request().postDataJSON().orderId;
          await route.fulfill({ status: 204 });
        }
      });
      await page.goto('/');
      await usableLayout(page);
      const add = page.getByRole('button', { name: 'Add', exact: true });
      const remove = page.getByRole('button', { name: `Remove ${longMeal}`, exact: true });
      await contained(add, page);
      expect((await add.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await add.tap();
      await expect.poll(() => added).toBe(true);
      await contained(remove, page);
      expect((await remove.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await remove.tap();
      await expect.poll(() => removed).toBe('order-1');
      data.selection.status = 'ordering';
      let processed = false;
      await page.route('**/api/food-selections/selection-1/orders/order-1/processed*', async route => {
        processed = route.request().postDataJSON().processed;
        await route.fulfill({ json: {} });
      });
      await page.goto('/');
      const orderLabel = page.getByRole('checkbox', { name: `Processed ${longMeal} for ${longName}` }).locator('..');
      expect((await orderLabel.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await orderLabel.tap();
      await expect.poll(() => processed).toBe(true);
    });
  }

});

test.describe('phone feedback controls', () => {
  test.use({ isMobile: true, hasTouch: true });
  test('completed order feedback fits portrait and landscape phones', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await login(page);
    await installReadFixtures(page);
    let feedback: { rating: number; feedbackComment: string } | null = null;
    await page.route('**/api/food-selections/history-0/orders/order-1/rating*', async route => {
      feedback = route.request().postDataJSON();
      await route.fulfill({ json: {} });
    });
    await page.goto('/');
    await page.getByRole('button', { name: /Past Lunches/ }).tap();
    await page.getByRole('complementary').getByRole('button', { name: /Past lunch 0 / }).tap();
    for (const viewport of [{ width: 375, height: 667 }, { width: 667, height: 375 }]) {
      await page.setViewportSize(viewport);
      await usableLayout(page);
      await expect(page.getByRole('button', { name: /Save feedback/ })).toBeVisible();
      const remark = page.getByRole('textbox', { name: `Feedback remark for ${longMeal}` });
      expect((await remark.boundingBox())!.width).toBeGreaterThanOrEqual(160);
      await page.screenshot({ path: testInfo.outputPath(`completed-${viewport.width}.png`), fullPage: true });
    }
    await page.getByRole('combobox', { name: `Rating for ${longMeal}` }).selectOption('5');
    await page.getByRole('textbox', { name: `Feedback remark for ${longMeal}` }).fill('Arrived warm');
    await page.getByRole('button', { name: 'Save feedback', exact: true }).tap();
    await expect.poll(() => feedback).toEqual({ rating: 5, feedbackComment: 'Arrived warm' });
  });
});

test('menu editing fits a short phone screen and supports keyboard dismissal', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await login(page);
  await installReadFixtures(page);
  await page.goto('/menus');
  await page.getByRole('button', { name: /^Expand / }).press('Enter');
  const edit = page.getByRole('button', { name: 'Edit', exact: true }).first();
  expect((await edit.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await edit.press('Enter');
  const dialog = page.getByRole('dialog', { name: /Edit menu/ });
  await contained(dialog, page);
  const bounds = await dialog.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(480);
  await page.screenshot({ path: testInfo.outputPath('menu-dialog-top.png') });
  const save = dialog.getByRole('button', { name: 'Save changes' });
  await save.scrollIntoViewIfNeeded();
  await save.focus();
  expect((await save.boundingBox())!.y + (await save.boundingBox())!.height).toBeLessThanOrEqual(480);
  await page.screenshot({ path: testInfo.outputPath('menu-dialog-final-action.png') });
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(edit).toBeFocused();
});

test('everyday meal selection remains readable on a phone', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await login(page);
  const data = await installReadFixtures(page, 'Alice');
  data.menu.name = 'Wirtshaus';
  data.menu.items[0].name = 'Chicken curry with rice';
  data.menu.items[0].description = 'Creamy coconut curry, seasonal vegetables and basmati rice.';
  data.menu.items[0].tags = ['spicy'];
  data.menu.items[0].allergens = ['Milk'];
  data.selection.menuName = data.menu.name;
  data.selection.orders[0].itemName = data.menu.items[0].name;
  data.selection.orders[0].nickname = 'Alice';
  data.selection.orders[0].notes = 'Extra spicy, please';
  data.payload.activeFoodSelection = data.selection;
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Alice', exact: true })).toBeVisible();
  const add = page.getByRole('button', { name: 'Add', exact: true });
  await expect(add).toBeVisible();
  await contained(add, page);
  await contained(page.getByRole('button', { name: 'Remove Chicken curry with rice', exact: true }), page);
  await page.screenshot({ path: testInfo.outputPath('everyday-phone.png'), fullPage: true });
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
