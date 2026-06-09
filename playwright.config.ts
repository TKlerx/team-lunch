import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.E2E_PORT ?? '4173';
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  reporter: [['list']],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Build once, migrate the dedicated test DB, then serve the production app.
  // Skip when PLAYWRIGHT_BASE_URL points at an already-running server.
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'pnpm build && node scripts/e2e-server.mjs',
        url: `http://127.0.0.1:${PORT}/api/health`,
        timeout: 180_000,
        reuseExistingServer: !process.env.CI,
      },
});
