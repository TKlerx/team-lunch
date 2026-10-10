# Tasks: Auth bootstrap office privacy

Setup/foundation: existing auth services and shared contracts suffice. Specification checklist: 5/5 passed.

## User Story 1 (P1)

- [x] T001 [US1] Write failing privacy/session/projection tests in tests/server/auth-config-privacy.test.ts, fix src/server/routes/auth.ts using existing services/shared types, verify client sign-in/office flows, run focused tests and validate.ps1 all/full, record evidence, update spec continuity and commit.

## Dependencies and execution

One complete vertical task. No parallel implementation, new persistence, API or feature dependency. The mandatory planning research delegation is read-only. Full gate before push; no deploy or merge.

## Validation evidence

2026-10-10:

- Initial server privacy regressions: 13 failures / 1 pass before the fix; focused auth suites then passed 24 tests across 3 files. AuthGate passed 9 tests, including authorized office switching.
- Full Vitest 4 coverage run: 96 files / 1,503 tests passed; 86.05% lines and 77.36% branches. A later full rerun passed 1,490 tests but skipped 13 ordering-policy-settings tests after their existing beforeAll hook hit its 10-second timeout on the busy host. All 13 subsequently passed in a focused retry after warming the installed migration CLI; assertions and timeouts were unchanged. An intervening retry failed before tests at the existing migration startup timeout.
- Full quality gates, production audit and pinned Trivy scan passed. The corrected Playwright suite passed all 3 smoke tests; its real-login/privacy test also passed 5 consecutive runs. The first new authenticated assertion used APIRequestContext, which omitted the Secure loopback cookie; browser fetch now verifies the real UI session without weakening cookie flags.
- Disposable PostgreSQL schemas: team_lunch_privacy and e2e_auth_privacy. No deployed account or application mutations. Task-owned scan image/cache removed after validation; Docker data space restored to 3.1 GB.
- The final full command retained a nonzero exit for the transient setup timeout; the affected suite passed separately. CI must independently confirm the complete gate on the PR.
