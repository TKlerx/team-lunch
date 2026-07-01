% Find minimal dependency cuts to lower a target entity to a given max layer.
% faim-mode: optimize
% faim-description: find minimal cuts to lower a target entity below a layer threshold

#const target = officePollSchedule.
#const max_layer = 4.
#const nlayers = 6.

target_entity(X) :- entity(X, service).
target_entity(X) :- entity(X, route).
target_entity(X) :- entity(X, module).

dep(X,Y) :- rel(X, depends_on, Y), target_entity(X), target_entity(Y).
layer(1..nlayers).

% --- Allow cutting deps only in target's transitive cone ---
reachable_from_target(target).
reachable_from_target(Y) :- reachable_from_target(X), dep(X, Y).
cuttable(X,Y) :- dep(X,Y), reachable_from_target(X).
{ cut(X,Y) } :- cuttable(X,Y).
active_dep(X,Y) :- dep(X,Y), not cut(X,Y).

% --- Pin leaves to layer 1 ---
leaf(X) :- target_entity(X), not dep(X, _).
assign(X, 1) :- leaf(X).

% --- Free entities get one layer ---
pinned(X) :- leaf(X).
1 { assign(X,L) : layer(L) } 1 :- target_entity(X), not pinned(X).

% --- Strict ordering on active deps only ---
:- active_dep(X,Y), assign(X,LX), assign(Y,LY), LX <= LY.

% --- The goal ---
:- assign(target, L), L > max_layer.

% --- Symmetry breaking ---
used(L) :- assign(_, L).
:- layer(L), L > 1, not used(L-1), used(L).

% --- Minimize cuts only ---
#minimize { 1,X,Y : cut(X,Y) }.

#show cut/2.
#show assign(target, L) : assign(target, L).
