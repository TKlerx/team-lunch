# Implementation Plan: Canonical App Routes

**Branch**: `001-canonical-routes` | **Date**: 2026-06-15 | **Spec**: `specs/001-canonical-routes/spec.md`

**Input**: Feature specification from `specs/001-canonical-routes/spec.md`

## Summary

Add canonical, refresh-safe client routes for top-level Team Lunch surfaces and the currently visible lunch flow. The feature stays inside the React/Vite client router: it introduces stable URLs for sections, live poll URLs, live/completed food-selection URLs, a compatibility redirect from `/shopping` to `/shopping-list`, and unavailable route states for stale or inaccessible detail IDs. No server endpoints, Prisma models, migrations, or SSE events are required because the existing authenticated bootstrap state and realtime updates already contain the data this slice may display.

## Technical Context

**Language/Version**: TypeScript 5.x (ESM) on Node.js 24-compatible tooling

**Primary Dependencies**: React 18, Vite 6, React Router 6, existing Team Lunch app context and SSE hooks

**Storage**: No storage changes. Existing PostgreSQL/SQLite Prisma schemas remain unchanged.

**Testing**: Vitest + Testing Library for client router behavior; Playwright for production-style direct URL smoke coverage

**Target Platform**: Browser SPA served by the Fastify production server, including custom `BASE_PATH` / `VITE_BASE_PATH` deployments

**Project Type**: Single-package full-stack web app; this slice changes client routing and tests only

**Performance Goals**: Route resolution must be synchronous against already-loaded app state and must not add network round trips or block SSE updates.

**Constraints**: Preserve existing auth, office scoping, and realtime model. Detail routes must not fetch or reveal data outside the current user's already-available state.

**Scale/Scope**: One router surface in `src/client/App.tsx`, one header URL update, client tests, and one Playwright direct-route smoke test.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Thin Routes, Service-Owned Logic**: Pass. No Fastify route or service logic is changed.
- **Single Prisma Client**: Pass. No database access is added.
- **Shared Types, No Duplication**: Pass. No new shared request/response shape is needed.
- **Realtime via SSE**: Pass. Existing `useSSE` subscription remains mounted while routed views render.
- **Tests Are Mandatory, No Stubs**: Pass with client route tests and Playwright smoke coverage.

No constitution violations or complexity exceptions are required.

## Project Structure

### Documentation (this feature)

```text
specs/001-canonical-routes/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── ui-routes.md
├── tasks.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
src/
└── client/
    ├── App.tsx                       # route definitions and detail-route guards
    └── components/
        └── Header.tsx                # shopping-list canonical navigation link

tests/
├── client/
│   ├── App.test.tsx                  # route rendering, redirects, unavailable states
│   └── Header.test.tsx               # canonical shopping nav href
└── e2e/
    └── smoke.spec.ts                 # production-style direct shopping-list URL
```

**Structure Decision**: Keep the feature entirely client-side. The app already receives the authenticated, office-scoped state needed for current polls, current food selections, and loaded completed food-selection history. A server permalink API would expand scope and access-control surface without being required for this slice.

## Phase 0: Research

See `specs/001-canonical-routes/research.md`.

## Phase 1: Design & Contracts

See:

- `specs/001-canonical-routes/data-model.md`
- `specs/001-canonical-routes/contracts/ui-routes.md`
- `specs/001-canonical-routes/quickstart.md`

Post-design constitution check remains passing: no backend, database, migration, or authorization model changes were introduced, and the feature includes tests.

## Complexity Tracking

No constitution violations.
