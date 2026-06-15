# Data Model: Canonical App Routes

This feature does not introduce persisted entities, Prisma models, migrations, or schema changes. The route model is a client-side projection over existing office-scoped app state.

## Route Concepts

### Section URL

- **Shape**: `/`, `/menus`, `/shopping-list`, `/settings`, `/admin`
- **Source of truth**: React Router route table
- **Validation**: The route must render the matching top-level app surface inside the authenticated app shell.
- **Access**: Existing page-level access rules remain unchanged.

### Shopping Compatibility URL

- **Shape**: `/shopping`
- **Source of truth**: React Router redirect
- **Validation**: Must navigate with `replace` to `/shopping-list`.
- **Access**: Same as `/shopping-list`.

### Poll URL

- **Shape**: `/polls/{pollId}`
- **Source of truth**: `activePoll` and `latestCompletedPoll` in `useAppState`
- **Valid when**:
  - `pollId` equals the active or tied poll ID, or
  - `pollId` equals the just-finished latest completed poll while the app is still in the poll-finished transition and no food selection has superseded it
- **Invalid/stale when**: The ID is absent from current visible state after initialization.
- **Invalid behavior**: Show an unavailable state with a dashboard recovery link.

### Food Selection URL

- **Shape**: `/food-selections/{foodSelectionId}`
- **Source of truth**: `activeFoodSelection`, `latestCompletedFoodSelection`, and `completedFoodSelectionsHistory` in `useAppState`
- **Valid when**:
  - `foodSelectionId` equals the active food-selection ID, or
  - `foodSelectionId` matches a completed food selection in loaded history, or
  - `foodSelectionId` matches the latest completed food selection
- **Invalid/stale when**: The ID is absent from current visible state after initialization.
- **Invalid behavior**: Show an unavailable state with a dashboard recovery link.

## State Transitions

- Opening a completed food selection from the orders rail navigates to `/food-selections/{id}`.
- Opening the in-progress rail item navigates to the best matching current route:
  - active food selection -> `/food-selections/{id}`
  - active poll -> `/polls/{id}`
  - just-finished poll -> `/polls/{id}`
  - otherwise `/`
- Realtime updates continue through the existing SSE subscription; route content re-resolves when app state changes.
