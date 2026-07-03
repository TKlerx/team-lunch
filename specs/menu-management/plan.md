# Implementation Plan: Menu Management

**Branch**: `n/a — existing` | **Date**: 2026-06-04 | **Spec**: [spec.md](spec.md)

**Status**: migrated (reverse-engineered from shipped code)

## Summary

CRUD for menus + items (case-insensitive unique names, optional item
number/description/price), per-user default meals with fallback opt-in, and an
atomic JSON import with precise violation reporting. Deletions preserve name
snapshots in polls/orders. Changes broadcast over SSE.

## Technical Context

**Language/Version**: TypeScript (ESM) on Node.js

**Primary Dependencies**: Fastify 5, Prisma 6 (`Menu`, `MenuItem`, user-default model), SSE manager

**Storage**: PostgreSQL — PostgreSQL Prisma schema

**Testing**: Vitest + Supertest — `tests/server/menu-service.test.ts`, `menu-routes.test.ts`, `user-menu-defaults-service.test.ts`

**Project Type**: Single-package full-stack web app

**Constraints**: Case-insensitive uniqueness; atomic import (no partial writes); deletions must not break historical snapshots.

**Scale/Scope**: 2 services (`menu.ts`, `userMenuDefaults.ts`), 1 route module; client `ManageMenus.tsx` + `NoMenusView.tsx`.

## Constitution Check

- Thin routes → logic in `menu.ts` / `userMenuDefaults.ts`: **pass**.
- Single Prisma client via `db.ts`: **pass**.
- Shared types in `src/lib/types.ts`: **pass**.
- SSE on menu change: **pass**.
- Tests mandatory: **pass** (3 server suites).
- Name snapshots alongside FK: **pass** (`winner_menu_name`, `item_name`).

## Project Structure

```text
src/server/services/menu.ts                 # menu/item CRUD + JSON import validation
src/server/services/userMenuDefaults.ts     # per-user default meal + fallback opt-in
src/server/routes/menus.ts                  # thin handlers (CRUD + import)
src/client/pages/ManageMenus.tsx            # management UI + default-meal config + import
src/client/components/NoMenusView.tsx       # empty-state CTA
prisma/schema.prisma # Menu, MenuItem, UserMenuDefault
tests/server/menu-service.test.ts, menu-routes.test.ts, user-menu-defaults-service.test.ts
```

**Structure Decision**: Standard layer split. Import validation runs fully before
any write so a single transaction stays atomic; violation paths are built from the
JSON traversal position.

## Complexity Tracking

| Decision | Why | Note |
|----------|-----|------|
| Replace-all items on import match | Predictable, idempotent re-import | Not a merge; intentional |
| Ignore import categories | No category model today | Documented as out of scope |
| Case-insensitive uniqueness | Avoid near-duplicate menus/items | Enforced in service, not just DB |
| Name snapshots over hard FKs | History survives deletes | Cross-cutting constitution rule |
