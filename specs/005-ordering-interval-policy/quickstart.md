# Quickstart and Validation: Ordering Interval Policy

## Preparation

Use Node 24, pnpm 11, and the dedicated test PostgreSQL. Do not reset app data.

```sh
pnpm db:test:up
pnpm exec prisma migrate dev
pnpm exec prisma generate
```

Run migration commands only once schema changes exist; these are implementation
instructions, not actions already performed in the documentation phase.

## Focused checks

```sh
pnpm exec vitest run --project server tests/server/ordering-policy.test.ts tests/server/office-location-service.test.ts tests/server/poll-routes.test.ts tests/server/office-poll-schedule.test.ts
pnpm exec vitest run --project client tests/client/Administration.test.tsx tests/client/PollIdleView.test.tsx tests/client/OrderingPolicyNotice.test.tsx
pwsh -File ./validate.ps1 all
```

These suites now exist. Each task names its actual focused check in its
completion notes. Phase 6's focused availability/warning checks are:

```sh
pnpm exec vitest run --project client tests/client/OrderingPolicyAvailability.test.tsx tests/client/PollIdleView.test.tsx tests/client/OrderingPolicyNotice.test.tsx tests/client/useOrderingPolicy.test.tsx
```

On 2026-10-02, this check passed 81 tests and the aggregate gate passed all
1,471 tests. Phase 6 is complete. T016's expanded automated acceptance checks
and their scope are recorded below; the manual checklist remains available for
human rollout verification.

## T012 validation while PostgreSQL is unavailable

The normal server project requires its test database even for pure calendar
checks. This isolated command runs only the DB-free office-time suite with the
existing Vitest installation; it does not validate scheduler integration or
replace the aggregate ship gate:

```sh
node --input-type=module -e "import { startVitest } from 'vitest/node'; const ctx = await startVitest('test', ['tests/server/office-time.test.ts'], { config: false, watch: false, environment: 'node', include: ['tests/server/office-time.test.ts'] }); const failed = !ctx || ctx.state.getFiles().length !== 1 || ctx.state.getFiles().some(file => file.result?.state !== 'pass'); await ctx?.close(); process.exit(failed ? 1 : 0);"
```

If `pnpm db:test:up` reports an unavailable Docker daemon, start Docker first.
Then run the focused T012 check and the aggregate gate:

```sh
pnpm db:test:up
pnpm exec vitest run --project server tests/server/office-poll-schedule.test.ts tests/server/office-time.test.ts tests/server/ordering-policy-starts.test.ts
pwsh -File ./validate.ps1 all
```

Both checks passed on 2026-10-02 after Docker and the dedicated test database
started: 278 focused tests and 1,420 aggregate tests. T012 is complete; the
isolated command above is only a fallback for future DB outages. No schema
migration is needed for T012.
FAIM was deferred during T012–T015. T017 resumed selective source/test fact
refresh and validation without changing axioms.

## T016 automated acceptance results — 2026-10-02

From the repository root, with the healthy dedicated test PostgreSQL:

```sh
pnpm db:test:up
pnpm exec vitest run --project server tests/server/ordering-policy.test.ts tests/server/office-location-service.test.ts tests/server/poll-routes.test.ts tests/server/office-poll-schedule.test.ts tests/server/office-time.test.ts tests/server/ordering-policy-settings.test.ts tests/server/ordering-policy-starts.test.ts tests/server/ordering-policy-routes.test.ts tests/server/ordering-policy-history.test.ts tests/server/ordering-policy-realtime.test.ts
pnpm exec vitest run --project client tests/client/Administration.test.tsx tests/client/PollIdleView.test.tsx tests/client/OrderingPolicyNotice.test.tsx tests/client/OrderingPolicyAvailability.test.tsx tests/client/useOrderingPolicy.test.tsx tests/client/ordering-policy-api.test.ts tests/client/OrderingPolicyHistory.test.tsx
pwsh -File ./validate.ps1 all
pwsh -File ./validate.ps1 full
```

Results: 458 server tests / 10 files and 165 client tests / 7 files passed.
`all` passed every gate with 1,471 tests / 94 files and 88.70% line / 81.86%
branch coverage. `full` also passed the pinned Trivy image scan and all three
Playwright smoke tests (88.69% line / 81.84% branch coverage in that run).
No dev migration/reset, dependency addition, or feature fix was necessary.

The following existing automated checks exercise the ten acceptance scenarios.
All paths below are relative to `tests/`.

| Scenario | Passing coverage |
|---|---|
| 1. Per-office policy/save/reload | `client/Administration.test.tsx`, `server/office-location-service.test.ts`, `server/ordering-policy-settings.test.ts`, `server/ordering-policy.test.ts` |
| 2. Completion → next local Monday, not elapsed cooldown | `server/ordering-policy.test.ts` Friday-to-Wednesday and next-boundary cases; `client/OrderingPolicyAvailability.test.tsx` exact Vienna time/countdown |
| 3. Normal/quick cancel, invalid reason, signed override/history | `client/PollIdleView.test.tsx`, `client/OrderingPolicyNotice.test.tsx`, `server/ordering-policy-starts.test.ts`, `server/ordering-policy-history.test.ts` |
| 4. Direct requests, forged attribution, private metadata | `server/ordering-policy-starts.test.ts`, `server/ordering-policy-routes.test.ts`, `server/ordering-policy-history.test.ts`, `server/ordering-policy-realtime.test.ts` |
| 5. Scheduled skips and fresh scheduled windows | `server/office-poll-schedule.test.ts` used/future period, configured-window, activity and deduplication cases |
| 6. Multiweek no carryover | `server/ordering-policy.test.ts` all restricted intervals; `server/office-poll-schedule.test.ts` fresh multiweek block then completed suppression |
| 7. Scoped remote refresh and immutable history/ongoing records | `server/ordering-policy-realtime.test.ts`, `client/useOrderingPolicy.test.tsx`, `server/ordering-policy-history.test.ts` (composed coverage, not two browsers) |
| 8. Disable/preserve/re-enable and no countdown | `client/Administration.test.tsx`, `server/ordering-policy-settings.test.ts`, `client/OrderingPolicyAvailability.test.tsx` |
| 9. Controlled-clock future/year/DST/exact-boundary cases | `server/ordering-policy.test.ts`, `server/office-time.test.ts`, `server/office-poll-schedule.test.ts` |
| 10. Office switch during pending availability | `client/useOrderingPolicy.test.tsx`, `client/OrderingPolicyAvailability.test.tsx` |

Accessibility review/tests cover named/labelled warnings, initial Cancel focus,
Tab trapping, focus restoration, Escape/dismissal and a non-live countdown.
Privacy review/tests cover signed admin/office-scoped REST detail and no private
snapshot in public formatters, initial/live SSE or start responses.

**Acceptance limitation:** no human manual checklist, visual/screen-reader test,
or actual two-browser policy-refresh session was performed. The existing
Playwright suite verifies production boot/login/navigation only. Automated
service/component coverage above is not a claim of policy-specific browser E2E
coverage; use the following checklist for rollout verification.

## Manual acceptance (human rollout checklist)

1. Set one office to weekly, Europe/Vienna, Monday anchor. Set another to Unrestricted.
2. Complete a lunch in the restricted current period. Confirm countdown shows next Monday at office-local midnight, not completion plus seven days.
3. Try normal and single-menu starts. Cancel leaves no artifacts; blank reason cannot proceed; valid reason starts and admins see its original snapshot in history.
4. Verify direct requests cannot bypass the warning, forge actors, or retrieve private exception metadata as non-admins.
5. Verify automatic polls skip a used period and future anchor; a fresh period permits the configured scheduled window, not an immediate unscheduled catch-up.
6. Skip a whole two-week block. The next block has one opportunity, not two.
7. Change policy/zone/anchor from another admin browser. The landing page refreshes without reload; existing lunch and historical exceptions remain unchanged.
8. Select Unrestricted. Anchor is disabled with explanatory text, save needs no anchor, countdown disappears, and re-enabling restores the prior valid anchor.
9. Exercise future anchor, year rollover, spring/fall DST, and completion exactly at a boundary using controlled clocks in tests.
10. Switch office while availability is loading; no previous-office result appears.

## Ship gate

Run focused checks, aggregate `validate.ps1 all`, FAIM validation after affected
facts are refreshed, and the full E2E/security gate before merge per constitution.
Do not mark implementation tasks done based on document creation alone.
