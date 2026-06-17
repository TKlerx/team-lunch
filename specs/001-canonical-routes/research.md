# Research: Canonical App Routes

## Decision: Use React Router routes backed by existing app state

**Rationale**: The feature asks for refreshable and shareable URLs for views already represented in the SPA. `src/client/App.tsx` is the existing router boundary, and `useAppState` already exposes active polls, active food selections, latest completed items, and completed history. Resolving route IDs against that state preserves current auth and office scoping without a new backend contract.

**Alternatives considered**:

- Add server detail endpoints for polls and food selections. Rejected for this slice because it would require new authorization checks, contracts, and server tests while the specified behavior only needs data already available to the signed-in user.
- Store selected history detail in local component state only. Rejected because refresh/back/share behavior requires the selected item to be encoded in the URL.

## Decision: Canonicalize shopping list to `/shopping-list`

**Rationale**: `/shopping-list` is explicit, readable, and matches the user-facing surface name. Keeping `/shopping` as a redirect preserves existing bookmarks and avoids a breaking URL change.

**Alternatives considered**:

- Keep `/shopping` as canonical. Rejected because the requested direction was "real URLs" for named surfaces, and "shopping list" is the product concept shown in the UI.
- Support both URLs without redirect. Rejected because two canonical URLs for the same view make e2e assertions, copy/paste, and future analytics noisier.

## Decision: Show unavailable states for stale or inaccessible detail IDs

**Rationale**: Route IDs may refer to another office, an old poll not loaded in client history, or an item the current user cannot access. A neutral unavailable state avoids data leakage and gives users a recovery path back to the dashboard.

**Alternatives considered**:

- Redirect all stale detail URLs to `/`. Rejected because it hides the reason the shared link failed and makes support/debugging harder.
- Fetch missing detail data from the backend. Rejected for this slice because historical poll permalink pages are explicitly out of scope.

## Decision: Keep direct-route e2e coverage base-path aware

**Rationale**: Production deployments may run under a custom prefix via `VITE_BASE_PATH` and `BASE_PATH`. The Playwright direct-route test derives the current app base path after login so the same test works locally and in prefixed production-style builds.

**Alternatives considered**:

- Hard-code `/shopping-list`. Rejected because it fails under prefixed deployments.
- Only test with client unit tests. Rejected because the success criteria specifically call for browser-level direct URL coverage.
