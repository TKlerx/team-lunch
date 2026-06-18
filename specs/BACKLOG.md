# Specs Backlog

**Last Updated**: 2026-06-18

This backlog is the canonical intake list for unstructured feature wishes before
they become numbered specs.

## Intake Rules

- Before creating any new numbered spec, review this file.
- If a request matches an existing backlog item, link the new spec back to that backlog ID.
- If a request is new, add it here first, then decide whether to promote it immediately.
- During planning/reconciliation sessions, treat this file as the canonical source for unstructured feature wishes.
- If a backlog item has a GitHub issue, keep the backlink in the notes and include the backlog ID in the issue title.

## Items

| ID | Title | Status | Promoted Spec | Notes |
|----|-------|--------|---------------|-------|
| BACKLOG-001 | AI meal recommendations from ratings | Promoted | [002-ai-meal-recommendations](002-ai-meal-recommendations/spec.md) | Matches `IMPLEMENTATION_PLAN.md` item 64.3. Builds on persisted order ratings, remarks, preferences, and retained poll/food-selection history. |
| BACKLOG-002 | Learned meal recommender (factorization machines / contextual bandit) | Delivered | [003-learned-meal-recommender](003-learned-meal-recommender/spec.md) | Delivered in [003-learned-meal-recommender](003-learned-meal-recommender/spec.md); successor to BACKLOG-001's deterministic feature scorer. See notes below. |
| BACKLOG-003 | Ordering claim timeout and recovery | Backlog | - | Former `IMPLEMENTATION_PLAN.md` item 78.2. Prevents a lunch from staying locked if the person who claimed ordering disappears before placing the real order. Not implemented; promote to a focused food-selection spec update before building. |

## BACKLOG-003 notes — Ordering claim timeout and recovery

Current shipped behavior records exactly one ordering claimer and blocks a second
claim while that claim remains active. There is no claim lease, no claim expiry,
and no automatic release if the claimer walks away.

Potential feature shape:

- Give an ordering claim a default `10`-minute lease.
- Allow the current claimer to extend the lease by another `10` minutes while it
  is still active.
- When the lease expires, release the claim but keep the food selection in
  ordering so another approved user can take over.
- Broadcast claim extension and release/expiry state changes to all clients in
  the affected office.
- Show remaining claim time in the ordering UI and make the takeover path clear
  after expiry.

Promotion guidance: this is small enough to be a food-selection spec update if it
is bundled with existing ordering semantics. Create a separate numbered spec only
if the recovery behavior grows into broader handoff/audit/escalation flows.

## BACKLOG-002 notes — Learned recommender

Delivered successor to the current deterministic content-based scorer
(`src/server/services/mealFeatures.ts` + `mealRecommendation.ts`). Model in
**feature space, not item space**: menus are stable per office today but can be
re-imported or replaced (especially other offices), so classic user×item
collaborative filtering hits item cold-start on exactly the current menu, while
ingredient/style features stay dense and stable.

Candidate techniques (in rough order of fit for sparse, weekly, small-office data):

1. **Factorization Machines** — handle sparse categorical inputs (user ×
   item-feature × context like weekday/season) and degrade gracefully with
   little data. Principled step beyond hand-tuned weights.
2. **Contextual bandit** (e.g. Thompson sampling over features) — treats each
   weekly selection as a round: recommend → observe what was ordered → update.
   Balances explore/exploit, learns online with little data. Strong fit for the
   weekly cadence.

Prerequisites / enablers (do these first, mostly independent and useful on their own):

- **Implicit feedback capture** — DONE: orders now feed the taste profile as a
  mild positive signal (`IMPLICIT_ORDER_VALUE`), not just explicit ratings.
- **Persisted + AI-tagged item features** at menu import (`MenuItem.featuresJson`),
  with the keyword taxonomy as the offline fallback and AI only filling gaps —
  raises feature coverage beyond the curated keyword list.
- **Stable item identity** across menu re-imports (canonical item key) so history
  is not reset by renames.
- **Evaluation harness / hit-rate metric** off `meal_recommendation_impressions`
  (join shown rank vs. what was ordered) — required to tune or compare any model;
  without it, "good" is unmeasurable.

Decision: keep the deterministic feature scorer as the always-available baseline
and fallback; layer a learned model on top only once the eval harness exists to
prove it beats the baseline.
