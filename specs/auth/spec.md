# Feature Specification: Authentication & Access Control

**Feature Branch**: `n/a — existing feature on main`

**Created**: 2026-06-04

**Status**: migrated

**Input**: Reverse-engineered from existing code. Source of truth:
`src/server/routes/auth.ts`, `src/server/services/{authAccess,authSession,
entraOidc,localAuth,localLoginProtection}.ts`, `src/client/auth.ts`,
`src/client/components/AuthGate.tsx`, tests `tests/server/auth-*.test.ts`,
`local-auth.test.ts`, `local-user-management-authz.test.ts`. Original prose:
`specs/old/auth-hardening.md` (+ `specs/old/identity.md` for nickname).

> Migrated spec. Auth is **optional** — when no auth env is configured the app
> runs open with nickname-only identity. Nickname identity itself is a separate
> client-only concern (see `specs/old/identity.md`).

## User Scenarios & Testing

### User Story 1 - Local username/password sign-in (Priority: P1)

A user signs in with an email + password verified against DB-managed local
accounts; a signed HttpOnly session cookie is issued.

**Why this priority**: Primary gate when local auth is enabled.

**Independent Test**: Seed a local user, `POST /api/auth/local/login`, confirm a
signed HttpOnly cookie and that protected routes accept it.

**Acceptance Scenarios**:

1. **Given** a valid local account, **When** `POST /api/auth/local/login` with
   correct credentials, **Then** a signed HttpOnly session cookie (username, auth
   method, issued-at) is set.
2. **Given** repeated failed logins, **When** they exceed the abuse threshold,
   **Then** per-IP (and/or per-username) rate-limit/backoff rejects or delays
   further attempts predictably; a successful login clears the penalty window.
3. **Given** no local-auth env configured, **Then** local login routes are
   inactive and the app runs open.

### User Story 2 - Microsoft Entra SSO (Priority: P1)

A user signs in via Entra authorization-code flow; the backend fully validates
the id_token before issuing a session.

**Acceptance Scenarios**:

1. **Given** Entra configured, **When** the user completes the callback
   (`${APP_PUBLIC_URL}${BASE_PATH}/api/auth/entra/callback`), **Then** the backend
   validates signature, issuer, audience/client-id, expiry, **and** the allowed
   `ENTRA_TENANT_ID` before creating a session.
2. **Given** any validation step fails, **Then** no session cookie is issued.
3. **Given** a valid Entra login, **Then** `team_lunch_nickname` is synced from the
   Entra username and rename is disabled for that session.

### User Story 3 - Approval gate (Priority: P1)

When an admin email is configured, new non-admin users wait for approval before
using the app.

**Acceptance Scenarios**:

1. **Given** `AUTH_ADMIN_EMAIL` set, **When** a new non-admin signs in, **Then**
   they are held on a waiting screen (`auth_access_users` persists pending state).
2. **Given** a pending user, **When** the admin approves them, **Then** they gain
   access; approval/blocked/admin state is re-checked from the DB on protected
   flows, not trusted from the cookie alone.

### User Story 4 - Admin user management (Priority: P2)

An admin generates local credentials and promotes/demotes users.

**Acceptance Scenarios**:

1. **Given** an authenticated admin session, **When** `POST /api/auth/local/users/
   generate`, **Then** a DB-backed local account is created.
2. **Given** an admin, **When** `POST /api/auth/users/promote` or `/demote`,
   **Then** `auth_access_users.is_admin` flips — except `AUTH_ADMIN_EMAIL`, the
   bootstrap admin, which cannot be deleted or demoted.

### Edge Cases

- **Dual auth**: local + Entra can both be enabled; user may use either.
- **Logout**: clears the session cookie; does not invalidate prior id_tokens or
  other sessions (no server session store).
- **Blocked user**: re-checked from DB; blocked state denies protected flows even
  with a valid cookie.

## Requirements

### Functional Requirements

- **FR-001**: Local login MUST verify email+password against DB-managed accounts
  and issue a signed HttpOnly cookie (username, method, issued-at).
- **FR-002**: `POST /api/auth/local/login` MUST apply per-IP (±per-username) abuse
  protection; success clears the penalty.
- **FR-003**: Entra sign-in MUST validate id_token signature, issuer, audience,
  expiry, and state, plus the allowed tenant, before issuing a session.
- **FR-004**: Local bootstrap credentials via env MUST NOT exist — local accounts
  are admin/DB-managed only.
- **FR-005**: When `AUTH_ADMIN_EMAIL` is set, non-admin users MUST be held pending
  until admin approval (persisted in `auth_access_users`).
- **FR-006**: Approval/blocked/admin state MUST be resolved from application data
  on protected requests, not trusted from the cookie alone.
- **FR-007**: Admins MUST be able to generate local users and promote/demote;
  the bootstrap admin MUST be undeletable and demotion-protected.
- **FR-008**: Auth MUST be optional — unconfigured auth env ⇒ open app.
- **FR-009**: Cookie protections (signed, HttpOnly) MUST NOT be weakened.

### Key Entities

- **AuthAccessUser** (`auth_access_users`): email, is_admin, approval/blocked
  state, office access.
- **LocalAuthUser** (`local_auth_users`): email, password hash, admin-managed.
- **Session cookie**: signed HttpOnly — username, auth method, issued-at.
- **AuditLog**: sign-in / admin actions (follow-up candidate, partial today).

### Realtime / SSE Events

- None core to auth. Approval changes surface on the client via re-fetch /
  AuthGate re-evaluation, not a dedicated SSE event.

### Data / Migration Impact

- Models `AuthAccessUser`, `LocalAuthUser` in both Prisma schemas.
- Office access linkage to `office_location_id`.

### Scope Flags

- Multi-office aware: **yes** — office access resolved per user.
- Auth scope: this **is** the auth layer; admin-only routes guarded by session.
- Email notification: **yes** — approval reminders (`auth-approval-reminder`).

## Success Criteria

### Measurable Outcomes

- **SC-001**: Failed Entra token validation never issues a session
  (`auth-hardening.test.ts`).
- **SC-002**: Local-login lockout rejects/delays brute force
  (`auth-hardening.test.ts`, `local-auth.test.ts`).
- **SC-003**: Pending users are gated until approved
  (`auth-approval-gate.test.ts`).
- **SC-004**: Non-admins cannot manage users; bootstrap admin is protected
  (`local-user-management-authz.test.ts`).

## Assumptions

- Custom Fastify auth is retained deliberately — no Auth.js/Next migration.
- No external/shared session store (in-process; single-instance).
- Nickname identity is client-only (`localStorage` `team_lunch_nickname`); Entra
  overrides + locks it. See `specs/old/identity.md`.
- Audit logging for auth attempts is a known follow-up, not fully present.
