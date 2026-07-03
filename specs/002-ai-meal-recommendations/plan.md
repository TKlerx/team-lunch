# Implementation Plan: AI Meal Recommendations

**Branch**: `001-canonical-routes` | **Date**: 2026-06-15 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-ai-meal-recommendations/spec.md`

## Summary

Add an on-demand "Recommend a meal" action during active food selection. The
core recommender is deterministic and uses signed-user order history, meal
ratings, saved defaults, ingredient preferences, office-level popularity, and
recency. Optional AI assistance, when configured and explicitly requested,
enriches the displayed explanation without becoming required for ranking or
ordering. Persist each displayed recommendation impression for audit/debugging
and for later outcome analysis against orders and post-meal ratings.

## Technical Context

**Language/Version**: TypeScript (ESM) on Node.js 24 LTS target

**Primary Dependencies**: Fastify 5, React 18 + Vite, Prisma 6, existing auth/session helpers, existing office context helpers. No required new runtime dependency for the deterministic recommender; optional AI provider integration should be isolated behind a small server-side adapter.

**Storage**: PostgreSQL via PostgreSQL Prisma schema. Add a recommendation-impression model to both `prisma/schema.prisma`, plus a PostgreSQL migration.

**Testing**: Vitest + Supertest for recommender service and route integration; Vitest + Testing Library for the food-selection UI affordance; privacy-focused tests for AI payload construction; existing `./validate.ps1 all` gate.

**Target Platform**: Team Lunch web app: Fastify backend + browser SPA, Windows-first tooling.

**Project Type**: Single-package full-stack web app with shared TypeScript types.

**Performance Goals**: Recommendation request should complete in under 500 ms for deterministic-only paths on normal office history. Optional AI enrichment should be bounded by a 2 second server timeout and fall back to deterministic explanations.

**Constraints**: Authenticated approved user only; office-scoped history; no auto-ordering; no recommendation generation on food-selection load; no SSE event required; AI payload must exclude names, emails, feedback remarks, notes, and other direct identifiers.

**Scale/Scope**: One new service (`mealRecommendation.ts`), one optional AI adapter/helper, one new food-selection route, shared request/response types, one client API function, one UI affordance in active food selection, one persisted model, focused server/client tests.

## Constitution Check

- Thin routes -> recommendation route delegates to service: **pass**.
- Single Prisma client via `src/server/db.ts`: **pass**.
- Shared request/response types in `src/lib/types.ts`: **pass**.
- SSE on state changes: **pass / not applicable**. Recommendations are user-requested reads plus impression persistence and do not change shared lunch phase state.
- Tests mandatory: **pass**. Plan includes service, route, privacy, and UI tests.
- Name snapshots next to FKs: **pass**. Recommendation impressions store displayed menu/item names alongside item IDs so audits survive menu edits/deletions.

## Project Structure

### Documentation (this feature)

```text
specs/002-ai-meal-recommendations/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── api.md
└── tasks.md              # created later by /speckit-tasks
```

### Source Code

```text
src/
├── server/
│   ├── services/
│   │   ├── mealRecommendation.ts        # deterministic ranking + impression persistence
│   │   └── mealRecommendationAi.ts      # optional provider adapter/payload guard
│   └── routes/
│       └── foodSelections.ts            # POST /api/food-selections/:id/recommendations
├── client/
│   ├── api.ts                           # request helper for recommendations
│   └── components/
│       └── FoodSelectionActiveView.tsx  # "Recommend a meal" action + result display
└── lib/
    └── types.ts                         # recommendation request/response/domain types

prisma/
├── schema.prisma
├── schema.prisma
└── migrations/
    └── <timestamp>_add_meal_recommendation_impressions/

tests/
├── server/
│   ├── meal-recommendation-service.test.ts
│   └── meal-recommendation-routes.test.ts
└── client/
    └── FoodSelectionActiveView.test.tsx
```

**Structure Decision**: Keep recommendation ranking out of `foodSelection.ts` so
the existing food-selection state machine does not absorb analytics/provider
concerns. The route remains in `foodSelections.ts` because the feature is scoped
to one active food selection.

## Phase 0: Research

Completed in [research.md](research.md).

## Phase 1: Design & Contracts

- Data model: [data-model.md](data-model.md)
- API contract: [contracts/api.md](contracts/api.md)
- Quickstart / validation guide: [quickstart.md](quickstart.md)

## Constitution Check - Post Design

- New DB model is mirrored in the Prisma schema and cleanup must be extended:
  **pass with implementation task**.
- Shared types and route/service split are explicit in contracts: **pass**.
- AI privacy guardrail has dedicated tests: **pass**.
- No new SSE event is needed because recommendations are per-user on-demand
  reads and impression persistence is audit data, not shared phase state:
  **pass**.

## Complexity Tracking

| Decision | Why Needed | Simpler Alternative Rejected Because |
|----------|------------|--------------------------------------|
| Persist recommendation impressions | User chose full displayed-response audit/debugging | Compute-only recommendations cannot prove what was shown before a later bad rating |
| Optional AI adapter | AI is a requested enhancement, not core behavior | Hard-wiring provider calls would make lunch ordering depend on external AI availability |
| Separate `mealRecommendation.ts` service | Ranking combines history, preferences, defaults, and provider guardrails | Adding this to `foodSelection.ts` would blur state-machine and analytics responsibilities |
