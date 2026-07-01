# Feature Specification: Poll Lifecycle

**Feature Branch**: `n/a — existing feature on main`

**Created**: 2026-06-04

**Status**: migrated

**Input**: Reverse-engineered from existing code. Source of truth:
`src/server/services/poll.ts`, `src/server/routes/polls.ts`,
`src/client/components/Poll*.tsx`, tests in `tests/server/poll-*.test.ts`.
Original prose: `specs/old/poll-lifecycle.md`.

> Migrated spec — describes behavior already shipped, not new work.

## User Scenarios & Testing

### User Story 1 - Start and run a timed menu poll (Priority: P1)

Any team member starts a timed vote on which menu the team orders from today;
everyone votes in real time and a winner is determined when the timer expires.

**Why this priority**: Core of phase 1 — without it there is no team-lunch flow.

**Independent Test**: Start a poll with ≥2 menus, cast votes from multiple
nicknames, let the timer expire, confirm a single winner is persisted and
broadcast.

**Acceptance Scenarios**:

1. **Given** ≥1 menu with items and no poll in progress, **When** a user starts a
   poll with a description and a duration, **Then** a poll is created with
   `status=active`, `ends_at = now + duration`, and a `poll_started` SSE event is
   broadcast to the office.
2. **Given** an active poll, **When** a user casts a vote for a menu, **Then** the
   vote is stored with their nickname + the menu name snapshot and a `vote_cast`
   event broadcasts updated counts.
3. **Given** an active poll whose timer expires with one clear top menu, **Then**
   `status=finished`, `winner_menu_id`/`winner_menu_name` are set, and a
   `poll_ended` event with `status=finished` + winner is broadcast.

### User Story 2 - Resolve a tie (Priority: P1)

When the timer expires with two or more menus sharing the top count, the team
resolves it by extending the poll or picking a random winner.

**Why this priority**: A tie blocks the whole flow; resolution is mandatory.

**Independent Test**: Force a 1–1 tie, then (a) extend and confirm voting resumes,
and (b) on a fresh tie, pick random and confirm a tied candidate wins.

**Acceptance Scenarios**:

1. **Given** a tie, **When** an admin or the poll creator extends by 5/10/15/30
   min, **Then** `status=active`, `ends_at = now + extension`, `poll_extended`
   broadcasts, and a new expiry timer is scheduled.
2. **Given** a tie, **When** any user triggers random selection, **Then** a winner
   is chosen uniformly from the tied top menus, `winner_selected_randomly=true`,
   `status=finished`, and `poll_ended` broadcasts.
3. **Given** a finished poll (single or random winner) and
   `DEFAULT_FOOD_SELECTION_DURATION_MINUTES > 0`, **Then** food selection
   auto-starts for the winning menu.

### User Story 3 - Manual early end and abort (Priority: P2)

A user can finish a running poll early; an admin can abort it entirely.

**Why this priority**: Operational control; not needed for the happy path.

**Acceptance Scenarios**:

1. **Given** an active poll, **When** a user confirms early finish, **Then** the
   poll is counted immediately, persisted with `ended_prematurely=true`, and an
   audit log entry `poll_closed_early` is best-effort written.
2. **Given** an active or tied poll, **When** an admin aborts it, **Then**
   `status=aborted`, the timer is cleared, `poll_ended` with `status=aborted`
   broadcasts, and a `poll_killed_by_admin` audit entry is best-effort written.

### Edge Cases

- **Second poll while one runs**: rejected with 409 ("A poll is already in
  progress") — only one poll may be `active`/`tied` per office.
- **New poll while an order is ongoing**: rejected with 409 — blocked while a food
  selection is `ordering`/`delivering`/`delivery_due`.
- **Vote after expiry**: rejected 400 ("Poll has expired").
- **Duplicate vote** (same nickname+menu): rejected 409.
- **Vote for excluded menu**: rejected 400 with the exclusion reason.
- **Excluding all menus**: rejected 400 — at least one option must remain.
- **No votes at expiry**: poll finishes with no winner.
- **Single menu with items**: `createAutoFinishedPoll` skips voting — instant
  finished poll, no broadcast (caller handles SSE).

## Requirements

### Functional Requirements

- **FR-001**: System MUST allow any user to start a poll with a description
  (1–120 chars) and a duration that is a multiple of 5 in [5, 720] minutes.
- **FR-002**: System MUST reject a new poll (409) if an `active`/`tied` poll
  exists, or if a food selection is `ordering`/`delivering`/`delivery_due`.
- **FR-003**: Excluded menus MUST each carry a justification (1–240 chars); at
  least one menu option MUST remain votable.
- **FR-004**: Users MUST be able to vote for one or more menus, one vote per
  menu per nickname; withdraw a single vote; or withdraw all their votes.
- **FR-005**: Vote/withdraw MUST be rejected (400) once `status != active` or the
  timer has expired.
- **FR-006**: On timer expiry the System MUST count votes, and finish with a
  single winner, or set `status=tied` when ≥2 menus share the top count.
- **FR-007**: Tie extension MUST be limited to 5/10/15/30 minutes and is
  restricted to admins or the poll creator (route-enforced).
- **FR-008**: Random winner MUST pick uniformly among tied top menus and flag
  `winner_selected_randomly=true`.
- **FR-009**: Every state transition MUST broadcast its SSE event
  (`poll_started`, `vote_cast`, `vote_withdrawn`, `poll_extended`, `poll_ended`)
  scoped to the office location.
- **FR-010**: Finished/aborted polls MUST be retained (no automatic deletion);
  name snapshots (`winner_menu_name`, `menu_name`) MUST be stored alongside FKs.
- **FR-011**: Early finish MUST set `ended_prematurely=true`; abort MUST set
  `status=aborted`. Both MUST write a best-effort audit-log entry.
- **FR-012**: A new client connecting during `active`/`tied` MUST receive current
  poll state via the `initial_state` SSE event.

### Key Entities

- **Poll**: description, status (`active`/`tied`/`finished`/`aborted`), `started_at`,
  `ends_at`, `ended_prematurely`, `winner_menu_id` + `winner_menu_name`,
  `winner_selected_randomly`, `created_by` (creator key), `office_location_id`.
- **PollVote**: `poll_id`, `menu_id`, `menu_name` (snapshot), `nickname`; unique on
  (`poll_id`, `menu_id`, `nickname`).
- **PollExcludedMenu**: `poll_id`, `menu_id`, `menu_name` (snapshot), `reason`.
- **AuditLog**: `event`, `actor_email`, `target_type`, `target_id` (best-effort).

### Realtime / SSE Events

- **poll_started** — new poll active; payload `{ poll }`.
- **vote_cast** / **vote_withdrawn** — updated `{ poll }` with counts.
- **poll_extended** — `{ pollId, newEndsAt }`; clients restart countdown.
- **poll_ended** — `{ pollId, status, endedPrematurely?, winner? }` for
  finished/tied/aborted.

### Data / Migration Impact

- Models: `Poll`, `PollVote`, `PollExcludedMenu`, `AuditLog` — present in both
  `prisma/schema.prisma`.
- Name-snapshot columns present (`menu_name`, `winner_menu_name`).

### Scope Flags

- Multi-office aware: **yes** — all queries scoped by `office_location_id`.
- Auth scope: public to vote; extend/abort gated to admin/creator at the route.
- Email notification: **yes** — approved users emailed on poll start (best-effort).

## Success Criteria

### Measurable Outcomes

- **SC-001**: Only one poll is ever `active`/`tied` per office (409 enforced).
- **SC-002**: Winner determination is correct for clear-majority and tie inputs,
  verified by `tests/server/poll-service.test.ts`.
- **SC-003**: Expired polls reject votes; route authz verified by
  `tests/server/poll-authz.test.ts` and `poll-timer.test.ts`.
- **SC-004**: Random selection only ever picks a tied top candidate.

## Assumptions

- Nickname is not a user entity — passed in request bodies, stored as `VARCHAR`.
- Countdown is client-driven from `ends_at`; the server timer is the authority.
- `DEFAULT_FOOD_SELECTION_DURATION_MINUTES` defaults to 30; office-level override
  applies outside test runtime.
- Random selection uses `Math.random` (uniform, non-cryptographic) — acceptable.
