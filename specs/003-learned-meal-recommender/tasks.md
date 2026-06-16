---
description: "Task list — Learned Meal Recommender"
---

# Tasks: Learned Meal Recommender

**Input**: Design documents from `specs/003-learned-meal-recommender/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md), [quickstart.md](quickstart.md)

**Tests**: Mandatory (constitution principle V). Write tests before implementation for each slice.

**Organization**: Grouped by user story so each can be implemented and verified independently after the shared foundation. Priority order: P1 (US1, US2) → P2 (US3, US4, US1b, US1c).

## Phase 1: Setup (Shared Schema + Types)

- [x] T001 Add models `menu_item_features`, `menu_item_identities`, `user_anticipated_likes`, `recommender_models`, `model_evaluation_results`, `office_recommender_settings`, add `menu_items.item_identity_key`, and widen `meal_recommendation_impressions.source` (+ `recommender_model_id`) in `prisma/schema.prisma`
- [x] T002 Mirror all T001 model changes in `prisma/schema.sqlite.prisma` (keep in sync)
- [x] T003 Create migration `prisma/migrations/<timestamp>_add_learned_recommender/migration.sql` and run `npx prisma migrate dev`
  - Discovery: the local dev migration target for this workspace was the compose-backed `teamlunch` database on `localhost:55433`; the older `paiqo` localhost target was stale here.
- [x] T004 Extend cleanup for the new persisted models in `tests/server/helpers/db.ts`
  - Discovery: delete new recommender rows before their parent tables in cleanup (`meal_recommendation_impressions`, `user_anticipated_likes`, `model_evaluation_results`, `office_recommender_settings`, `menu_item_features`, `menu_item_identities`, `recommender_models`) to avoid FK retries between tests.
- [ ] T005 [P] Add shared types (model/explore/mark/eval request+response shapes, widened `MealRecommendationSource`, admin status/mode types) in `src/lib/types.ts`
- [ ] T006 [P] Add a seeded deterministic RNG helper for reproducible training/exploration in `src/server/services/seededRng.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Critical**: No user-story implementation starts until these are complete.

### Tests for Foundational

- [ ] T007 [P] Add seeded FM training/scoring/serialization tests, including assertions that office is a model feature and a sparse office borrows flavor signal from others (shared-model pooling, FR-024), in `tests/server/meal-recommendation-model.test.ts`
- [ ] T008 [P] Add stable item-identity tests (normalize, ensure row, survive re-import) in `tests/server/meal-item-identity.test.ts`
- [ ] T009 [P] Add persisted-feature read + live-extraction-fallback tests in `tests/server/meal-features-persistence.test.ts`

### Implementation for Foundational

- [ ] T010 [P] Implement stable item identity (normalize name, ensure `menu_item_identities` row, assign `item_identity_key`) in `src/server/services/mealItemIdentity.ts`
- [ ] T011 Persist keyword feature tags + assign identity at menu import in `src/server/services/menu.ts` (uses T010, reuses `mealFeatures.extractFeatures`)
- [ ] T012 [P] Implement persisted-feature loader with live keyword-extraction fallback in `src/server/services/mealFeatures.ts`
- [ ] T013 Implement logistic factorization machine — sparse feature vector, seeded SGD train, score, serialize/deserialize params — in `src/server/services/mealRecommendationModel.ts`
- [ ] T014 Implement training-example construction (orders/ratings/impressions/marks → weighted labeled vectors; real rating supersedes anticipated-like) in `src/server/services/mealRecommendationModel.ts`
- [ ] T015 Implement model persistence + active-version load/cache (`recommender_models`) in `src/server/services/mealRecommendationModel.ts`
- [ ] T016 [P] Implement per-office settings service (get/set `safe_mode`, `active_model_id`, `explore_enabled`; enforce gate invariant) in `src/server/services/officeRecommenderSettings.ts`
- [ ] T017 Extend impression persistence for new `source` values + `recommender_model_id` in `src/server/services/mealRecommendation.ts`

**Checkpoint**: Schema, types, identity, persisted tagging, FM core, model storage, office settings ready.

---

## Phase 3: User Story 1 - Learned personal recommendations (Priority: P1) MVP

**Goal**: When enabled for an office, the safe recommendation is produced by the learned model over flavor features, personalizing even never-ordered items, with baseline fallback.

**Independent Test**: Seed a consistent flavor history, force-enable the learned model for the office, request a recommendation, verify never-ordered matching items rank top and that low-data users / disabled offices fall back to baseline.

### Tests for User Story 1

- [ ] T018 [P] [US1] Add service tests: learned safe path ranks by learned feature preference, falls back to baseline when disabled/low-data, and applies recency/diversity (no identical #1 repeat) in `tests/server/meal-recommendation-service.test.ts`
- [ ] T019 [P] [US1] Add route tests: `POST /api/food-selections/:id/recommendations` returns `source: "safe_learned"` when enabled and persists impression with model id in `tests/server/meal-recommendation-routes.test.ts`

### Implementation for User Story 1

- [ ] T020 [US1] Route the safe path through the learned model when the office `safe_mode = learned` and a model loads, else baseline, in `src/server/services/mealRecommendation.ts`
- [ ] T021 [US1] Apply recency penalty + light diversity pass to learned safe ranking (avoid degenerate repetition, FR-022) in `src/server/services/mealRecommendation.ts`
- [ ] T022 [US1] Seed cold-start scoring from anticipated-like marks / threshold gate (≥4 orders or ≥2 ratings or marks present) in `src/server/services/mealRecommendation.ts`
- [ ] T023 [US1] Keep the existing recommendation route thin; wire learned/baseline selection + error handling in `src/server/routes/foodSelections.ts`
- [ ] T066 [P] [US1] Add tests: allergies hard-exclude and dislikes demote over the shared ingredient vocabulary (exact tag match) + free-text substring fallback, applied identically on baseline, safe-learned, and explore paths, and never learned by the FM (FR-029/FR-030), in `tests/server/meal-recommendation-service.test.ts`
- [ ] T067 [US1] Implement the deterministic allergy/dislike constraint filter (hard-exclude vs demote) over the shared ingredient tags + free-text fallback, applied after model/baseline scoring for all paths, in `src/server/services/mealRecommendation.ts`
- [ ] T068 [US1] Offer structured allergy/dislike selection from the ingredient feature vocabulary (with free-text fallback) in the user preferences UI in `src/client/components/` (preferences component) + `src/client/api.ts`

**Checkpoint**: US1 independently functional — learned safe recommendations with guaranteed baseline fallback, allergies enforced as hard safety constraints on every path.

---

## Phase 4: User Story 2 - Explainable reasons on the learned path (Priority: P1)

**Goal**: Every learned-path recommendation shows a human-readable reason naming the contributing flavor features; no raw model internals exposed.

**Independent Test**: Request learned recommendations and verify each item carries a concise feature-based reason and AI-assisted wording still works/falls back as in 002.

### Tests for User Story 2

- [ ] T024 [P] [US2] Add service tests: learned items carry feature-named reasons (top contributing features), no numeric params leak, optional AI enrichment falls back safely in `tests/server/meal-recommendation-service.test.ts`

### Implementation for User Story 2

- [ ] T025 [US2] Derive human-readable reasons from the learned model's top contributing features per item in `src/server/services/mealRecommendation.ts`
- [ ] T026 [US2] Reuse optional AI explanation enrichment (2s timeout/fallback) for learned path in `src/server/services/mealRecommendationAi.ts`
- [ ] T027 [US2] Ensure client renders learned-path reasons/source label identically to 002 in `src/client/components/FoodSelectionActiveView.tsx`

**Checkpoint**: US2 functional — learned recommendations explain themselves.

---

## Phase 5: User Story 3 - Automatic item feature tagging at import (Priority: P2)

**Goal**: Menu items are tagged at import via keyword taxonomy + optional AI gap-fill; coverage ≥85%; import never blocks on AI.

**Independent Test**: Import a menu with keyword-untaggable items; verify AI gap-fill tags them when configured and import still succeeds (items recorded untagged) when not.

### Tests for User Story 3

- [ ] T028 [P] [US3] Add tests: keyword tagging at import, AI gap-fill (mocked) only for untagged items, no-AI import succeeds, no identifiers in AI payload, and a coverage assertion that ≥85% of a seeded menu's items carry ≥1 feature (SC-003), in `tests/server/meal-features-tagging.test.ts`

### Implementation for User Story 3

- [ ] T029 [US3] Add AI gap-fill tagging (constrained tag output) for keyword-untagged items at import, reusing the provider boundary, in `src/server/services/mealRecommendationAi.ts`
- [ ] T030 [US3] Invoke gap-fill during import with provenance + non-blocking fallback in `src/server/services/menu.ts`

**Checkpoint**: US3 functional — high feature coverage across menus.

---

## Phase 6: User Story 4 - Prove-before-rollout evaluation + admin control (Priority: P2)

**Goal**: Offline per-office top-3 hit-rate eval vs baseline; admin enables the learned model per office only when it beats baseline by ≥5 points; instant revert.

**Independent Test**: Run eval over seeded impressions; verify per-office metrics; verify enabling is blocked below the margin and reverting restores baseline immediately.

### Tests for User Story 4

- [ ] T031 [P] [US4] Add eval-harness tests: top-3 hit rate per office on held-out split, margin computation in `tests/server/meal-recommendation-eval.test.ts`
- [ ] T032 [P] [US4] Add admin route tests: train/evaluate/status/mode/explore endpoints, enable blocked below margin (409), revert restores baseline in `tests/server/recommender-admin-routes.test.ts`
- [ ] T033 [P] [US4] Add client tests for admin eval panel + per-office enable toggle in `tests/client/RecommenderAdminPanel.test.tsx`

### Implementation for User Story 4

- [ ] T034 [US4] Implement offline evaluation (replay impressions + orders, top-3 hit rate per office, write `model_evaluation_results`) in `src/server/services/mealRecommendationEval.ts`
- [ ] T035 [US4] Implement admin thin routes (train, evaluate, status, set mode w/ gate, set explore) in `src/server/routes/recommenderAdmin.ts`
- [ ] T036 [US4] Register admin routes + admin authz in `src/server/index.ts` (or route registrar)
- [ ] T037 [P] [US4] Add admin API client functions (train/evaluate/status/mode/explore) in `src/client/api.ts`
- [ ] T038 [US4] Build admin eval/enable panel UI in `src/client/components/RecommenderAdminPanel.tsx`

**Checkpoint**: US4 functional — safe rollout gated and reversible.

---

## Phase 7: User Story 1b - Explore something new (Priority: P2)

**Goal**: Opt-in explore action surfaces novel/uncertain items via Thompson policy, labelled exploratory, outcomes captured; not gated by beat-the-baseline.

**Independent Test**: Trigger explore for a user with an established profile; verify surfaced items differ from the safe ranking, are labelled, and outcomes feed learning; works with no history.

### Tests for User Story 1b

- [ ] T039 [P] [US1b] Add service tests (seeded): explore surfaces novel flavors differing from safe ranking, labelled, deterministic with seed, no-history fallback in `tests/server/meal-recommendation-explore.test.ts`
- [ ] T040 [P] [US1b] Add route tests for `POST /api/food-selections/:id/recommendations/explore` (source `explore`, impression persisted), including an assertion that explore works when the office safe mode is `baseline` (not gated, FR-020), in `tests/server/meal-recommendation-routes.test.ts`
- [ ] T041 [P] [US1b] Add client test for the "Explore something new" action + exploratory labelling in `tests/client/FoodSelectionActiveView.test.tsx`

### Implementation for User Story 1b

- [ ] T042 [US1b] Implement Thompson exploration policy over per-user Beta-Bernoulli feature counts (epsilon-greedy fallback) in `src/server/services/mealRecommendationExplore.ts`
- [ ] T043 [US1b] Add explore endpoint (thin) returning labelled exploratory results + impression `source=explore` in `src/server/routes/foodSelections.ts`
- [ ] T044 [P] [US1b] Add `exploreMeal` client API call in `src/client/api.ts`
- [ ] T045 [US1b] Add "Explore something new" button + exploratory result display in `src/client/components/FoodSelectionActiveView.tsx`

**Checkpoint**: US1b functional — consented exploration that feeds learning.

---

## Phase 8: User Story 1c - Anticipated-like marks + onboarding (Priority: P2)

**Goal**: Any user marks dishes they expect to like/dislike anytime; new users get an optional flavor-diverse onboarding; marks seed the profile; real ratings supersede marks.

**Independent Test**: Mark never-ordered dishes, verify next recommendation reflects them; order+rate one differently, verify the rating overrides the mark; new user onboarding personalizes with zero orders.

### Tests for User Story 1c

- [ ] T046 [P] [US1c] Add service tests: marks seed flavor prefs, rating supersedes mark, onboarding candidates are flavor-diverse in `tests/server/meal-anticipated-likes.test.ts`
- [ ] T047 [P] [US1c] Add route tests for mark upsert/delete/list + onboarding candidates endpoints in `tests/server/meal-recommendation-routes.test.ts`
- [ ] T048 [P] [US1c] Add client tests for anticipated-like marking control + onboarding dialog in `tests/client/MealOnboardingDialog.test.tsx`

### Implementation for User Story 1c

- [ ] T049 [US1c] Implement marks service (upsert/remove/list by identity, seed signal, supersede-by-rating) in `src/server/services/mealAnticipatedLikes.ts`
- [ ] T050 [US1c] Implement onboarding candidate selection (flavor-diverse spread) in `src/server/services/mealAnticipatedLikes.ts`
- [ ] T051 [US1c] Add mark + onboarding thin routes (`PUT/DELETE/GET marks`, `GET onboarding/candidates`) in `src/server/routes/foodSelections.ts`
- [ ] T052 [P] [US1c] Add mark/onboarding client API calls in `src/client/api.ts`
- [ ] T053 [US1c] Add anticipated-like mark control on menu items in `src/client/components/FoodSelectionActiveView.tsx`
- [ ] T054 [US1c] Add optional onboarding dialog in `src/client/components/MealOnboardingDialog.tsx`

**Checkpoint**: US1c functional — user-steerable cold start.

---

## Phase 9: User Story 5 - Personalization survives menu changes & per office (Priority: P3)

**Goal**: A user's learned preferences keep working after a menu re-import/rename and stay correctly scoped per office (FR-023, FR-024, SC-006).

**Independent Test**: Re-import a menu so item records change identity, then verify a returning user's recommendations still reflect learned preferences; and verify office A's recommendations stay scoped to office A while the shared model still pools flavor signal.

### Tests for User Story 5

- [ ] T055 [P] [US5] Add re-import survival test: after item records change, a user's history/marks/learned signal persist via `item_identity_key` and recommendations still reflect their preferences, in `tests/server/meal-recommendation-transfer.test.ts`
- [ ] T056 [P] [US5] Add per-office isolation test: a user's recommendations are scoped to their office even though the shared model pools non-identifying flavor signal across offices, in `tests/server/meal-recommendation-transfer.test.ts`

### Implementation for User Story 5

- [ ] T057 [US5] Ensure learned scoring, marks, and history all join on `item_identity_key` (office-scoped) so signal transfers across re-imports and new menus, in `src/server/services/mealRecommendation.ts`

**Checkpoint**: US5 functional — robust to menu churn and office-scoped.

---

## Phase 10: Polish & Cross-Cutting

- [ ] T058 [P] Update `README.md` (learned recommender, explore, marks, admin rollout, AI tagging env reuse)
- [ ] T059 [P] Update `AGENTS.md` discoveries (FM in-process, explore policy, identity heuristic, eval gate)
- [ ] T060 [P] Update `specs/data-model.md` with the new persisted models
- [ ] T061 Refresh continuity docs `specs/CURRENT-WORK.md` and `specs/RECONCILIATION.md` (required by the constitution continuity-freshness gate before `validate.ps1 all`)
- [ ] T062 Run focused server/client suites per `specs/003-learned-meal-recommender/quickstart.md`
- [ ] T063 Run `rtk pwsh -NoLogo -NoProfile -File ./validate.ps1 all`
- [ ] T064 Run `rtk graphify update . --no-cluster` and stage updated `graphify-out/graph.json`
- [ ] T065 Add `IMPLEMENTATION_PLAN.md` priority entry for 003 and mark complete after validation; flip `specs/BACKLOG.md` BACKLOG-002 note to delivered

---

## Dependencies & Execution Order

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup; blocks all stories.
- **US1 (Phase 3)**: depends on Foundational; MVP.
- **US2 (Phase 4)**: depends on US1 (reasons over learned scores).
- **US3 (Phase 5)**: depends on Foundational tagging; independent of US1 runtime.
- **US4 (Phase 6)**: depends on Foundational model storage + US1 path for meaningful eval.
- **US1b (Phase 7)**: depends on Foundational features + US1 scoring.
- **US1c (Phase 8)**: depends on Foundational identity/features; feeds US1 scoring.
- **US5 (Phase 9)**: depends on Foundational identity (T010) + US1 scoring + US1c marks; verifies churn-survival and office scoping.
- **Polish (Phase 10)**: depends on all implemented stories; T061 continuity refresh MUST precede T063 `validate.ps1 all`.

## Parallel Opportunities

- T005, T006 in parallel after schema shape is set.
- Foundational tests T007–T009 in parallel; impl T010/T012/T016 parallel (separate files).
- Within each story, the `[P]` test tasks run in parallel before implementation.
- Docs T058–T060 in parallel after implementation settles.

## Implementation Strategy

### MVP First (US1 only)
1. Complete Phase 1 + Phase 2.
2. Complete US1: learned safe path + baseline fallback, force-enabled in tests.
3. Validate with service + route tests; demo personalized ranking.

### Incremental Delivery
1. US1 learned ranking → US2 explanations → US3 tagging coverage → US4 eval/rollout gate → US1b explore → US1c marks/onboarding → US5 churn-survival/office-scoping.
2. Each story is independently testable; baseline remains the guaranteed fallback throughout.

## Notes
- `[P]` = different files, no incomplete-task dependency.
- Every task has a concrete file path.
- Tests precede implementation within each phase (constitution V).
- No new SSE events. No new runtime dependency (FM is hand-rolled).
- Privacy parity with feature 002: no identifiers to any AI provider.
