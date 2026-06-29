% reasoning.lp — ASP decision programs (clingo). The Datalog engine
% (rules/deduction.pl) answers "what is true" with one model; clingo searches
% *many* valid configurations under constraints — "what should we do".
%
% `faim reason` adds the fact base (entity/2, rel/3) as clingo atoms, then runs
% this program. Edit / add programs here per project.
%
% --- min feedback arc set -------------------------------------------------
% Smallest set of depends_on edges to remove so the graph becomes acyclic — a
% refactor aid ("which dependency cuts break this cycle, minimally?"). On an
% already-acyclic graph the optimum is the empty set. `faim reason --max N`
% adds a hard bound: UNSAT proves no acyclic configuration cuts <= N edges.

#const maxcut = -1.                              % -1 = no bound (pure optimization)

edge(X,Y) :- rel(X, depends_on, Y).
{ cut(X,Y) } :- edge(X,Y).                       % choose edges to remove
keep(X,Y)   :- edge(X,Y), not cut(X,Y).
path(X,Y)   :- keep(X,Y).
path(X,Z)   :- keep(X,Y), path(Y,Z).
:- path(X,X).                                    % kept graph must be acyclic
:- maxcut >= 0, #count{ X,Y : cut(X,Y) } > maxcut.
#minimize { 1,X,Y : cut(X,Y) }.                  % fewest cuts wins
#show cut/2.
