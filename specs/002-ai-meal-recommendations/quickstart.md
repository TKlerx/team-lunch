# Quickstart: AI Meal Recommendations

## Implementation Order

1. Add `MealRecommendationImpression` to both Prisma schemas.
2. Create a PostgreSQL migration and regenerate Prisma clients.
3. Extend `tests/server/helpers/db.ts` cleanup for the new model.
4. Add shared recommendation types in `src/lib/types.ts`.
5. Implement `src/server/services/mealRecommendation.ts`.
6. Add optional AI adapter/payload guard in `src/server/services/mealRecommendationAi.ts`.
7. Add `POST /api/food-selections/:id/recommendations` to `foodSelections.ts`.
8. Add client API helper and "Recommend a meal" UI in `FoodSelectionActiveView.tsx`.
9. Add server service/route/privacy tests and client UI tests.
10. Run validation.

## Local Commands

```powershell
rtk pnpm exec prisma migrate dev --name add_meal_recommendation_impressions
rtk pnpm exec prisma generate
rtk pnpm test:server -- tests/server/meal-recommendation-service.test.ts tests/server/meal-recommendation-routes.test.ts
rtk pnpm test:client -- tests/client/FoodSelectionActiveView.test.tsx
rtk pwsh -NoLogo -NoProfile -File ./validate.ps1 all
```

## Manual Smoke

1. Start the test/dev database and app.
2. Sign in as an approved user.
3. Create historical completed orders with ratings for that user.
4. Start a poll and food selection for a menu with matching items.
5. Click "Recommend a meal".
6. Confirm ranked suggestions appear and ordering still works.
7. Disable/misconfigure AI provider env and repeat; deterministic suggestions
   should still appear.

## Privacy Checks

- AI payload builder must exclude names, emails, actor keys, feedback remarks,
  and order notes.
- Persisted displayed recommendation response may include reasons/explanations,
  item/menu snapshots, source, rank, score, and timestamp.
- Provider failure should not block recommendations or order placement.
