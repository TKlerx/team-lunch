# Quickstart: Canonical App Routes

## Local client route checks

```powershell
pnpm exec vitest run --project client tests/client/App.test.tsx tests/client/Header.test.tsx
```

Expected result:

- `/shopping-list` renders the shopping list view.
- `/shopping` redirects to `/shopping-list`.
- Matching `/polls/{id}` and `/food-selections/{id}` routes render the live/current view.
- Completed `/food-selections/{id}` renders the historical completed view.
- Stale detail IDs render unavailable states.

## Production-style browser check

Start the dedicated e2e database first:

```powershell
pnpm db:test:up
pnpm exec playwright test tests/e2e/smoke.spec.ts --project=chromium
```

Expected result:

- Playwright signs in through the normal local-auth UI.
- The shopping list can be opened directly from the canonical URL.
- The compatibility `/shopping` URL redirects to `/shopping-list`.
- The test remains valid when the app is served under a custom base path.

## Manual smoke checks

1. Sign in normally.
2. Open `/shopping-list`; verify the shopping list appears.
3. Open `/shopping`; verify the browser lands on `/shopping-list`.
4. Start or open a live poll and navigate to `/polls/{pollId}`; verify the current lunch flow renders.
5. Open a completed meal from the orders rail; verify the browser URL becomes `/food-selections/{id}`.
6. Open a stale detail ID such as `/polls/not-real`; verify an unavailable state appears with a dashboard link.
