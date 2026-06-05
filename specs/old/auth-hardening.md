# Spec: Authentication Hardening

## Topic
Short-term security hardening for the existing custom Fastify authentication stack.

This spec is intentionally narrow. The goal is to make the current auth model safer and easier to reason about without replacing it with a new auth framework.

## Current Model

- Backend: Fastify route handlers under `/api/auth/*`
- SSO: Microsoft Entra authorization-code flow handled on the backend
- Local auth: email + password verified against `local_auth_users`
- Session model: signed `HttpOnly` cookie containing username, auth method, and issued-at timestamp
- Authorization: approval, blocked-state, admin role, and office access resolved from application data

## Product Decision

- Keep the current custom auth architecture for now.
- Do not migrate to Next/Auth.js, Next.js, or a third-party full auth framework in this hardening pass.
- Improve correctness and abuse resistance around the existing implementation.

## Goals

- Validate Entra sign-in responses correctly instead of trusting decoded JWT payloads alone.
- Reduce the risk of brute-force guessing against local password login.
- Keep the current user-facing flows unchanged where possible:
  - Entra sign-in button
  - local username/password sign-in
  - approval waiting screen
  - admin approval and office-assignment flows
- Preserve backend-driven auth state so existing app authorization rules continue to work.

## Non-Goals

- No auth-provider migration
- No UI redesign of the sign-in screen beyond what hardening requires
- No new identity providers
- No full RBAC redesign
- No external session store unless required by a chosen hardening step

## Requirements

### 1. Entra Token Validation

- The backend must validate more than the `tid` claim before creating a session.
- The implementation must verify the Entra `id_token` according to normal OIDC expectations for this app, including:
  - signature validation against Entra signing keys
  - issuer validation
  - audience / client ID validation
  - expiration / time-based validation
- State validation must remain in place.
- If a validation step fails, no app session cookie may be issued.
- The allowed-tenant check remains required in addition to the standard token validation.

### 2. Local Login Abuse Protection

- `POST /api/auth/local/login` must gain basic abuse resistance.
- The initial hardening pass should use a simple, operationally cheap mechanism such as:
  - per-IP rate limiting, or
  - per-IP plus per-username backoff / lockout
- Protection must reject or delay repeated failed attempts in a predictable way.
- Successful login should clear the penalty window for that identity / source as appropriate.
- Normal single-user sign-in should remain smooth for office/internal usage.

### 3. Session Expectations

- Session cookies remain signed and `HttpOnly`.
- Auth hardening must not weaken current cookie protections.
- The system should continue to re-check approval / blocked / admin state from application data on protected flows rather than trusting only cookie contents.
- Session behavior should be documented clearly enough that future contributors understand:
  - what is stored in the cookie
  - what is derived from the database on each request
  - what a logout does and does not invalidate

### 4. Test Coverage

- Add focused backend tests for failed Entra token validation paths.
- Add focused backend tests for local-login rate limiting / lockout behavior.
- Preserve existing auth-route, auth-session, and local-auth coverage.

## Implementation Notes

- A small, well-scoped OIDC/JWT verification helper is acceptable if it reduces custom crypto/protocol risk.
- Prefer simple in-process rate limiting first unless the hardening work clearly requires a shared store.
- Keep deployment ergonomics reasonable for the current single-app setup.

## Follow-Up Candidates

- Session rotation / session listing / forced logout
- Audit logging for sign-in attempts and auth failures
- More granular admin / office-admin auth policy work
- Broader CORS / CSRF posture review for cookie-authenticated endpoints
