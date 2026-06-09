import { test, expect } from '@playwright/test';

const E2E_LOGIN_EMAIL = process.env.E2E_LOGIN_EMAIL || 'e2e-user@team-lunch.test';
const E2E_LOGIN_PASSWORD = process.env.E2E_LOGIN_PASSWORD || 'E2ePassword!123';

// Smoke check: the production server (served against the dedicated test DB)
// is healthy and serves the SPA shell. Proves the e2e harness + db-test wiring.
test('serves the SPA, reports healthy, and supports local e2e login', async ({ page, request }) => {
  const health = await request.get('/api/health');
  expect(health.ok()).toBeTruthy();
  const body = await health.json();
  // status is connectivity-monitor derived (ok | degraded); both mean the
  // server + route stack are up, which is what the smoke test verifies.
  expect(['ok', 'degraded']).toContain(body.status);

  await page.goto('/');
  await expect(page).toHaveTitle(/Team Lunch/i);
  await expect(page.locator('#root')).toBeVisible();
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();

  await page.getByPlaceholder(/username/i).fill(E2E_LOGIN_EMAIL);
  await page.getByPlaceholder(/password/i).fill(E2E_LOGIN_PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();

  await expect(page.getByRole('button', { name: /admin panel/i })).toBeVisible();
});
