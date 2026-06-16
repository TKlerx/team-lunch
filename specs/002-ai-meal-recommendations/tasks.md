---
description: "Task list — AI Meal Recommendations"
---

# Tasks: AI Meal Recommendations

**Input**: Design documents from `specs/002-ai-meal-recommendations/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md), [quickstart.md](quickstart.md)

**Tests**: Mandatory. Write tests before implementation for each user-story slice.

**Organization**: Tasks are grouped by user story so each story can be implemented and verified independently after the shared foundation is complete.

## Phase 1: Setup (Shared Data + Types)

**Purpose**: Add persisted impression storage and shared contracts before service/UI work.

- [ ] T001 Add `MealRecommendationImpression` model and relations in `prisma/schema.prisma`
- [ ] T002 Add matching `MealRecommendationImpression` model and relations in `prisma/schema.sqlite.prisma`
- [ ] T003 Create PostgreSQL migration for recommendation impressions in `prisma/migrations/<timestamp>_add_meal_recommendation_impressions/migration.sql`
- [ ] T004 Extend server test cleanup for recommendation impressions in `tests/server/helpers/db.ts`
- [ ] T005 [P] Add shared recommendation source/signal/request/response types in `src/lib/types.ts`
- [ ] T006 [P] Add client API function `recommendMeal` in `src/client/api.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core recommendation infrastructure used by every user story.

**Critical**: No user-story implementation should start until these tasks are complete.

- [X] T007 [P] Add failing deterministic ranking tests in `tests/server/meal-recommendation-service.test.ts`
- [X] T008 [P] Add failing API contract/auth tests in `tests/server/meal-recommendation-routes.test.ts`
- [X] T009 [P] Add failing AI payload privacy tests in `tests/server/meal-recommendation-ai.test.ts`
- [X] T010 Implement deterministic ranking helpers and scoring constants in `src/server/services/mealRecommendation.ts`
- [X] T011 Implement sanitized AI payload builder and provider-fallback boundary in `src/server/services/mealRecommendationAi.ts`
- [X] T012 Implement impression persistence mapper in `src/server/services/mealRecommendation.ts`
- [X] T013 Add route shell `POST /api/food-selections/:id/recommendations` in `src/server/routes/foodSelections.ts`

**Checkpoint**: Schema, shared types, privacy guardrails, ranking foundation, persistence mapper, and route shell are ready.

---

## Phase 3: User Story 1 - See Personal Meal Recommendations (Priority: P1) MVP

**Goal**: A signed-in user clicks "Recommend a meal" during active food selection and receives ranked current-menu suggestions.

**Independent Test**: Seed historical rated orders/preferences/defaults, start food selection, call the recommendation endpoint, and verify ranked current-menu results plus persisted impression.

### Tests for User Story 1

- [X] T014 [P] [US1] Add service tests for personal ratings, defaults, preferences, popularity, recency, and no-history fallback in `tests/server/meal-recommendation-service.test.ts`
- [X] T015 [P] [US1] Add route tests for authenticated request, office scoping, unavailable selection, and persisted impression in `tests/server/meal-recommendation-routes.test.ts`
- [X] T016 [P] [US1] Add client tests for "Recommend a meal" button, loading state, ranked results, and add-order compatibility in `tests/client/FoodSelectionActiveView.test.tsx`
- [X] T017 [P] [US1] Add deterministic recommendation latency regression test for seeded office history in `tests/server/meal-recommendation-service.test.ts`

### Implementation for User Story 1

- [X] T018 [US1] Query current food selection, current menu items, user history, defaults, preferences, and office popularity in `src/server/services/mealRecommendation.ts`
- [X] T019 [US1] Implement deterministic scoring, preference demotion/warnings, no-history fallback, and result ordering in `src/server/services/mealRecommendation.ts`
- [X] T020 [US1] Complete `POST /api/food-selections/:id/recommendations` auth, office resolution, validation, service call, and error handling in `src/server/routes/foodSelections.ts`
- [X] T021 [US1] Wire `recommendMeal` request/response handling in `src/client/api.ts`
- [X] T022 [US1] Add "Recommend a meal" action, loading/error states, and ranked recommendation display in `src/client/components/FoodSelectionActiveView.tsx`
- [X] T023 [US1] Persist displayed deterministic recommendation impressions with item/menu snapshots in `src/server/services/mealRecommendation.ts`

**Checkpoint**: US1 is independently functional: deterministic recommendations work on request without AI.

---

## Phase 4: User Story 2 - Understand Why a Meal Was Suggested (Priority: P1)

**Goal**: Each recommendation shows a concise, non-invasive reason using deterministic signal labels and optional AI wording.

**Independent Test**: Request recommendations with and without AI enabled and verify reasons are present, concise, source-labelled, and fallback safely when AI fails.

### Tests for User Story 2

- [X] T024 [P] [US2] Add service tests for deterministic reason generation and source signal labels in `tests/server/meal-recommendation-service.test.ts`
- [X] T025 [P] [US2] Add AI enrichment success/failure/malformed-output tests in `tests/server/meal-recommendation-ai.test.ts`
- [X] T026 [P] [US2] Add client tests for displayed explanations and deterministic fallback warning behavior in `tests/client/FoodSelectionActiveView.test.tsx`

### Implementation for User Story 2

- [X] T027 [US2] Implement deterministic explanation templates and source signal selection in `src/server/services/mealRecommendation.ts`
- [X] T028 [US2] Implement optional AI explanation enrichment with 2 second timeout/fallback behavior in `src/server/services/mealRecommendationAi.ts`
- [X] T029 [US2] Store displayed AI-assisted or fallback explanations in recommendation impressions in `src/server/services/mealRecommendation.ts`
- [X] T030 [US2] Render recommendation reasons, source labels, and non-blocking warnings in `src/client/components/FoodSelectionActiveView.tsx`

**Checkpoint**: US2 is independently functional: every suggestion explains itself and AI failure does not break recommendations.

---

## Phase 5: User Story 4 - Protect Privacy and Control AI Usage (Priority: P1)

**Goal**: AI assistance is optional, de-identified, office-scoped, and never required for ordering or deterministic recommendations.

**Independent Test**: Enable AI request path with seeded sensitive data and verify provider payload excludes names, emails, actor keys, notes, and feedback remarks; disable/misconfigure AI and verify deterministic response persists.

### Tests for User Story 4

- [X] T031 [P] [US4] Add payload exclusion tests for names, emails, actor keys, notes, and feedback remarks in `tests/server/meal-recommendation-ai.test.ts`
- [X] T032 [P] [US4] Add route tests for AI disabled, provider failure, and deterministic fallback persistence in `tests/server/meal-recommendation-routes.test.ts`
- [X] T033 [P] [US4] Add client test proving recommendation UI still works when response source is `deterministic_fallback` in `tests/client/FoodSelectionActiveView.test.tsx`

### Implementation for User Story 4

- [X] T034 [US4] Add AI provider configuration parsing and disabled-state behavior in `src/server/services/mealRecommendationAi.ts`
- [X] T035 [US4] Harden AI payload construction to exclude disallowed fields in `src/server/services/mealRecommendationAi.ts`
- [X] T036 [US4] Return `deterministic_fallback` source and warning on provider failure in `src/server/services/mealRecommendation.ts`
- [X] T037 [US4] Preserve order placement and food-selection flow behavior regardless of recommendation/AI failures in `src/client/components/FoodSelectionActiveView.tsx`

**Checkpoint**: US4 is independently functional: privacy and graceful fallback behavior are covered.

---

## Phase 6: User Story 3 - Improve Recommendations from Meal Outcomes (Priority: P2)

**Goal**: Future recommendations account for whether a previously recommended item was ordered and how it was rated afterward.

**Independent Test**: Persist an impression, order the recommended item, rate it low, then verify later ranking demotes or avoids repeating the poor outcome.

### Tests for User Story 3

- [X] T038 [P] [US3] Add outcome-learning service tests for recommended-ordered-rated-high and recommended-ordered-rated-low flows in `tests/server/meal-recommendation-service.test.ts`
- [X] T039 [P] [US3] Add route regression test proving no separate helpful/not-helpful feedback endpoint exists in `tests/server/meal-recommendation-routes.test.ts`

### Implementation for User Story 3

- [X] T040 [US3] Query prior recommendation impressions alongside later orders/ratings in `src/server/services/mealRecommendation.ts`
- [X] T041 [US3] Incorporate recommendation outcome boosts/demotions into deterministic scoring in `src/server/services/mealRecommendation.ts`
- [X] T042 [US3] Ensure outcome analysis remains office-scoped and actor-key scoped in `src/server/services/mealRecommendation.ts`

**Checkpoint**: US3 is independently functional: order/rating outcomes influence later recommendations without a separate feedback UI.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final documentation, validation, and graph upkeep.

- [X] T043 [P] Update feature docs/discoveries for recommendation env and privacy behavior in `README.md`
- [X] T044 [P] Update project runbook discoveries for recommendation impressions and AI fallback in `AGENTS.md`
- [X] T045 [P] Update shared persistence notes for recommendation impressions in `specs/data-model.md`
- [X] T046 Run focused server/client suites from `specs/002-ai-meal-recommendations/quickstart.md`
- [X] T047 Run `rtk pwsh -NoLogo -NoProfile -File ./validate.ps1 all`
- [X] T048 Run `rtk graphify update . --no-cluster` and stage updated `graphify-out/graph.json`
- [X] T049 Mark `IMPLEMENTATION_PLAN.md` item 64.3 complete only after implementation and validation pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup; blocks all user stories.
- **US1 (Phase 3)**: Depends on Foundational; MVP.
- **US2 (Phase 4)**: Depends on US1 result shape and service contract.
- **US4 (Phase 5)**: Depends on Foundational and integrates with US1/US2 response shapes.
- **US3 (Phase 6)**: Depends on persisted impressions from US1.
- **Polish (Phase 7)**: Depends on all implemented stories.

### User Story Dependencies

- **US1**: Required MVP; enables endpoint, UI, deterministic ranking, and impressions.
- **US2**: Adds explanations and AI-assisted wording on top of US1 recommendations.
- **US4**: Cross-cutting privacy/fallback behavior; tests can start early after Foundational.
- **US3**: Uses US1 impressions plus existing orders/ratings to tune future ranking.

### Within Each User Story

- Tests first, then service logic, route/client integration, then story checkpoint.
- Prisma schema and generated client must be ready before service/route tests that touch impressions.
- Routes stay thin; service owns ranking, persistence, AI fallback, and outcome analysis.

---

## Parallel Opportunities

- T005 and T006 can run alongside schema/migration work after model shape is clear.
- T007, T008, and T009 can be written in parallel because they target separate test files.
- US1 tests T014, T015, T016, and T017 can run in parallel.
- US2 tests T024, T025, and T026 can run in parallel.
- US4 tests T031, T032, and T033 can run in parallel.
- Docs tasks T043, T044, and T045 can run in parallel after implementation details settle.

## Parallel Example: User Story 1

```text
Task: "T014 Add service tests in tests/server/meal-recommendation-service.test.ts"
Task: "T015 Add route tests in tests/server/meal-recommendation-routes.test.ts"
Task: "T016 Add client tests in tests/client/FoodSelectionActiveView.test.tsx"
Task: "T017 Add latency regression test in tests/server/meal-recommendation-service.test.ts"
```

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1 and Phase 2.
2. Complete US1 with deterministic recommendations and persisted impressions.
3. Validate with service, route, and client tests.
4. Demo "Recommend a meal" without AI.

### Incremental Delivery

1. US1: deterministic recommendations.
2. US2: explanations and optional AI enrichment.
3. US4: privacy/fallback hardening across the completed flow.
4. US3: outcome learning from ordered/rated recommendations.
5. Polish/docs/validation.

## Notes

- `[P]` tasks touch separate files and can run in parallel after dependencies are met.
- Every task includes a concrete file path for execution.
- Do not add a separate helpful/not-helpful endpoint or UI.
- Do not send feedback remarks, order notes, names, emails, actor keys, or direct identifiers to AI providers.
- No SSE event is expected for recommendation impressions.
