# Implementation Plan: Shared Shopping List

**Branch**: `n/a — existing` | **Date**: 2026-06-04 | **Spec**: [spec.md](spec.md)

**Status**: migrated (reverse-engineered from shipped code)

## Summary

Lightweight office-scoped shared list: add items, mark bought (single or all),
keep bought items grouped by date for traceability, live-update via SSE.

## Technical Context

**Language/Version**: TypeScript (ESM) on Node.js

**Primary Dependencies**: Fastify 5, Prisma 6 (`ShoppingListItem`), SSE manager

**Storage**: PostgreSQL — PostgreSQL Prisma schema

**Testing**: Vitest + Supertest — `tests/server/shopping-list-service.test.ts`, `shopping-list-routes.test.ts`

**Project Type**: Single-package full-stack web app

**Constraints**: Office-scoped; bought items retained (no delete in scope).

**Scale/Scope**: 1 service, 1 route module, 1 client page (`ShoppingList.tsx`).

## Constitution Check

- Thin routes → logic in `shoppingList.ts`: **pass**.
- Single Prisma client via `db.ts`: **pass**.
- Shared types in `src/lib/types.ts`: **pass**.
- SSE on change: **pass** (added/updated).
- Tests mandatory: **pass** (2 server suites).

## Project Structure

```text
src/server/services/shoppingList.ts   # add / mark-bought / list logic
src/server/routes/shoppingList.ts      # GET, POST, POST :id/bought
src/client/pages/ShoppingList.tsx       # To Buy + Bought (grouped by date) + Bought-all
prisma/schema.prisma  # ShoppingListItem
tests/server/shopping-list-service.test.ts, shopping-list-routes.test.ts
```

**Structure Decision**: Smallest standard slice. No timers, no auth gating beyond
office scope.

## Complexity Tracking

| Decision | Why | Note |
|----------|-----|------|
| Keep bought items | Traceability | No delete endpoint by design |
| Office column on item | Multi-office isolation | Index `(office_location_id, bought, created_at)` |
