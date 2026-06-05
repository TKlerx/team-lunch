import { test, expect } from '@playwright/test';

// Smoke check: the production server (served against the dedicated test DB)
// is healthy and serves the SPA shell. Proves the e2e harness + db-test wiring.
test('serves the SPA and reports healthy', async ({ page, request }) => {
  const health = await request.get('/api/health');
  expect(health.ok()).toBeTruthy();
  const body = await health.json();
  // status is connectivity-monitor derived (ok | degraded); both mean the
  // server + route stack are up, which is what the smoke test verifies.
  expect(['ok', 'degraded']).toContain(body.status);

  await page.goto('/');
  await expect(page).toHaveTitle(/Team Lunch/i);
  await expect(page.locator('#root')).toBeVisible();
});
