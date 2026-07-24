# Quickstart: Verify Menu Safety Labels

## Prerequisites

1. Start the dedicated test database: `pnpm db:test:up`.
2. Apply the new migration with `pnpm prisma migrate dev` after the schema change.

## Focused checks

1. Run the menu service and route tests:

   ```powershell
   pnpm exec vitest run --project server tests/server/menu-service.test.ts tests/server/menu-routes.test.ts
   ```

2. Run menu-management and food-selection client tests:

   ```powershell
   pnpm exec vitest run --project client tests/client/ManageMenus.test.tsx tests/client/FoodSelectionActiveView.test.tsx
   ```

3. Manually import an item whose `tags`, `allergens`, and `additives` contain mixed case and duplicates. Confirm all three groups are distinct and normalized.
4. In Food Selection, select an allergen and an additive. Confirm matching items disappear in both tabs, clearing a choice restores only its matching items, and refreshing the page clears all exclusions.
5. Confirm existing Settings ingredient warnings still appear and do not preselect exclusions.

## Full gate

```powershell
pwsh -File ./validate.ps1 all
```

If the production dependency audit remains red for unrelated locked dependencies, report it separately; do not weaken the feature’s tests or safety-label validation.
