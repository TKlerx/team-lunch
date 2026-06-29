% invariants.pl — structural invariants (Tier 1). What must remain true.
% Named requirements; the breach rules live in rules/deduction.pl and emit
% violation(ReqId, Subject, Reason).

requirement(no_circular_deps,  'the service/module/route dependency graph is acyclic').
requirement(auth_on_mutations, 'any endpoint that mutates state requires authentication').
