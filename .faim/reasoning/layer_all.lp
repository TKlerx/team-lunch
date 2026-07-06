% Layer assignment across all code entities (service + route + module).
% faim-mode: optimize
% faim-description: assign all code entities to layers with fewest upward dependencies

#const nlayers = 5.

target(X) :- entity(X, service).
target(X) :- entity(X, route).
target(X) :- entity(X, module).
dep(X,Y) :- rel(X, depends_on, Y), target(X), target(Y).

leaf(X) :- target(X), not dep(X, _).
route_dep_target(Y) :- entity(X, route), dep(X, Y), entity(Y, route).
top_route(X) :- entity(X, route), not route_dep_target(X).

pinned(X) :- leaf(X).
pinned(X) :- top_route(X).
free(X) :- target(X), not pinned(X).

layer(1..nlayers).

% --- Pin leaves to layer 1, leaf routes to top ---
assign(X, 1) :- leaf(X), not entity(X, route).
assign(X, 1) :- leaf(X), route_dep_target(X).
assign(X, nlayers) :- top_route(X).

% --- Free entities get one layer ---
1 { assign(X,L) : layer(L) } 1 :- free(X).

% --- Strict ordering: if X depends on Y, X must be above Y ---
:- dep(X,Y), assign(X,LX), assign(Y,LY), LX <= LY.

% --- Symmetry breaking: layers used in order ---
:- layer(L), L > 1, not used(L-1), used(L).
used(L) :- assign(_, L).

upward_dep(X,Y) :- dep(X,Y), assign(X,LX), assign(Y,LY), LX < LY.

#minimize { 1@1,X,Y : upward_dep(X,Y) }.

#show assign/2.
#show upward_dep/2.
