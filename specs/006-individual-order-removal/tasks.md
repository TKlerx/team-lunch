# Tasks: Individual food-order item removal

## Setup and foundation

Existing withdrawal contract, controls, and realtime reducer meet prerequisites. Specification checklist: 5/5 passed.

## User Story 1

- [x] T001 [US1] Add individual summary removal and explicit bulk label in `src/client/components/FoodSelectionActiveView.tsx`, cover duplicates, pending, errors/retry and bulk behavior in `tests/client/FoodSelectionActiveView.test.tsx`, run focused tests and the all quality gates, record evidence and commit. Run the additional full gate before pushing.

## Dependencies and strategy

One complete vertical task; no parallel implementation or new APIs/migrations.

## Validation evidence

- Focused client suite: 50/50 passed (Vitest 4.1.11).
- All quality gates passed within the corrected `validate.ps1 full` run: text format, typecheck, lint, architecture, complexity, function size, duplication, Semgrep, production audit and coverage. Final patched run: 95 files / 1,490 tests; lines 85.92%, branches 77.11% (Vitest 4.1.11).
- Production build and three Playwright smoke tests passed against a separate disposable E2E schema.
- Initial all run failed because the fresh worktree lacked `AUTH_SESSION_SECRET`; corrected with an explicit test-only secret, without production credentials.
- Additional pre-push full gate passed on 2026-10-10: patched production image has no HIGH/CRITICAL Trivy findings, and all three Playwright smoke tests passed.
- The required image scan found existing CVE-2026-93749 in transitive `source-map-js` 1.2.1. Pin the maintainer's patched 1.2.2 through the existing pnpm overrides; no new dependency.
