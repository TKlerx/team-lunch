% deduction.pl — logic programs (not facts). Consulted as-is by the engine.
:- dynamic violation/3.

% --- readable sugar over EAV ---
authenticated(X) :- prop(X, requires_auth, true).
mutating(X)      :- prop(X, mutates_state, true).

% transitive dependency closure (local helper; distinct from the engine's
% built-in reaches/3 used at query time).
dep_reaches(A, B) :- rel(A, depends_on, B).
dep_reaches(A, B) :- rel(A, depends_on, M), dep_reaches(M, B).

% --- invariant breaches ---

% no_circular_deps: a node that transitively depends on itself.
violation(no_circular_deps, X, cycle_through(X)) :-
    rel(X, depends_on, _),
    dep_reaches(X, X).

% auth_on_mutations: a state-mutating endpoint with auth disabled.
violation(auth_on_mutations, E, mutating_endpoint_without_auth) :-
    prop(E, mutates_state, true),
    prop(E, requires_auth, false).

% realtime_via_sse: a service that mutates shared state but emits no SSE event.
violation(realtime_via_sse, S, mutates_shared_state_without_emit) :-
    prop(S, mutates_shared_state, true),
    \+ rel(S, emits, _).
