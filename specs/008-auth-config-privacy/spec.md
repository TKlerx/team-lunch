# Auth bootstrap office privacy

Created: 2026-10-10. Status: Implemented; PR CI pending. Intake: BACKLOG-012 / GitHub #65.

## User scenarios and testing

### User Story 1 — Private offices with working sign-in (P1)

Visitors can discover available sign-in methods without learning office information. Signed-in approved users can select their assigned offices, while administrators can manage all offices.

Independent test: inspect bootstrap responses for anonymous, invalid, expired, removed-local, revoked, pending, blocked, approved-user and administrator sessions; verify sign-in and authorized office switching.

Acceptance scenarios:
1. Without a valid current session, office lists are empty and selected office is absent; no office names, identifiers, schedules, policy settings or timestamps appear.
2. An approved unblocked ordinary user receives only authorized office choices, each limited to identifier, key, name and active status. Administration settings and unrelated offices are absent.
3. A current approved unblocked administrator retains full office-management information.
4. Pending and blocked accounts receive no office information. Their existing approval/blocking screen state remains available.
5. Every bootstrap response, including errors and database-unavailable responses, is non-cacheable.

### Edge cases

Session validation can fail after approval lookup has succeeded; all resolved private state must then be discarded. Local accounts can be deleted, membership revoked, or session versions advanced. Database failures must not cause broader disclosure. Administrators still need inactive offices for management; ordinary office selectors retain their current active-office behavior.

## Requirements

- FR-001 Keep sign-in method discovery public and preserve normal local/Entra sign-in.
- FR-002 Disclose no office data to anonymous, invalid, expired, removed-local or revoked sessions.
- FR-003 Disclose authorized selector summaries only to approved unblocked ordinary users; full office records only to approved unblocked admins.
- FR-004 Fail closed after session-validation failures and preserve pending/blocked UI behavior.
- FR-005 Prevent storage of all bootstrap responses, including failures.
- FR-006 Preserve existing office selection and administration without new user actions.

## Success criteria

- SC-001 All rejected/unapproved-session fixtures disclose zero office records or selected office.
- SC-002 Ordinary-user fixtures contain exactly their assigned office choices and zero operational fields.
- SC-003 Administrator fixtures retain office settings; normal sign-in and office selection regressions pass.
- SC-004 All success/failure fixtures declare non-cacheable responses.

## Assumptions and scope

No new roles, office membership rules or database changes. Health, version, sign-in callbacks and other public endpoints are context in #65, not confirmed disclosure within this bounded fix. Tests use disposable databases, never production mutations.
