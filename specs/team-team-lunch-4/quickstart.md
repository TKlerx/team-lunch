# Validation Guide: Office Duration Defaults

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Contract**: [contracts/durations.md](contracts/durations.md) | **Model**: [data-model.md](data-model.md)

Implementation acceptance guide: planning completion does not claim these commands passed or behavior exists. No reviewer-owned checklist is maintained/marked here.

## Prerequisites and setup

- Node 24, pinned pnpm, installed dependencies/generated Prisma client and pinned security scanners.
- Controller-provided dedicated disposable test PostgreSQL. Server suites migrate their dedicated schema (default `team_lunch_test`). Never target production or `TEST_DATABASE_SCHEMA=public`. No worker host checks/external infrastructure changes.
- Explicit process-scoped test URL: `.env.test` may target another database. Keep credentials out of artifacts/logs. Use existing signed-session fixtures or approved test accounts, never an auth bypass.

Run from repository root; prefix shell commands with RTK:

```powershell
$env:SPECIFY_FEATURE_DIRECTORY = 'specs/team-team-lunch-4'
$env:TEST_DATABASE_URL = '<controller-provided dedicated test PostgreSQL URL>'
$env:TEST_DATABASE_SCHEMA = 'team_lunch_test'
$env:VITEST_MAX_WORKERS = '1'
rtk pnpm install
```

After schema change, run `rtk pnpm prisma migrate dev` only with `DATABASE_URL` explicitly targeting an approved disposable development DB, per AGENTS. Do not accept a reset or use production; unavailable DB/access returns to controller. Server global setup uses `migrate deploy` on its dedicated schema. Migration fixtures use a separate disposable schema per [data-model.md](data-model.md), preserving application `public`.

## Focused commands

```powershell
rtk pnpm exec vitest run --project server tests/server/office-location-service.test.ts tests/server/ordering-policy-settings.test.ts
rtk pnpm exec vitest run --project server tests/server/food-selection-service.test.ts tests/server/food-selection-routes.test.ts tests/server/food-selection-authz.test.ts tests/server/poll-service.test.ts tests/server/poll-routes.test.ts tests/server/poll-authz.test.ts
rtk pnpm exec vitest run --project server tests/server/sse.test.ts tests/server/sse-integration.test.ts tests/server/ordering-policy-realtime.test.ts tests/server/office-poll-schedule.test.ts
rtk pnpm exec vitest run --project client tests/client/Administration.test.tsx tests/client/PollIdleView.test.tsx tests/client/PollFinishedView.test.tsx tests/client/app-context.test.ts tests/client/useSSE.test.ts
```

Extend existing suites/fixtures. Restore temporary env, mocks and zero automatic-start opt-out after focused cases. Enabled auto-start tests verify saved office defaults, not merely positive global env override. Existing test-runtime real-mail suppression remains intact.

## Acceptance scenarios

| Scenario | Action and expected result | Coverage / requirements |
|---|---|---|
| 1. Safe upgrade | Seed pre-upgrade offices with differing food/schedule/policy values and history in disposable schema; apply new migration. Poll defaults become 5, other values/history remain identical. Check column non-null/default metadata and direct insert. | Office service/migration; FR-001–FR-002, FR-014; SC-001 |
| 2. Office creation/upsert | Service-create, default-office ensure and direct insert give poll 5/food 30. Save poll 15/food 45, ensure again: values remain. | Office service; FR-002, FR-005; SC-001 |
| 3. Administration | Verify ten poll presets and food 1/5/10/15/20/25/30/45/60. Save A=15/45, B=60/1; config refresh, reload/remount and repeated switches retain isolated values; unsaved office drafts survive refresh. | Administration/settings; FR-001, FR-003–FR-005; SC-002 |
| 4. Auth/atomic errors | Missing/expired/member sessions cannot write protected settings/start actions. Invalid duration alongside other changes leaves whole record unchanged, no settings event. Valid older-client save omitting poll field preserves it. | Settings/auth; FR-005, FR-009–FR-010, FR-012; SC-005 |
| 5. Initialization/override | Poll default 15 initializes fresh form, also when delayed after mount. Choose 30; same-office refresh/policy retry retains 30, saved default stays 15. Next fresh form uses current default. | PollIdleView; FR-006–FR-007; SC-003 |
| 6. Switch/late source | Pending A override 30, switch to B default 60: B uses/submits 60. Old A event/hydration cannot overwrite. Auth change discards prior pending context. | PollIdleView/useSSE/app-context; FR-005–FR-007, FR-011–FR-012; SC-003, SC-006 |
| 7. Food selectors/starts | Administration, quick-start and finished-poll dropdown retain presets and add 45/60. Normal/quick starts at 1/45/60 yield exact duration in timestamps. Explicit choice overrides default without settings write. | UI and food suites; FR-004, FR-008–FR-009; SC-004 |
| 8. Automatic defaults | A saves 45, B saves 60. Enable automatic transitions only in focused tests; finish winning polls, including applicable winner-resolution paths. Food selections use each office's saved value; restore zero opt-out. | Poll service/SSE; FR-008, FR-012–FR-013; SC-004, SC-007 |
| 9. Strict boundaries | Accept food 1/5/30/35/40/45/50/55/60; reject 0/-5/2/4/7/65/fractions/malformed types. Accept poll 5/20/720; reject 1/0/7/725/malformed types. Check settings/service/HTTP. Invalid quick-start creates neither record/event. Custom `45x`/`45.5` cannot submit 45. | Settings/poll/food/UI; FR-009–FR-010; SC-005 |
| 10. SSE lifecycle | Two A clients/one B: A save updates both defaults only in A. Fresh/reloaded/reconnected state uses saved values. New settings event before stale hydration wins; disconnected save then reconnect wins with new hydration. Wrong-office/old-source events ignored. | SSE/useSSE/app-context; FR-005, FR-011; SC-006 |
| 11. Timing regressions | Manual default change does not alter scheduled office-local finish time. Keep policy warnings/justifications/completed-lunch guards. Duration-only event does not invalidate policy. Extension/remaining-time/ETA valid behavior persists; default edits never retime running records. | Schedule/policy and existing timer/extension/delivery suites; FR-007, FR-012–FR-013; SC-007 |
| 12. Documentation/delivery | Confirm BACKLOG-010 and targeted obsolete food-cap updates/supersession; preserve unrelated artifacts, migrations and reviewer checklists. Run both required gates below. | FR-015–FR-017; SC-007 |

Manual browser verification, when controller provides a safe environment: use existing `rtk pnpm dev` and compare Administration/fresh starts in two selected offices and two same-office sessions. Do not label component tests or general Playwright smoke as feature-specific manual UI verification.

## Required delivery gates

```powershell
rtk proxy pwsh -NoProfile -File validate.ps1 all
rtk proxy pwsh -NoProfile -File validate.ps1 full
```

Both must pass before implementation delivery with dedicated test PostgreSQL. Preserve full's pinned Trivy/Playwright and all's coverage/audit/security/quality checks. No bypass, assertion weakening or timeout alteration. Non-test gates alone are insufficient when PostgreSQL is unavailable. Credentials, host/infrastructure or approval needs go to controller; locally repairable test/tool failures require actionable logs.

If pnpm still reports preparation's `ERR_SQLITE_ERROR`, repair permitted local store access before implementation validation. `rtk proxy node scripts/update-continuity.js` runs the same snapshot generator, but does not prove pnpm-based all/full passed. Refresh continuity when workflow changes; commits remain controller-owned.
