# Tasks: Mobile-friendly Team Lunch

Specification checklist: 5/5 passed. Research and existing shared controls are sufficient foundations.

- [x] T001 [US1] Apply responsive fixes in `src/client/App.tsx`, shared controls and affected lunch components; add browser regressions in `tests/e2e/responsive.spec.ts` plus relevant client tests; verify widths, scrolling, long content and desktop behavior; run focused tests and `validate.ps1 all`/`full`, record evidence and commit.

One complete vertical task. No parallel implementation or backend/schema changes.

## Validation evidence

- Focused client suites: OrdersRail/Header 31 tests and ManageMenus/Modal 35 tests passed during implementation; the final full run covers the finished versions.
- `validate.ps1 full` passed on 2026-10-10, including all quality gates: 95 files / 1,491 tests, lines 85.94%, branches 77.18% (Vitest 4.1.11), production audit, Semgrep, and no HIGH/CRITICAL Trivy image findings.
- All ten Playwright tests passed: seven responsive regressions and three smoke tests. Widths 320/375/768/1280px cover routes, lunch phases, long content, thirty history entries, account menus and keyboard-accessible scrolling dialogs.
- Earlier full runs were interrupted by Docker disk exhaustion, which stopped disposable PostgreSQL and caused authentication/database failures. Reclaimed only task-owned superseded images/cache, restored readiness and reran the full gate successfully. No production data or unrelated Docker artifacts were changed.
- Rebased onto the completed removal branch after validation; this adds its committed validation documentation and the identical dependency patch already validated here. Responsive source is unchanged.
- Automated browser evidence does not claim physical-device or screen-reader verification.
