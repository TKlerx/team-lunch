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

## Focused checks (planned tests)

```sh
pnpm exec vitest run --project server tests/server/ordering-policy.test.ts tests/server/office-location-service.test.ts tests/server/poll-routes.test.ts tests/server/office-poll-schedule.test.ts
pnpm exec vitest run --project client tests/client/Administration.test.tsx tests/client/PollIdleView.test.tsx tests/client/OrderingPolicyNotice.test.tsx
pwsh -File ./validate.ps1 all
```

The ordering-policy and OrderingPolicyNotice suites are planned additions; the
other listed suites already exist. Each task names its actual focused check in
its completion notes.

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
FAIM updates/validation are deferred for this session at the user's request.

## Manual acceptance

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
