# Phase 1 API Contracts: Learned Meal Recommender

All routes stay thin (validate → service → return). Error body `{ error: string }`
with standard statuses (400/401/403/404/409). Auth + office resolution match
feature 002 (`resolveOfficeLocationIdFromCookie`); admin routes require admin.
Shared request/response types live in `src/lib/types.ts`.

## Recommendation (safe) — extends feature 002

`POST /api/food-selections/:id/recommendations`
- Unchanged contract from 002. Behavior change only: when the office's
  `safe_mode = learned` and a model is active and loads, the safe ranking is
  produced by the learned model (with recency/diversity); otherwise the
  deterministic baseline. Response `source` may now be `safe_learned` (in
  addition to existing `deterministic`/`ai_assisted`/`deterministic_fallback`).
- Candidate scope is intentionally narrow: this endpoint only scores items from
  the active food selection's selected/winning `menuId`.
- Response items unchanged shape: `{ itemId, itemName, rank, score, reason,
  sourceSignals, aiAssisted }`; reasons remain human-readable flavor features.

## Pre-vote cross-menu recommendations

`POST /api/recommender/pre-vote`
- Request: `{ pollId?: string, limit?: number }`.
- If `pollId` is provided, the route ranks items only from menus eligible in
  that active poll, excluding poll-excluded menus. If omitted and no active poll
  exists, it may rank items across all current menus in the user's office.
- Response: `{ source: "pre_vote", pollId?: string, items: {
  menuId, menuName, itemId, itemName, rank, score, reason, sourceSignals,
  aiAssisted
}[], warnings?: string[] }`.
- The result is personal and office-scoped. It must never include menus from
  another office.
- Persists an impression with `source = pre_vote`; the impression is not bound
  to a food selection and may reference `pollId` when present.

## Explore

`POST /api/food-selections/:id/recommendations/explore`
- Request: `{}` (office resolved from cookie/query as in 002).
- Response: `MealRecommendationResponse` with `source: "explore"`, items flagged
  exploratory, plus `warnings` when falling back to varied baseline options.
- Uses the signed-in user's `explorationRate` preference (`0` familiar to `1`
  adventurous, default `0.5`) to tune novelty/uncertainty sampling. Office-level
  `exploreEnabled` remains the admin availability switch.
- 200 even when the user has no history (varied current-menu spread).
- Candidate scope is intentionally narrow: this endpoint only scores items from
  the active food selection's selected/winning `menuId`.
- Persists an impression with `source = explore`.

## Anticipated-like marks

`PUT /api/food-selections/:id/marks/:itemId`
- Request: `{ sentiment: "like" | "dislike" }`
- Upserts the user's mark for that item's stable identity in the office. 200 with
  `{ itemIdentityKey, sentiment }`.

`DELETE /api/food-selections/:id/marks/:itemId`
- Removes the user's mark. 200 `{ removed: true }`.

`GET /api/food-selections/:id/marks`
- Returns the requesting user's marks for the current selection's menu:
  `{ marks: { itemId, itemIdentityKey, sentiment }[] }`.

Notes: marks are personal (scoped to actor + office); no admin/other-user access;
no SSE broadcast.

## Onboarding (uses marks)

`GET /api/recommender/onboarding/candidates`
- Returns a varied, flavor-diverse spread of current-office menu items for the
  user to mark: `{ candidates: { itemId, itemName, itemIdentityKey, tags }[] }`.
- Marking uses the marks endpoints above. Skippable (client simply does not call).

## Admin: evaluation & rollout (admin-only)

`POST /api/admin/recommender/train`
- Triggers a batch training run. 202 `{ modelVersion, trainingSampleCount }`.
  Training runs off the request path; route returns once the run is enqueued/done
  for the current data size.

`POST /api/admin/recommender/evaluate`
- Request: `{ modelVersion?: number }` (defaults to latest trained).
- Runs offline per-office eval. 200 `{ results: { officeLocationId,
  baselineTop3HitRate, modelTop3HitRate, marginPoints, sampleCount }[] }`.

`GET /api/admin/recommender/status`
- 200 `{ activeModelVersion, offices: { officeLocationId, safeMode,
  exploreEnabled, latestMargin }[] }`.

`PUT /api/admin/recommender/offices/:officeId/mode`
- Request: `{ safeMode: "baseline" | "learned", modelVersion?: number }`.
- Enabling `learned` requires an evaluation for that office meeting the ≥5pt
  margin; otherwise 409 `{ error: "Model does not beat baseline for this office" }`.
- 200 `{ officeLocationId, safeMode, activeModelVersion }`.

`PUT /api/admin/recommender/offices/:officeId/explore`
- Request: `{ enabled: boolean }`. 200 `{ officeLocationId, exploreEnabled }`.

## Allergies & dislikes

Reuse feature 002's user-preferences endpoint. Entries may be canonical ingredient
tags from the shared vocabulary or free text. The client offers structured
selection from the ingredient vocabulary plus a free-text fallback. The same
endpoint stores `explorationRate`, a per-user number from `0` to `1` for the
Explore action. Allergies are a hard exclude and dislikes a soft demotion,
applied deterministically after scoring on every path (baseline, safe-learned,
explore) — never FM-learned.

`GET /api/user/preferences`
- Returns `{ userKey, allergies, dislikes, explorationRate, updatedAt }`.

`PUT /api/user/preferences`
- Request: `{ allergies: string[], dislikes: string[], explorationRate?: number }`.
- Missing `explorationRate` preserves the default `0.5` behavior for older
  clients.

## Admin: offline comparison export (follow-up)

Add an admin-only export before choosing deeper model work. The export should
produce a CSV/JSONL dataset of recommendation impressions joined to subsequent
orders and ratings, including shown rank, item identity/features, source/model
version, office, timestamps, and pseudonymized actor key. This lets us compare
the in-repo FM, xlearn FM, deterministic baseline, and future policies offline
with the same top-3 hit-rate/rank metrics before promoting an implementation.

## Privacy invariants (all routes)

- No personal identifiers (names, emails, actor keys, notes, remarks) sent to any
  AI provider during tagging or recommendation.
- Learned model pools only non-identifying features across offices.
- Recommendation/explore/marks remain office-scoped and personal.
