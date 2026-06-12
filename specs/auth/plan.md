# Implementation Plan: Authentication & Access Control

**Branch**: `n/a — existing` | **Date**: 2026-06-04 | **Spec**: [spec.md](spec.md)

**Status**: migrated (reverse-engineered from shipped code)

## Summary

Custom Fastify auth is mandatory for lunch workflow access: DB-managed local
username/password and/or Microsoft Entra SSO (authorization-code, fully
validated id_token), behind a signed HttpOnly session cookie. Approval gate +
admin role + office access are resolved from application data on each protected
request. The cookie carries `sessionVersion`, checked against
`auth_access_users.session_version` so sensitive account/access changes
invalidate missed-SSE/offline sessions. Local login has in-process abuse protection. When no auth method is
available, the client shows an authentication setup error instead of running
open with nickname-only identity. Auth profile/access/login events are recorded
to `auth_audit_logs` for future admin-facing history without adding UI now.

## Technical Context

**Language/Version**: TypeScript (ESM) on Node.js

**Primary Dependencies**: Fastify 5, `@fastify/cors`, Prisma 6 (`AuthAccessUser`, `LocalAuthUser`), `jose` (JWT/OIDC verify), Microsoft Entra OIDC

**Storage**: PostgreSQL / SQLite — dual Prisma schema

**Testing**: Vitest + Supertest — `tests/server/auth-{approval-gate,approval-reminder,hardening,routes-config,session}.test.ts`, `local-auth.test.ts`, `local-user-management-authz.test.ts`

**Project Type**: Single-package full-stack web app

**Constraints**: Cookie signed + HttpOnly; DB re-check of approval/blocked/admin on protected flows; bootstrap admin (`AUTH_ADMIN_EMAIL`) undeletable/demotion-protected; auth required for user-attributed flows; display names are optional and non-unique.

**Scale/Scope**: 5 server services + 1 route module; client `AuthGate.tsx` + `auth.ts`.

## Constitution Check

- Thin routes → logic in `services/*`: **pass** (auth split across focused services).
- Single Prisma client via `db.ts`: **pass**.
- Shared types in `src/lib/types.ts`: **pass**.
- SSE: **n/a** — auth is request/response; no realtime events.
- Tests mandatory: **pass** (7 server suites).
- Name snapshots: **n/a** for auth entities.

## Project Structure

```text
src/server/routes/auth.ts                       # /api/auth/* handlers (thin)
src/server/services/authSession.ts              # cookie issue/verify, session shape
src/server/services/authAccess.ts               # approval/blocked/admin/office resolution
src/server/services/entraOidc.ts                # Entra code flow + id_token validation
src/server/services/localAuth.ts                # local credential verify + admin mgmt
src/server/services/localLoginProtection.ts     # per-IP/username rate limit + lockout
src/client/auth.ts, src/client/components/AuthGate.tsx
prisma/schema.prisma | schema.sqlite.prisma     # AuthAccessUser display names/session version, LocalAuthUser, AuthAuditLog
tests/server/auth-*.test.ts, local-auth.test.ts, local-user-management-authz.test.ts
```

**Structure Decision**: One service per auth concern (session / access / Entra /
local / abuse), routes orchestrate. Entra config is backend env-driven
(`APP_PUBLIC_URL` + `BASE_PATH` derive the callback URI; optional
`ENTRA_REDIRECT_URI` override).

## Complexity Tracking

| Decision | Why | Note |
|----------|-----|------|
| Keep custom auth (no Auth.js) | Hardening pass, not a rewrite | Deliberate per `specs/old/auth-hardening.md` |
| In-process login lockout | Operationally cheap for single-app | Not shared across instances |
| DB re-check of authz state each request | Cookie must not be sole source of truth | Slightly more queries, safer |
| Stateless session (no server store) | Simplicity | Logout can't invalidate other sessions/id_tokens |
