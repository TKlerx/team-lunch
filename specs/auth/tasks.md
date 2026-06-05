---
description: "Migrated task list — Authentication & Access Control (already implemented)"
---

# Tasks: Authentication & Access Control

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Status**: migrated — all tasks reflect shipped code and are marked `[x]`.

## Phase 1: Setup (Data)

- [x] T001 Define `AuthAccessUser` (`auth_access_users`) + `LocalAuthUser` (`local_auth_users`) in both Prisma schemas
- [x] T002 Add cleanup for auth tables in `tests/server/helpers/db.ts`
- [x] T003 [P] Auth-related shared types in `src/lib/types.ts`

## Phase 2: Foundational

- [x] T004 Session cookie issue/verify (signed, HttpOnly; username/method/issued-at) in `authSession.ts`
- [x] T005 [P] Access resolution (approval/blocked/admin/office) in `authAccess.ts`
- [x] T006 [P] `AuthGate.tsx` + `auth.ts` client gating

## Phase 3: User Story 1 — Local sign-in (P1)

- [x] T007 [US1] Local credential verify in `localAuth.ts`; `POST /api/auth/local/login`
- [x] T008 [US1] Abuse protection (per-IP/username rate limit + lockout) in `localLoginProtection.ts`; clear on success
- [x] T009 [US1] Tests: `local-auth.test.ts`, lockout in `auth-hardening.test.ts`

## Phase 4: User Story 2 — Entra SSO (P1)

- [x] T010 [US2] Entra authorization-code flow + callback URI derivation in `entraOidc.ts`
- [x] T011 [US2] Full id_token validation (signature/issuer/audience/expiry/state) + allowed-tenant check via `jose`
- [x] T012 [US2] Sync `team_lunch_nickname` from Entra username; disable rename
- [x] T013 [US2] Tests: failed-validation paths in `auth-hardening.test.ts`, config in `auth-routes-config.test.ts`

## Phase 5: User Story 3 — Approval gate (P1)

- [x] T014 [US3] Pending/waiting state for non-admins when `AUTH_ADMIN_EMAIL` set; persist in `auth_access_users`
- [x] T015 [US3] DB re-check of approval/blocked/admin on protected flows
- [x] T016 [US3] Approval reminder email
- [x] T017 [US3] Tests: `auth-approval-gate.test.ts`, `auth-approval-reminder.test.ts`, `auth-session.test.ts`

## Phase 6: User Story 4 — Admin user management (P2)

- [x] T018 [US4] `POST /api/auth/local/users/generate` (admin-gated)
- [x] T019 [US4] `POST /api/auth/users/promote` + `/demote` → `is_admin`; bootstrap admin protected
- [x] T020 [US4] Tests: `local-user-management-authz.test.ts`

## Phase 7: Cross-cutting

- [x] T021 Optional auth — unconfigured env runs the app open
- [x] T022 Dual-auth mode (local + Entra simultaneously)
- [x] T023 Office access linkage per user

## Identified Gaps

- ⚠️ **No server session store**: logout clears the cookie but cannot invalidate
  other sessions or already-issued id_tokens. Session rotation / forced logout are
  explicit follow-up candidates in `specs/old/auth-hardening.md`.
- ⚠️ **Auth audit logging incomplete**: sign-in attempts / auth failures are a
  named follow-up, not fully implemented. Confirm coverage before relying on it.
- ⚠️ **Lockout is in-process**: per-IP/username penalties are not shared across
  instances; a multi-node deploy weakens brute-force protection.
- ℹ️ **Verify**: CORS/CSRF posture for cookie-authenticated endpoints is listed as
  a follow-up, not confirmed hardened.

## Notes

- Run `./validate.ps1 all` before commit (includes semgrep + `npm audit --omit=dev`).
- Never trust the cookie alone — keep DB re-check on protected flows.
