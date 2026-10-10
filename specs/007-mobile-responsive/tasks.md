# Tasks: Mobile-friendly Team Lunch

Specification checklist: 5/5 passed. Research and existing shared controls are sufficient foundations.

- [x] T001 [US1] Apply responsive fixes in `src/client/App.tsx`, shared controls and affected lunch components; add browser regressions in `tests/e2e/responsive.spec.ts` plus relevant client tests; verify widths, scrolling, long content and desktop behavior; run focused tests and `validate.ps1 all`/`full`, record evidence and commit.

One complete vertical task. No parallel implementation or backend/schema changes.

- [x] T002 [US1] Correct visually verified mobile overflow in dashboard and lunch grids; keep countdowns/prices readable, stack crowded order details, and strengthen browser checks against clipped inner content. Inspect screenshots on phone portrait/landscape and desktop; run focused tests and all/full validation, record evidence, commit and update PR #69.

## Validation evidence

- Focused client suites: OrdersRail/Header 31 tests and ManageMenus/Modal 35 tests passed during implementation; the final full run covers the finished versions.
- `validate.ps1 full` passed on 2026-10-10, including all quality gates: 95 files / 1,491 tests, lines 85.94%, branches 77.18% (Vitest 4.1.11), production audit, Semgrep, and no HIGH/CRITICAL Trivy image findings.
- All ten Playwright tests passed: seven responsive regressions and three smoke tests. Widths 320/375/768/1280px cover routes, lunch phases, long content, thirty history entries, account menus and keyboard-accessible scrolling dialogs.
- Earlier full runs were interrupted by Docker disk exhaustion, which stopped disposable PostgreSQL and caused authentication/database failures. Reclaimed only task-owned superseded images/cache, restored readiness and reran the full gate successfully. No production data or unrelated Docker artifacts were changed.
- Rebased onto the completed removal branch after validation; this adds its committed validation documentation and the identical dependency patch already validated here. Responsive source is unchanged.
- Automated browser evidence does not claim physical-device or screen-reader verification.

## T002 mobile interaction and visual audit

- Reproduced an off-screen Add button at 375px despite passing outer overflow checks. Explicit single-column grids fix the implicit minimum-content tracks; regression checks now inspect inner control/grid rectangles.
- Inspected Chromium/WebKit screenshots at 320/375/768/1280px, including ordinary and long meal names, active polling, meal selection, ordering/delivery, completed feedback and short scrolling dialogs. Timers/prices stay readable; meal names/notes wrap, recommendation controls fit, and completed feedback fields have usable width.
- Final extra browser run: 22 Chromium/WebKit mobile-emulation tests passed over local HTTPS, including Add/Remove/processed-label taps, rating/remark submission in portrait and landscape, and keyboard menu editing with focus restoration. Uses real local sign-in and deterministic application/API fixtures; not physical-device or screen-reader evidence.
- Focused client checks passed, including the new keyboard Edit regression. Final `validate.ps1 full` passed on 2026-10-10: all quality/security gates, 95 files / 1,492 tests, 86.00% lines and 77.24% branches (Vitest 4.1.11), production image Trivy scan and 14 Playwright tests. The full gate includes every `all` check.
- An initial aggregate run lacked the worktree test session secret; a subsequent full run exposed a test callback over the function-length limit. Supplied the process-scoped test secret and split the test groups without weakening authentication or raising the quality baseline, then completed the clean full run.
- Tightened the menu-dialog final-action check after screenshot inspection; its two Chromium/WebKit cases passed again, with Save fully inside the 320×480 viewport after scrolling.
