# Specs Backlog

**Last Updated**: 2026-06-16

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
| BACKLOG-002 | Learned meal recommender (factorization machines / contextual bandit) | Idea | — | Successor to BACKLOG-001's deterministic feature scorer. See notes below. |

## BACKLOG-002 notes — Learned recommender

Successor to the current deterministic content-based scorer
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
