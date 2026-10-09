# Implementation Plan: Individual food-order item removal

**Branch**: `codex/006-individual-order-removal` | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

## Summary

Add per-entry Remove in Your added meals and clarify the bulk label. Reuse optional orderId withdrawal and SSE; server logic is unchanged.

## Technical Context

TypeScript, React 19, Vite 8, existing Button/toast. PostgreSQL and signed sessions unchanged. Vitest 4 / Testing Library for interaction tests; existing server tests cover ownership, orderId and broadcasts.

## Constitution Check

Pass before/after design: shared types, service-owned mutation, office/session scope, SSE, same-task tests, no migration/dependency changes. Run focused tests then `validate.ps1 all` and `full`.

## Project Structure

- `src/client/components/FoodSelectionActiveView.tsx`: summary controls and pending/error handler.
- `tests/client/FoodSelectionActiveView.test.tsx`: duplicate entries, pending/failure/retry and bulk contract.
- Existing API, route, service, and reducer reused.

## Complexity Tracking

No deviations. Extract only the summary markup into a same-file component if the form exceeds the 300-line cap.
