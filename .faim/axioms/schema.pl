% schema.pl — the project's vocabulary (Tier 1, hash-tracked).
% Declares the legal kinds, attributes, and relationship types. `faim check`
% rejects any fact that uses undeclared vocabulary — this is the anti-drift guard.
%
% Source of truth: .specify/memory/constitution.md (v1.1.0) and
% specs/003-learned-meal-recommender/plan.md.

% --- kinds ---
kind(project).
kind(service).    % src/server/services/*.ts — owns business logic
kind(route).      % src/server/routes/*.ts    — thin: validate->service->return
kind(endpoint).   % an HTTP endpoint a route exposes
kind(module).     % other source module (db singleton, shared lib, util)
kind(event).      % an SSE event name broadcast through src/server/sse.ts
kind(type).       % a shared request/response/domain type in src/lib
kind(domain).     % durable product/business area
kind(actor).      % user/system role participating in the product
kind(workflow).   % core product flow or phase

% --- attributes ---
attr(project, language, atom).
attr(project, architecture, atom).
attr(project, storage, atom).
attr(project, orm, atom).
attr(project, runtime, atom).
attr(project, realtime, atom).
attr(project, summary, string).
attr(project, primary_goal, string).

attr(endpoint, method, atom).
attr(endpoint, path, string).
attr(endpoint, mutates_state, boolean).
attr(endpoint, requires_auth, boolean).

attr(service, mutates_shared_state, boolean).   % changes shared lunch state others must observe

attr(event, scoped_by, atom).                   % e.g. office_location (multi-office isolation)

attr(domain, summary, string).
attr(actor, summary, string).
attr(workflow, summary, string).
attr(workflow, stateful, boolean).

% --- relationship types ---
reltype(depends_on, any, any).
reltype(emits, one_of([service, route]), event).
reltype(consumes, any, event).
reltype(exposes, route, endpoint).
reltype(declares, one_of([service, module, route]), type).
reltype(uses, any, any).
reltype(owns, actor, domain).
reltype(precedes, workflow, workflow).
reltype(participates_in, actor, workflow).

% --- temporal event types (for requirement triggers) ---
event_type(deployment).
