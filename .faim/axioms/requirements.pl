% requirements.pl — prescriptive axioms (Tier 1). What the project MUST satisfy.
% The five Core Principles + Quality Gates from constitution.md (v1.1.0).
% Structural invariants (acyclic deps, auth-on-mutations) live in invariants.pl.

% --- Core Principles (I–V) ---
requirement(thin_routes,        'routes only validate -> service -> return; no business logic in src/server/routes').
requirement(single_prisma_client, 'all DB access goes through the Prisma singleton in src/server/db.ts').
requirement(shared_types,       'request/response and domain types defined once in src/lib, imported by both sides').
requirement(realtime_via_sse,   'state-changing services broadcast through src/server/sse.ts; no silent shared-state mutations').
requirement(tests_mandatory,    'every feature ships its Vitest/Supertest + Testing Library tests in the same change').

% --- Quality Gates (tool-verifiable; run only under `faim check --verify`) ---
requirement(typecheck_clean,    'tsc --noEmit passes across server + client + lib').
verifiable_by(typecheck_clean,  typecheck).

requirement(lint_clean,         'ESLint (incl. sonarjs) passes').
verifiable_by(lint_clean,       lint).

requirement(architecture_guard, 'dependency-cruiser architecture guard passes (enforces thin routes / single client)').
verifiable_by(architecture_guard, architecture).

requirement(deps_clean,         'no production dependency vulnerabilities').
verifiable_by(deps_clean,       audit).
trigger(deps_clean,             event(deployment, before)).
