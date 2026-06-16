# Implementation Plan: Learned Meal Recommender

**Branch**: `003-learned-meal-recommender` | **Date**: 2026-06-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-learned-meal-recommender/spec.md`

## Summary

Replace feature 002's hand-tuned content-based scorer with a *learned* model of
flavor-feature importance, while keeping that scorer as an always-available
baseline and graceful fallback. Two complementary surfaces: a **safe** path
(batch-trained factorization machine, gated against the baseline by top-3 hit
rate before per-office rollout) and an opt-in **explore** path (Thompson-style
exploration that surfaces novel/uncertain items). A new always-available
"anticipated-like" mark lets users steer recommendations without ordering, and
an optional onboarding step seeds new users. Item features are tagged at import
(curated keyword taxonomy + optional AI gap-fill) and persisted, with a stable
per-office item identity so learning survives menu re-imports. The model is a
single shared FM conditioned on user + office + flavor features (pools sparse
signal across offices; pools only non-identifying features). All ML is
implemented in-process in TypeScript — no external ML service, no new heavy
dependency — and training runs as an admin/scheduled batch job, never on the
request path.

## Technical Context

**Language/Version**: TypeScript 5.x (ESM) on Node.js 24

**Primary Dependencies**: Fastify 5, React 18 + Vite 6 + React Router 6, Prisma 6,
jose. Reuses feature 002's `mealFeatures.ts` (taxonomy + feature extraction) and
`mealRecommendationAi.ts` (Azure/generic AI provider boundary). **No new runtime
dependency** — the factorization machine and exploration policy are hand-rolled
(small linear algebra over sparse vectors) to keep `npm audit` clean and avoid an
ML toolchain.

**Storage**: PostgreSQL (default) / SQLite (local+test) via Prisma dual schema.
New persisted models hold item features, stable item identity, learned model
parameters (serialized JSON per version), per-office evaluation results,
per-office recommendation-mode setting, and per-user anticipated-like marks.

**Testing**: Vitest 3 + Supertest (server), Vitest + Testing Library (client),
Playwright (E2E). Deterministic training (seeded RNG) so model/eval tests are
reproducible.

**Target Platform**: Web app — Fastify server + browser SPA; Windows-first tooling.

**Project Type**: Single-package full-stack web app.

**Performance Goals**: Recommendation request stays within feature 002's budget
(~well under the 2s AI ceiling; deterministic scoring path is single-digit ms).
Scoring at request time is cheap dot-products over small sparse vectors. Model
**training** is a batch job (admin-triggered or scheduled), off the request path,
target under a few seconds for current data volumes.

**Constraints**: Multi-office isolation preserved at the request/eval/enablement
level (shared model pools only non-identifying flavor features). Privacy parity
with 002 — no personal identifiers (names, emails, actor keys, notes, remarks)
leave the system to any AI provider. Deterministic baseline must always be able
to serve. No new SSE events (recommendations are on-demand; marks and config are
personal/admin state, not shared realtime).

**Scale/Scope**: Small offices, weekly ordering — tens of users/office, dozens of
menu items, a small flavor-feature vocabulary (~40 tags). This sparsity drives
the shared-model + feature-space design. New: ~2 services (model train/score,
explore + marks), ~4 routes (recommend safe, explore, mark/unmark, admin
eval/enable), ~6 Prisma models, shared types, and client surfaces (explore
button, mark control, onboarding, admin eval panel).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Thin Routes, Service-Owned Logic** — PASS. All FM training/scoring,
  exploration, mark handling, tagging, and evaluation live in
  `src/server/services/`; routes only validate → call service → return.
- **II. Single Prisma Client** — PASS. New models accessed via `src/server/db.ts`
  singleton; no new client instances; training reads/writes through it.
- **III. Shared Types, No Duplication** — PASS. New request/response + domain
  types added to `src/lib/types.ts`; new persisted records carry item-name/office
  snapshots beside FKs per convention.
- **IV. Realtime via SSE** — PASS (no new realtime state). Recommendations are
  request/response; anticipated-like marks are personal state; model-enable is
  admin config. None are shared transitions other browsers must observe live, so
  no broadcast is required. (Documented, not a silent server-only mutation of
  shared lunch state.)
- **V. Tests Are Mandatory, No Stubs** — PASS. Each slice ships Vitest server
  tests (training math on fixtures, scoring, exploration determinism, eval
  metric, mark override, tagging fallback) and client tests (explore, mark,
  onboarding, admin panel). No placeholder model — a real, tested FM.

**Result**: No violations. Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/003-learned-meal-recommender/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── api.md
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
src/
├── server/
│   ├── routes/
│   │   ├── foodSelections.ts        # extend: explore endpoint + mark endpoints (thin)
│   │   └── recommenderAdmin.ts      # NEW thin admin routes: run eval, enable/disable per office
│   ├── services/
│   │   ├── mealFeatures.ts          # reuse/extend: taxonomy, feature extraction, persisted tags
│   │   ├── mealItemIdentity.ts      # NEW: stable per-office item identity (normalized-name key)
│   │   ├── mealRecommendation.ts    # extend: route safe path through learned model or baseline
│   │   ├── mealRecommendationModel.ts # NEW: FM train + score (in-process, seeded)
│   │   ├── mealRecommendationExplore.ts # NEW: exploration/Thompson policy + explore results
│   │   ├── mealRecommendationEval.ts  # NEW: offline top-3 hit-rate eval vs baseline, per office
│   │   ├── mealAnticipatedLikes.ts  # NEW: mark/unmark + seed signal
│   │   ├── mealRecommendationAi.ts   # reuse: AI provider boundary, extended for tagging
│   │   └── menu.ts                   # extend import: tag + assign stable identity at import
│   └── db.ts
├── client/
│   ├── components/
│   │   ├── FoodSelectionActiveView.tsx   # extend: Explore button, anticipated-like marks
│   │   ├── MealOnboardingDialog.tsx      # NEW: optional "mark dishes you like" onboarding
│   │   └── RecommenderAdminPanel.tsx     # NEW: admin eval results + per-office enable toggle
│   └── api.ts                            # extend: explore, mark, admin eval/enable calls
└── lib/
    └── types.ts                          # extend: model/explore/mark/eval shared types

prisma/
├── schema.prisma            # add models (Postgres)
└── schema.sqlite.prisma     # add models (SQLite, in sync)

tests/
├── server/   # FM math, scoring, explore determinism, eval metric, marks, tagging, identity, routes
└── client/   # explore, mark, onboarding, admin panel
```

**Structure Decision**: Single-package full-stack app. New backend services own
all ML logic; routes stay thin; shared types in `lib`; dual Prisma schema updated
together; reuse 002's feature/AI modules rather than duplicating.

## Complexity Tracking

> No constitution violations — section intentionally empty.
