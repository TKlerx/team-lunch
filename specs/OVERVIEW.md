# Specs Overview

**Last Updated**: 2026-06-15

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

1. **64.3 Meal recommender foundation + feedback loop**: Planned. Promoted as [002-ai-meal-recommendations](002-ai-meal-recommendations/spec.md). Define recommendation signals from historical orders, ratings, feedback remarks, and preferences; add a per-user recommendation endpoint; and learn from order/rating outcomes instead of a separate feedback layer.
2. **77 Responsive / Mobile-Friendly UI**: Planned backlog. Audit critical flows, improve small-screen behavior, and add regression coverage.
3. **78.2 Ordering-claim timeout and recovery**: Planned. Needs product decisions around ownership handoff and late order recovery.
4. **78.3 Late meal selection until ordering is explicitly claimed**: Planned. Related to ordering cutoff semantics.
5. **79 Office-Scoped Admin Roles**: Planned backlog. Needs role and authorization model design.
6. **80 Poll Concurrency**: Planned backlog. Needs explicit office + poll identity handling before implementation.

## Notes

- `001-canonical-routes` is implemented in `IMPLEMENTATION_PLAN.md` item 89.1; the spec status is marked `Done`.
- `food-selection` is marked `Mostly Done` because its migrated task list still calls out verification gaps around pruning-era tests and timer edge assertions, even though the feature is broadly shipped.
- `old/` contains pre-migration notes and is intentionally excluded from the epic table.
