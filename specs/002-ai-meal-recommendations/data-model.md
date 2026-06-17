# Data Model: AI Meal Recommendations

## Existing Entities Used

### FoodSelection

- Source for the current menu/office context.
- Recommendations are allowed only for the food selection visible in the user's
  current office context.

### FoodOrder

- Source for historical ordered items, item snapshots, ratings, and rated time.
- Existing `feedbackComment` and order notes are excluded from recommendation
  inputs because they may contain sensitive or identifying free text.
- Outcome learning uses whether a recommended item was later ordered and rated.

### UserPreference

- Source for allergies/dislikes.
- Preferences demote or flag risky recommendations.

### UserMenuDefaultPreference

- Source for saved default meal preferences and fallback opt-in.
- Defaults boost matching current-menu items.

## New Entity: MealRecommendationImpression

Persisted record of the recommendation response shown to one signed-in user.

### Fields

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID/string | Primary key |
| `foodSelectionId` | UUID/string | FK to `FoodSelection`, cascade delete |
| `officeLocationId` | UUID/string | FK to `OfficeLocation`, restrict/delete behavior matching office-scoped records |
| `actorKey` | string | Stable signed-user key; required |
| `actorEmail` | string/null | Optional internal audit field; never sent to AI |
| `displayNameSnapshot` | string/null | Optional internal display snapshot; never sent to AI |
| `source` | string | `deterministic`, `ai_assisted`, or `deterministic_fallback` |
| `provider` | string/null | Optional provider label, if AI was used |
| `recommendedAt` | DateTime | Request/display timestamp |
| `inputSummaryJson` | Json | Sanitized non-provider audit summary; no remarks/names/emails |
| `itemsJson` | Json | Array of displayed recommendations |
| `createdAt` | DateTime | Insert timestamp |

### `itemsJson` Shape

```json
[
  {
    "itemId": "uuid-or-null",
    "itemName": "Chicken bowl",
    "menuId": "uuid-or-null",
    "menuName": "Lunch Place",
    "rank": 1,
    "score": 84,
    "reason": "You rated similar chicken dishes highly.",
    "sourceSignals": ["personal_rating", "default_meal"],
    "aiAssisted": true
  }
]
```

### Validation Rules

- `actorKey` is required and must come from the signed session.
- `source` must be one of the shared-type enum values.
- `rank` starts at 1 and is unique per impression.
- `score` is a bounded integer or decimal agreed in implementation; contracts
  use `0..100`.
- `itemsJson` must contain only current-menu items visible in the same office.
- Persisted displayed explanations may be stored, but AI provider payload inputs
  must exclude feedback remarks, order notes, names, emails, actor keys, and
  direct identifiers.

### Relationships

- `FoodSelection` 1 -> many `MealRecommendationImpression`
- `OfficeLocation` 1 -> many `MealRecommendationImpression`
- `MealRecommendationImpression` stores item/menu snapshots in JSON instead of
  requiring hard FKs for every displayed item. This preserves audit output if
  menu items are later edited or deleted.

## State / Lifecycle

1. User clicks "Recommend a meal".
2. Service builds deterministic ranked recommendations.
3. If AI assistance is requested/configured, service builds sanitized payload and
   asks adapter for explanation enrichment.
4. Service falls back to deterministic explanations on provider failure.
5. Service persists `MealRecommendationImpression` for the displayed response.
6. Later orders/ratings are compared with impressions for outcome learning.

## Test Data Cleanup

Extend `tests/server/helpers/db.ts` cleanup to delete
`mealRecommendationImpression` rows before parent food selections/offices.
