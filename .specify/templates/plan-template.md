# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]

**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: TypeScript 5.x (ESM) on Node.js — confirm or override if feature differs

**Primary Dependencies**: Fastify 5 (backend), React 18 + Vite 6 + React Router 6 (frontend), Prisma 6 (ORM), jose (JWT). Add feature-specific deps here.

**Storage**: PostgreSQL (default) or SQLite (local/test) via Prisma — `prisma/schema.prisma` + `prisma/schema.sqlite.prisma`

**Testing**: Vitest 3 + Supertest (server), Vitest + Testing Library (client), Playwright (E2E)

**Target Platform**: Web app — Fastify server + browser SPA; Windows-first dev tooling

**Project Type**: Single-package full-stack web app (client + server + shared lib in one repo)

**Performance Goals**: [domain-specific or N/A — note SSE/realtime latency expectations if relevant]

**Constraints**: [domain-specific — e.g. multi-office isolation, auth scope, SSE must stay live or NEEDS CLARIFICATION]

**Scale/Scope**: [domain-specific — number of new routes/services/components/events or NEEDS CLARIFICATION]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

[Gates determined based on constitution file]

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# Team Lunch fixed layout — place new feature files in these real directories:
src/
├── server/
│   ├── routes/        # thin Fastify handlers (validate → call service → return)
│   ├── services/      # ALL business logic for this feature
│   ├── sse.ts         # broadcast(event, payload) — add new events here
│   └── db.ts          # Prisma singleton (do not instantiate elsewhere)
├── client/
│   ├── components/    # React components (PascalCase)
│   ├── hooks/         # state + SSE subscription hooks
│   ├── pages/         # routed views
│   └── context/       # app/office context providers
└── lib/
    └── types.ts       # shared request/response + domain types (both sides import)

prisma/
├── schema.prisma            # Postgres — update for any model change
└── schema.sqlite.prisma     # SQLite — keep in sync

tests/
├── server/            # Vitest + Supertest (unit + integration)
└── client/            # Vitest + Testing Library (component + hook)
```

**Structure Decision**: Single-package full-stack app. Map this feature across the
layers above: which new routes, services, SSE events, shared types, client
components/hooks, and Prisma model changes it requires.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
