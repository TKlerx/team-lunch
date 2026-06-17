# API Contract: AI Meal Recommendations

## POST `/api/food-selections/:id/recommendations`

Generate and persist the recommendation response shown to the signed-in user.

### Auth

- Requires authenticated approved user session.
- Uses signed session actor identity; request body must not carry nickname or
  user identity.
- Office context is resolved through existing office cookie/query behavior.

### Request

```json
{
  "useAi": true
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `useAi` | boolean | no | Defaults to `false`; when `true`, AI explanation enrichment is attempted only if configured |

### Response `200`

```json
{
  "impressionId": "uuid",
  "foodSelectionId": "uuid",
  "source": "ai_assisted",
  "generatedAt": "2026-06-15T10:30:00.000Z",
  "items": [
    {
      "itemId": "uuid",
      "itemName": "Chicken bowl",
      "rank": 1,
      "score": 84,
      "reason": "You rated similar chicken dishes highly.",
      "sourceSignals": ["personal_rating", "default_meal"],
      "aiAssisted": true
    }
  ],
  "warnings": []
}
```

### Response Fields

| Field | Type | Notes |
|-------|------|-------|
| `impressionId` | string | Persisted impression ID |
| `foodSelectionId` | string | Requested food selection |
| `source` | string | `deterministic`, `ai_assisted`, or `deterministic_fallback` |
| `generatedAt` | ISO datetime | When response was generated |
| `items` | array | Ranked current-menu recommendations |
| `warnings` | string[] | Non-blocking provider/fallback warnings suitable for UI-neutral handling |

### Recommendation Item

| Field | Type | Notes |
|-------|------|-------|
| `itemId` | string/null | Current menu item ID when still available |
| `itemName` | string | Display snapshot |
| `rank` | number | 1-based rank |
| `score` | number | `0..100` normalized score |
| `reason` | string | Concise deterministic or AI-assisted explanation |
| `sourceSignals` | string[] | Examples: `personal_rating`, `default_meal`, `office_popularity`, `preference_match`, `preference_warning`, `recency` |
| `aiAssisted` | boolean | Whether AI contributed to the displayed explanation |

### Error Responses

| Status | Body | Condition |
|--------|------|-----------|
| 400 | `{ "error": "Food selection is not orderable" }` | Selection status cannot accept recommendations |
| 401 | `{ "error": "Authentication required" }` | Missing/invalid session |
| 403 | `{ "error": "Office access denied" }` | User cannot access requested office/selection |
| 404 | `{ "error": "Food selection not found" }` | Selection not visible in current office |

Provider failures do not return 5xx solely because AI failed; they return a
deterministic response with `source="deterministic_fallback"` and a warning.

## Shared Types

Add to `src/lib/types.ts`:

```ts
export type MealRecommendationSource =
  | 'deterministic'
  | 'ai_assisted'
  | 'deterministic_fallback';

export type MealRecommendationSignal =
  | 'personal_rating'
  | 'default_meal'
  | 'office_popularity'
  | 'preference_match'
  | 'preference_warning'
  | 'recency';

export interface MealRecommendationRequest {
  useAi?: boolean;
}

export interface MealRecommendationItem {
  itemId: string | null;
  itemName: string;
  rank: number;
  score: number;
  reason: string;
  sourceSignals: MealRecommendationSignal[];
  aiAssisted: boolean;
}

export interface MealRecommendationResponse {
  impressionId: string;
  foodSelectionId: string;
  source: MealRecommendationSource;
  generatedAt: string;
  items: MealRecommendationItem[];
  warnings: string[];
}
```
