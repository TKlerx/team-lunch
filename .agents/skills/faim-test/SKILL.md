---
name: faim
description: >-
  Query and maintain a project's formal, logic-based memory in `.faim/`. Use
  whenever a `.faim/` directory is present: orient via stored facts before
  digging through code, check invariants/requirements before and after changes,
  record what you derive with provenance, and keep facts fresh. Also triggers on
  "faim", "formal memory", "project memory", or the `faim` CLI (init/bootstrap/
  check/status/query/reason/assert/add/retract/attest/stale/update/refresh/seal).
---

# FAIM — Formal AI Memory

FAIM is a queryable, logic-based memory of a codebase. It replaces repeated code
digging with stored facts you can query, and catches drift/contradictions
formally. Facts live in `.faim/` and are versioned with the project.

**Golden rule:** before reading code to answer a structural question, ask FAIM.
Trust facts by default; verify by exception when the stakes are high or the fact
is stale/low-confidence.

## Mental model (minimum needed)

- **Two tiers.** *Axioms* (`.faim/axioms/`) are co-authored ground truth —
  descriptive (`prop(project, language, rust)`) or prescriptive
  (`requirement(...)`). Changing them is high-ceremony. *Derived*
  (`.faim/derived/`) are facts you scanned from code, with provenance.
- **EAV vocabulary.** Everything is `entity(Id, Kind)`, `prop(Id, Attr, Value)`,
  `rel(Src, RelType, Dst)`. The legal kinds/attrs/reltypes are declared in
  `axioms/schema.pl` — using an undeclared one is a hard error (anti-drift).
- **Trust = freshness, cheaply checked.** A fact whose source files are unchanged
  (hash match) is trustworthy for free. Only changed-source facts need attention.

## Commands

```bash
# Orient — understand the project's state and structure
faim bootstrap [--project PATH]  # whole-project overview: schema vocabulary, requirements, state, checklist
faim status [--project PATH]     # fact counts, stale count, axiom-hash, violations, req enforcement
faim query "GOAL" [--project PATH] [--json] [--limit N]   # ad-hoc Prolog goal — one answer to deduce
faim query "reaches(A, Rel, B)"          # built-in transitive closure over any reltype (impact/blast-radius)
faim reason [--max N]        # ASP/clingo decision — many valid answers searched (e.g. min-cut to break cycles)

# Validate — around changes and in CI
faim check [--strict] [--verify] [--on TARGET]   # 4-pass validation; --verify runs allowlisted tools
faim seal                   # re-bless axiom digest after a deliberate Tier 1 (axiom) change

# Record — write Tier 2 facts (with provenance)
faim add entity|prop|rel ARG…   # quote-free EAV entry (no raw Prolog terms) — the common case
faim batch facts.txt --files A B --query "the question"   # many EAV lines: entity|prop|rel ...
faim assert "FACT" --source agent_scan --files A B --query "the question" [--replace]   # raw term; --why aliases --query; --files @list reads a path list
faim retract "FACT"   |  faim retract entity|prop|rel ARG…   # remove a fact + provenance (quote-free mirrors add)
faim attest KIND TIMESTAMP  # record a user-attested occurrence

# Keep fresh — after sources change
faim stale                  # facts whose source files changed (cheap hash sweep)
faim update                 # re-derivation worklist for stale facts
faim refresh --all          # re-bless hashes of stale facts whose meaning is unchanged (no re-assert)
```

## On session pickup (do this proactively)

If the codebase is a nested repo/worktree, pass `--project PATH` instead of
changing directories. Provenance paths are stored relative to that FAIM root.

1. `faim status` — learn fact counts, stale count, whether axioms changed. (First
   time on an unfamiliar project? `faim bootstrap` gives the fuller one-shot
   overview — schema vocabulary + requirements + state.)
2. Read `axioms/` — the project's intent, invariants, requirements. This is your
   fast orientation; do not re-derive it from code.
3. `faim check --on schedule` (when temporal requirements exist) — surface any
   overdue/unconfirmed time obligations and **prompt the user** about them
   (e.g. "secret rotation looks overdue — done it?"). On confirmation, record it
   with `faim attest`. FAIM never detects real-world events; you are the bridge.
4. If `faim stale` is non-empty, refresh those facts (see "Keeping facts fresh").

## Orienting on a task

- Query FAIM instead of grepping: "what depends on X?", "which endpoints are
  unauthenticated?", "what does module Y assume?".
- Each answer carries freshness/confidence. Fresh + high-confidence → trust and
  proceed. Stale or low-confidence + high stakes → verify against code.
- `query` vs `reason`: reach for `query` when the question has **one** answer to
  deduce (what depends on X, is Y authenticated, full reachability). Reach for
  `reason` only when there are **many** valid answers to search/optimize over —
  e.g. "fewest `depends_on` edges to cut to break all cycles". A plain impact set
  is `query`, not `reason`.

## Making a change

Use the smallest memory that answers the task. Model only durable, decision-relevant
facts; do not map the whole codebase before touching code.

1. Before: query dependents/relationships to scope the blast radius. Direct edges
   are `rel(X, depends_on, target)`; for the *full* radius use the built-in
   `reaches(X, depends_on, target)` — transitive closure over any reltype, so you
   catch indirect dependents a one-hop query misses. Examples:
   - event flow: `reaches(X, depends_on, client_sse_hub)` or `rel(service, emits, Event)`
   - shared type flow: `reaches(X, depends_on, food_selection_type)`
   - endpoint audit: `prop(E, mutates_state, true), prop(E, requires_auth, false)`
2. After: refresh affected derived facts, then `faim check`. Report any new
   `violation` (broken invariant, now-unauthenticated endpoint, requirement
   breached). **You surface; the user resolves** — never silently amend an axiom.
3. Changing an axiom is high-ceremony: make it explicit, get a good reason, and
   expect a wave of re-derivation + a fresh check. After a deliberate, agreed
   axiom change, run `faim seal` to re-bless the digest.

## Deriving facts (Tier 2) — with discipline

When you scan code and assert a fact:

- **Record every file you consulted** in `--files`. Provenance completeness is the
  linchpin of trust — a missing file means silent staleness later. `--files` accepts
  globs and directories, so an aggregate fact (e.g. "package P depends_on Q",
  derived from many files) records *all* of them, not one representative.
  But don't over-couple: passing a whole directory ties the fact to *every* file
  under it, so unrelated edits flag it stale. List the files that actually
  determine the fact (for package containment/imports, usually the `__init__`/
  module-index file), not the entire tree.
- **One id, one kind.** A canonical key (path/module/FQN) maps to a single
  entity of a single kind — `check` flags the same id under two kinds as an
  identity violation. In ecosystems where a name is both a package and a module
  (Python `flask.json` is a dir *and* an importable name), pick one kind for the
  bare id and disambiguate the other (e.g. `flask.json` the package vs
  `flask.json:__init__` the module).
- **Record the question** in `--query` (alias `--why`) so the fact can be
  re-derived. Long file lists: `--files @sources.txt` (one path/glob per line).
- **Skip raw Prolog for the common case.** `faim add entity ID KIND`,
  `faim add prop ID ATTR VALUE`, `faim add rel SRC RELTYPE DST` build the term and
  quote it for you (same `--files/--query/--replace`). Reach for raw
  `faim assert "TERM"` only when `add` can't express the shape.
- **Only materialize what earns it.** Store a fact iff it is (a) expensive or
  impossible to cheaply re-derive, AND (b) decision-relevant, AND (c) cheaply
  kept trustworthy (stable source or tool-verifiable). If you'd have to check the
  code anyway, do not store it.
- **Prefer tool-verifiable facts** (`verifiable_by` + a `faim.conf` tool) over
  your own judgement — they re-check cheaply and never go stale silently.

## Keeping facts fresh

- `faim stale` lists facts whose sources changed; `faim update` gives the
  worklist (each with its derivation question + changed files).
- Re-read only the changed files, re-answer each question, then re-`faim assert`
  with `--replace` (drops the stale copy + its provenance in place, then writes
  fresh — no retract-first). Never re-scan everything — the unchanged majority is
  already trustworthy.
- Use `faim refresh --all` only for facts whose **meaning is unchanged** after you
  inspected the changed source bytes. If the answer changed, re-derive with
  `--replace`; if you did not check, leave it stale.

## Adopting FAIM on a new project

1. `faim init`.
2. Co-author the minimum `axioms/schema.pl` vocabulary needed for the task. Common
   TS/web vocabulary: `module`, `endpoint`, `event`, `type`, `interface`;
   `depends_on`, `emits`, `consumes`, `exposes`; endpoint attrs such as `method`,
   `path`, `mutates_state`, `requires_auth`.
3. Help the user state axioms — descriptive (language, architecture) and
   prescriptive (coverage, auth, deploy gates). Then `faim seal` to bless the
   axiom digest (authoring axioms changes it).
4. `faim bootstrap` to see the declared vocabulary + an authoring checklist, then
   scan the codebase and record the high-value structural facts with `faim add`
   or `faim batch` (quote-free, with provenance) — raw `faim assert` only for
   shapes `add` can't express. Propose missing vocabulary as a schema addition
   for the user to approve (that is a Tier 1 change, so re-`seal` after).
5. `faim check` — surface the first contradictions between stated intent and
   observed reality.

## Recipes

### Invariant audit

1. Add `requirement(ID, ...)` in axioms.
2. Record observed facts, e.g. endpoint `mutates_state` and `requires_auth`.
3. Add a `violation(ID, Subject, Reason)` rule.
4. Run `faim check`; fix code or record intentional exceptions with rationale.
5. Update facts, re-run `faim check`, and report exact validation commands.

### Blast-radius change

1. Record only the dependency edges needed for the target (`depends_on`, `emits`,
   `consumes`, `exposes`).
2. Query `reaches(X, depends_on, Target)` before editing.
3. Edit the scoped files; then run `faim stale`, re-derive changed facts or
   `refresh` only unchanged meanings, and `faim check`.

### Validation reporting

Report the exact cwd/project root, environment variables, and command. If a test
needs special env and you cannot reproduce it, say so instead of claiming pass.

## Hard rules

- Never put a derived fact in `axioms/`, never edit `axioms/` without explicit
  user agreement.
- Never claim a fact is true beyond what its freshness/confidence supports.
- Never run a verification tool that is not allowlisted in `faim.conf`.
