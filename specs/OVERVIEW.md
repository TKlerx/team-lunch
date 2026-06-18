# Specs Overview

**Last Updated**: 2026-06-18

This overview tracks spec completeness and implementation status for epics in
`specs/`.

## Feature Intake Contract

- Before creating any new numbered spec, review `specs/BACKLOG.md`.
- If a request matches an existing backlog item, link the new spec back to that backlog ID.
- If a request is new, add it to `specs/BACKLOG.md` first, then decide whether to promote it immediately.
- During planning/reconciliation sessions, treat `specs/BACKLOG.md` as the canonical source for unstructured feature wishes.
- If a backlog item has a GitHub issue, keep backlink in `specs/BACKLOG.md` notes and include backlog ID in issue title.

## Continuity Docs

- `specs/CURRENT-WORK.md` is the canonical high-level guide for where to continue next.
- When `specs/CURRENT-WORK.md` is substantially rewritten, archive the prior state in `specs/TODO-TRACE.md` with date, time, and reason.

## Status Legend

- `Done`: all user stories shipped.
- `Mostly Done`: most stories shipped, minor gaps.
- `Partial`: some stories shipped, significant gaps remain.
- `Planned`: not yet implemented.
- `Delegated`: owned by another feature.
- `Migrated`: reverse-engineered spec for behavior that already existed.

## Artifact Legend

- `spec`: feature requirements + stories
- `plan`: implementation plan + architecture
- `tasks`: executable task list
- `data`: feature-specific data model artifact
- `contracts`: feature-specific API/event contracts
- `research`: design decisions
- `checklist`: spec quality checklist

## Epic Overview

| # | Name | Impl Status | spec | plan | tasks | data | contracts | research | checklist |
|---|------|-------------|------|------|-------|------|-----------|----------|-----------|
| 001 | canonical-routes | Done | Y | - | - | - | - | - | Y |
| 002 | ai-meal-recommendations | Planned | Y | Y | Y | Y | Y | Y | - |
| - | auth | Done | Y | Y | Y | - | - | - | - |
| - | poll-lifecycle | Done | Y | Y | Y | - | - | - | - |
| - | food-selection | Mostly Done | Y | Y | Y | - | - | - | - |
| - | menu-management | Done | Y | Y | Y | - | - | - | - |
| - | shopping-list | Done | Y | Y | Y | - | - | - | - |
| - | multi-office | Done | Y | Y | Y | - | - | - | - |

## Shared Artifacts

| Artifact | Purpose |
|----------|---------|
| [data-model.md](data-model.md) | Cross-feature persisted data model notes |
| [realtime-events.md](realtime-events.md) | Cross-feature SSE event catalogue |
| [CURRENT-WORK.md](CURRENT-WORK.md) | Generated continuation pointer |
| [RECONCILIATION.md](RECONCILIATION.md) | Generated reconciliation summary |
| [BACKLOG.md](BACKLOG.md) | Canonical feature intake backlog |

## Current Priority

1. **003 Learned meal recommender**: Delivered in [003-learned-meal-recommender](003-learned-meal-recommender/spec.md).
2. **Ordering claim timeout and recovery**: Backlog as [BACKLOG-003](BACKLOG.md). Not implemented; promote to a focused food-selection spec update before building.
3. **Office-scoped admin roles**: Backlog idea. Needs role and authorization model design before promotion.
4. **Poll concurrency inside one office**: Backlog idea. Conflicts with the current single-active-poll-per-office spec until explicitly re-scoped.

## Notes

- `001-canonical-routes` is implemented in `IMPLEMENTATION_PLAN.md` item 89.1; the spec status is marked `Done`.
- `food-selection` is marked `Mostly Done` because its migrated task list still calls out verification gaps around pruning-era tests and timer edge assertions, even though the feature is broadly shipped.
- `IMPLEMENTATION_PLAN.md` is legacy tracking. New product truth should live in a numbered spec or `specs/BACKLOG.md`.
- `old/` contains pre-migration notes and is intentionally excluded from the epic table.
