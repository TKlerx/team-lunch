# Feature Specification: Individual food-order item removal

**Feature Branch**: `codex/006-individual-order-removal`
**Created**: 2026-10-09
**Status**: Specified
**Input**: Remove a single dish from the bottom own-order summary, retaining other dishes; BACKLOG-010 / GitHub #66.

## User Scenarios & Testing

### User Story 1 - Remove one added dish (Priority: P1)

Users can remove a single entry where they review their added meals without clearing the entire order.

**Why this priority**: Prevent accidental removal of meals the user still wants.
**Independent Test**: Add two instances of the same dish with different notes; remove one from Your added meals; the other remains.

**Acceptance Scenarios**:

1. Given multiple own items, when one Remove action is used, then only that order entry is withdrawn.
2. Given another user's items, when the own summary is displayed, then it offers no action for their entries.
3. Given withdrawal fails, then the item stays visible, an error appears, and the user can retry.
4. Given an in-flight item withdrawal, then item removal and bulk withdrawal cannot be submitted again from the summary.
5. Given own items, when Withdraw all items is used, then the entire own order is withdrawn as before.

### Edge Cases

- Duplicate dish names and different notes identify separate order entries.
- Empty orders disable the bulk action and show no item controls.
- Closed collection retains its existing read-only behavior.
- Pending updates retain existing server-driven synchronization.

## Requirements

### Functional Requirements

- **FR-001**: Each own summary entry MUST have a clearly associated, keyboard-accessible Remove action.
- **FR-002**: Individual removal MUST retain every other order entry.
- **FR-003**: Bulk removal MUST explicitly say Withdraw all items.
- **FR-004**: The summary MUST block duplicate mutations while removal is pending, surface failures, and allow retry.
- **FR-005**: Existing ownership, office scope, and collection cutoff MUST remain enforced.

### Key Entities

- Food-order entry: existing stable order ID, dish snapshot, and optional notes.

### Realtime / SSE Events

- Existing order-withdrawn notifications update the removed entry or entire own order as appropriate.

### Data / Migration Impact

No schema or stored-data format changes.

### Scope Flags

- Multi-office aware: existing selected-office scope.
- Auth scope: authenticated approved users, own entries only.
- Email notification: none.

## Success Criteria

- **SC-001**: Removing one of two identical dishes leaves exactly the other entry.
- **SC-002**: Item and bulk actions are distinguishable by accessible name.
- **SC-003**: Failure retains order contents and the same action supports retry.

## Assumptions

This covers food-order items, not menu votes, as confirmed by the user. Existing server withdrawal and realtime behavior are reused. Component regression tests accompany the change.
