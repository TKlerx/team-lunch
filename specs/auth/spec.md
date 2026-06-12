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

> Migrated spec, updated June 2026. Auth is required for lunch workflow access:
> when no auth method is configured the app shows an authentication setup error
> instead of running open. User-attributed actions resolve identity from the
> signed session. Optional display names are persisted on auth access records;
> lunch votes and orders store stable actor keys plus immutable display
> snapshots for historical rows.

## User Scenarios & Testing

### User Story 1 - Local username/password sign-in (Priority: P1)

A user signs in with an email + password verified against DB-managed local
accounts; a signed HttpOnly session cookie is issued.

**Why this priority**: Primary gate when local auth is enabled.

**Independent Test**: Seed a local user, `POST /api/auth/local/login`, confirm a
   signed HttpOnly cookie and that protected routes accept it while the cookie
   session version matches `auth_access_users.session_version`.

**Acceptance Scenarios**:

1. **Given** a valid local account, **When** `POST /api/auth/local/login` with
   correct credentials, **Then** a signed HttpOnly session cookie (username, auth
   method, issued-at) is set.
2. **Given** repeated failed logins, **When** they exceed the abuse threshold,
   **Then** per-IP (and/or per-username) rate-limit/backoff rejects or delays
   further attempts predictably; a successful login clears the penalty window.
3. **Given** no local-auth users and no Entra configuration, **Then** the app
   reports authentication setup is required and does not render the lunch
   workflow.

### User Story 2 - Microsoft Entra SSO (Priority: P1)

A user signs in via Entra authorization-code flow; the backend fully validates
the id_token before issuing a session.

**Acceptance Scenarios**:

1. **Given** Entra configured, **When** the user completes the callback
   (`${APP_PUBLIC_URL}${BASE_PATH}/api/auth/entra/callback`), **Then** the backend
   validates signature, issuer, audience/client-id, expiry, **and** the allowed
   `ENTRA_TENANT_ID` before creating a session.
2. **Given** any validation step fails, **Then** no session cookie is issued.
3. **Given** a valid Entra login, **Then** the account username is used as the
   stable actor key and the ID-token `name` claim is cached as the managed
   display name.
4. **Given** Microsoft Graph app permissions are available, **When** the signed-in
   Entra user has a profile photo, **Then** the backend serves the image bytes
   through an app endpoint without exposing Graph URLs or tokens to the client.
5. **Given** no photo, missing Graph configuration, Graph/auth errors, or a local
   account, **Then** avatar display falls back to initials/generic UI and no
   avatar bytes are persisted.

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
- **Logout**: clears the session cookie. Admin local-account email edits and
  deletions also revoke matching local browser state over SSE when connected and
  make old local-session cookies fail because the original local account no
  longer exists.
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
- **FR-008**: Auth MUST be mandatory for the lunch workflow; unconfigured auth
  MUST show a setup/configuration error instead of falling back to open access.
- **FR-009**: Cookie protections (signed, HttpOnly) MUST NOT be weakened.
- **FR-010**: Session cookies MUST carry the current `auth_access_users.session_version`; protected requests MUST return `401 Session expired` when the cookie version no longer matches the database version.
- **FR-011**: Entra profile photos MUST be fetched server-side from Microsoft Graph only when Entra app credentials are configured and Graph permissions allow it.
- **FR-012**: Avatar bytes MUST NOT be persisted in the database or filesystem; successful photos, no-photo responses, and Graph/auth errors MAY be cached only in bounded per-process memory with TTLs.
- **FR-013**: The client MUST consume only the app backend avatar endpoint and MUST gracefully fall back to initials/generic avatar when the endpoint returns no image.

### Key Entities

- **AuthAccessUser** (`auth_access_users`): email, is_admin, approval/blocked
  state, office access, and `session_version` for authoritative session
  invalidation.
- **LocalAuthUser** (`local_auth_users`): email, password hash, admin-managed.
- **Session cookie**: signed HttpOnly — username, auth method, issued-at, and
  auth-access session version.
- **AuthAuditLog** (`auth_audit_logs`): DB-only profile/access/login history
  with actor email, target email, field, old/new values, metadata, and timestamp.
- **Avatar memory cache**: bounded per-instance process cache for Entra Graph
  photo bytes and fallback states; cleared on app restart and not shared between
  containers.

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
- Nickname identity is retired. Authenticated deployments use the signed session
  username as the authoritative actor key for votes, orders, preferences,
  shopping-list actions, and delivery actions. Display names are presentation
  snapshots, never ownership keys.
- Auth/profile audit history is persisted for backend inspection; no admin UI is
  part of this feature slice.
- Entra avatars use per-instance memory cache only. Multi-container deployments
  may fetch the same photo once per instance; app restart clears the cache; first
  loads may wait on Graph; photo freshness can lag until the relevant TTL expires.
