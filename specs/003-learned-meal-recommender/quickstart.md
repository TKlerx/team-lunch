# Quickstart: Learned Meal Recommender

How the pieces fit and how to exercise them locally. Builds on feature 002
(`mealFeatures.ts`, `mealRecommendation.ts`, `mealRecommendationAi.ts`,
`meal_recommendation_impressions`).

## Mental model

- **One predictor, two policies.** A shared factorization machine (FM) estimates
  how much each user will like an item from its flavor features + user/office
  context. The **safe** path serves its best ranking (with recency/diversity so it
  is not robotic); the **explore** path samples optimistically (Thompson) to
  surface novel flavors.
- **Baseline always wins ties of availability.** If a model is missing, fails to
  load, an office hasn't enabled it, or a user has too little data, the
  deterministic feature scorer from 002 serves. Recommendations never error out.
- **Learn from everything already captured.** Orders (implicit), ratings
  (explicit), impression non-clicks (weak negative), and the new anticipated-like
  marks. No new feedback prompt.
- **Pilot before proof, warn until proven.** Admins may enable a trained model
  before an office has enough evaluation data; learned recommendations then warn
  users that the model may be premature. Once evaluation data exists, enabling is
  blocked if top-3 hit rate does not beat the baseline by ≥5 points. Revert is
  instant (office → `baseline`).

## Local flow

1. **Import a menu** → items get a stable per-office identity key and flavor tags
   (keyword taxonomy; AI gap-fill only if `AI_RECOMMENDATION_*` configured).
   Verify `menu_item_features` rows and `menu_items.item_identity_key`.
2. **Generate data** → place/rate some orders; optionally mark a few never-ordered
   dishes as liked (`PUT …/marks/:itemId`).
3. **Train** → `POST /api/admin/recommender/train` writes a `recommender_models`
   row. Training is deterministic (seeded) for reproducible tests.
4. **Evaluate** → `POST /api/admin/recommender/evaluate` replays impressions per
   office and writes `model_evaluation_results` (baseline vs model top-3 hit rate).
5. **Enable** → `PUT …/offices/:id/mode {safeMode:"learned"}`. If no office
   evaluation exists yet, `POST …/recommendations` returns `source:
   "safe_learned"` with a premature-model warning. If evaluation exists, the
   office's margin must be ≥5pt.
6. **Explore** → `POST …/recommendations/explore` returns labelled exploratory
   items differing from the safe ranking.
7. **Onboard a new user** → `GET …/onboarding/candidates` returns a flavor-diverse
   spread; the user marks likes; their first recommendation is personalized with
   zero orders.

## Test focus (Vitest)

- FM training math on fixtures (seeded): learns user×flavor interaction; loss
  decreases; serialization round-trips.
- Safe scoring routes through learned model when enabled, baseline otherwise;
  recency/diversity prevents identical-#1 repetition.
- Explore determinism with a seeded RNG; surfaces novel flavors; labelled.
- Anticipated-like seeds cold-start; a later real rating supersedes the mark.
- Stable identity: re-import changing item records keeps a user's signal.
- Tagging: keyword path offline; AI gap-fill mocked; untagged items don't block.
- Eval: top-3 hit rate computed per office on a held-out split; unevaluated
  pilots warn users, evaluated models are blocked below margin, and revert
  restores baseline instantly.
- Privacy: payloads to the AI provider contain no identifiers.

## Known limitations (v1)

- Stable identity is a normalized-name heuristic per office — two distinct dishes
  with the same normalized name in one office merge (accepted).
- Safe model is batch-trained (admin/scheduled), not online; only the explore
  policy updates online.
- Ranking loss is logistic with impression negatives, not pairwise (BPR) — noted
  as a future upgrade.
