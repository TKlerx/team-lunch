# Spec: Poll Lifecycle (Phase 1)

## Topic of Concern
The poll system allows any user to start a timed vote on which food menu the team wants to order from today. It handles the full lifecycle: creation, real-time voting, tie resolution, winner selection, and persistence.

## Pre-conditions
- At least one menu with at least one item exists (enforced by app navigation — see `app-navigation.md`).
- No poll is currently active. The system enforces that **only one poll may exist in a non-finished state at any time** (`status = active` or `status = tied`).

## States

```
IDLE → ACTIVE → TIED | FINISHED
                  ↓
              EXTENDED → TIED | FINISHED
```

| State    | Description                                              |
|----------|----------------------------------------------------------|
| IDLE     | No poll is running; any user may start one               |
| ACTIVE   | Poll is running; votes are being collected               |
| TIED     | Timer expired, two or more menus share the top vote count|
| FINISHED | Winner determined; result persisted                      |

## Starting a Poll

- Any user can start a poll by providing:
  - **Description** (required): free text, 1–120 characters — e.g. "What do we eat today?"
  - **Duration** (required): chosen from steps of 5 min in the range **5 min – 12h** (i.e. 5, 10, 15 … 720 minutes)
  - **Excluded menus** (optional): any menu may be excluded, but each excluded menu requires its own non-empty justification text
- If exclusions are provided, at least one menu option must remain in the poll.
- Before creating, the server checks for any existing poll with `status = active` or `status = tied`. If one is found the request is rejected with HTTP 409 ("A poll is already in progress").
- On submission the poll record is created in the DB with `status = ACTIVE` and `ends_at = now + duration`.
- All connected clients are immediately notified via SSE (`poll_started` event — see `realtime-events.md`).

## Voting

- The poll UI is visible to all users including newcomers who arrive after the poll starts.
- Participation is optional — users may choose to observe without voting.
- A user opens the poll to cast votes.
- Menus excluded during poll creation are not votable in that poll and are shown with their exclusion justifications.
- **Multi-menu voting**: a user may vote for **one or more menus**; only **one vote per menu per user** is allowed.
- Voting actions:
  - **Cast vote**: add a vote for a menu (stored with the voter's nickname and timestamp).
  - **Withdraw vote**: remove a previously cast vote for a specific menu.
  - There is no "update" — withdrawal + re-cast achieves the same effect.
- Votes can be placed or withdrawn at any time while `status = ACTIVE` and the timer has not expired.
- After the timer expires no new votes or withdrawals are accepted.
- Users can also withdraw from the poll overall by removing all of their current menu votes in one action.

## Real-time Countdown & Histogram

- While `status = ACTIVE` every connected client displays:
  - **Circular countdown ring**: decreasing ring visually showing remaining time; remaining time (formatted as `HH:MM:SS` or `MM:SS` when < 1h) displayed in the ring center.
  - **Live vote histogram**: a bar chart showing current vote counts per menu, updated in real time via SSE (`vote_cast` / `vote_withdrawn` events).
- Countdown is driven client-side from `ends_at` (avoids server polling); SSE events keep vote totals in sync.

## Public Voter Choices (Real-time)

- During `ACTIVE`, all connected users can see who has voted and which menu(s) each voter selected.
- This view updates in real time from SSE vote events.

## Premature Finish (Manual Early End)

- While `status = ACTIVE`, any user can choose to finish the poll immediately.
- The UI must require explicit confirmation before triggering this action.
- The poll is persisted as `status = FINISHED` and includes `ended_prematurely = true`.
- SSE broadcasts `poll_ended` with `status = finished` and `endedPrematurely = true`.

## Timer Expiry

When `ends_at` is reached the server transitions the poll:
1. Count votes per menu.
2. Find the menu(s) with the highest vote count.
3. If exactly one menu has the highest count → `status = FINISHED`, `winner_menu_id` set, winner persisted.
4. If two or more menus share the highest count → `status = TIED`.
5. SSE broadcasts `poll_ended` (with `status` field indicating `finished` or `tied`).

## Tie Resolution

When `status = TIED`, any user can choose one of two actions:

### Option A — Extend Duration
- Extension options: **5 min, 10 min, 15 min, 30 min**.
- Only admins or the original poll creator can trigger the extension.
- Extension sets `ends_at = now + extension`, returns `status = ACTIVE`.
- SSE broadcasts `poll_extended` event.
- Voting resumes as normal.

### Option B — Random Winner
- Any user can trigger random selection among the tied top candidates.
- The server picks a winner at random (uniform distribution) from the tied menus.
- `status = FINISHED`, `winner_menu_id` set, `winner_selected_randomly = true` flagged in the record.
- SSE broadcasts `poll_ended` with `status = finished`.
- If `DEFAULT_FOOD_SELECTION_DURATION_MINUTES` is greater than `0`, the server immediately starts food selection for the resolved winner after finishing the poll. The default is **30 minutes**.

## Finished State

- The winning menu is displayed prominently.
- If the winner was randomly selected, a "chosen randomly from a tie" label is shown.
- The poll result is persisted in PostgreSQL.
- All finished/aborted polls are retained (no automatic poll deletion).
- Any user can proceed to start Phase 2 (Food Selection) from the finished poll UI.
- In approval-workflow mode, the poll and food-selection records persist the creator key so creator-only management rules remain enforceable later.

## Notifications

- When a poll starts, all connected clients receive a `poll_started` SSE event and the UI transitions to the active poll view automatically.
- Clients that connect while a poll is `ACTIVE` or `TIED` receive the current poll state on SSE connection establishment (`initial_state` event).

## Out of Scope
- Multiple simultaneous polls (actively prevented — only one poll may be active or tied at a time).
- Weighted votes.
