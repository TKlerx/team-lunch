# UI Route Contract: Canonical App Routes

These are browser-facing SPA route contracts, not backend HTTP API contracts.

## Top-Level Sections

| URL | Expected View | Notes |
| --- | --- | --- |
| `/` | Team Lunch dashboard/current phase | Default live entry point |
| `/menus` | Menu management | Existing route retained |
| `/shopping-list` | Shopping list | Canonical shopping list route |
| `/shopping` | Redirect to `/shopping-list` | Compatibility route, uses replace navigation |
| `/settings` | Settings | Existing route retained |
| `/admin` | Administration | Existing route retained |

## Detail Routes

### `/polls/{pollId}`

- If `{pollId}` matches the current visible poll flow, render the main lunch phase view.
- If app state has not initialized yet, render a loading route state.
- If initialized state does not contain the requested current poll, render "Poll unavailable" with a dashboard link.
- Must not request or reveal data outside the current signed-in user's loaded office state.

### `/food-selections/{foodSelectionId}`

- If `{foodSelectionId}` matches the active food-selection flow, render the main lunch phase view.
- If `{foodSelectionId}` matches a loaded completed food selection, render the completed food-selection summary as historical detail.
- If app state has not initialized yet, render a loading route state.
- If initialized state does not contain the requested food selection, render "Food selection unavailable" with a dashboard link.
- Must not request or reveal data outside the current signed-in user's loaded office state.

## Deployment Prefix Contract

All route paths are relative to the React Router basename. Production-style tests and deployments with `VITE_BASE_PATH` / `BASE_PATH` must preserve direct navigation under that prefix, for example `/team-lunch/shopping-list`.
