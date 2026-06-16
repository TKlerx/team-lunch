# Phase 0 Research: Learned Meal Recommender

Resolves the items the spec deferred to planning and the technical unknowns from
Technical Context. Each decision records rationale + alternatives.

## Decision 1: Safe model = in-process factorization machine (TypeScript), batch-trained

**Decision**: Implement a small factorization machine (FM) by hand in TypeScript,
trained in-process as a batch job and persisted as serialized parameters. No
external ML service, no Python sidecar, no new heavy dependency.

**Rationale**:
- FM models a prediction as `w0 + Σ wᵢxᵢ + Σ_{i<j} ⟨vᵢ,vⱼ⟩ xᵢxⱼ` over a sparse
  feature vector. With our feature set (user, office, ~40 flavor tags, light
  context) and small data, this is a few hundred parameters trained with plain
  SGD — trivially implementable in TS without a math library.
- Keeps the constitution's quality gates clean: no new runtime dependency to
  `npm audit`, no toolchain, runs in the same Node process and same Prisma
  transaction boundary as everything else.
- FM is the right model for sparse categorical data and learns the
  user×flavor-feature interactions that produce personalization — exactly the
  feature-space modeling the spec mandates.
- Training off the request path means request latency is unaffected; scoring is
  cheap dot-products.

**Alternatives considered**:
- *@wlearn/xlearn WASM dependency*: viable spike, not selected as the default.
  See the dependency spike below.
- *External ML service / Python microservice*: rejected — adds infra, deploy, and
  privacy surface; overkill for hundreds of parameters; conflicts with the
  single-package, dependency-light constitution.
- *Heavy npm ML lib (tensorflow.js etc.)*: rejected — large dependency, audit/
  build cost, GPU assumptions, far more than needed.
- *Logistic regression (linear, no factors)*: viable and even simpler, but cannot
  model user×feature interactions in one shared model as cleanly; FM degrades to
  this if factor dimension k=0, so we keep FM with small k (e.g. 8).

## Decision 2: Feature vector, target, and training examples

**Decision**:
- **Features (sparse, multi-hot)**: user id, office id, each flavor tag of the
  candidate item, and light context (day-of-week bucket). User and office enter as
  their own factor entries so the FM learns user×flavor and office×flavor
  interactions.
- **Target**: binary "positive" via logistic FM. Positive = the user gave a
  signal of liking; negative = shown-or-available but not chosen / low-rated.
- **Example construction** from existing data:
  - Explicit rating ≥4 → positive; ≤2 → negative (strongest weight).
  - Order (no rating) → positive (implicit, medium weight).
  - Anticipated-like mark → positive; mark-dislike → negative (pre-taste, lower
    weight than a real rating; a later rating of the same dish replaces it).
  - From each persisted recommendation impression: the shown items the user did
    **not** order are weak negatives (presented, declined).
- Per-example confidence weights mirror feature 002's signal hierarchy:
  rating > order ≈ anticipated-like > impression-non-click.

**Rationale**: Reuses data already persisted by feature 002 (orders, ratings,
impressions) plus the new marks; needs no new user-facing feedback prompt
(consistent with spec). Logistic target makes the eval (top-3 hit rate) and the
score-to-probability interpretation clean and bounded.

**Alternatives considered**:
- *Regression on raw 1–5 rating*: rejected — most orders are unrated, so the
  binary positive/implicit framing uses far more data.
- *Pairwise/ranking loss (BPR)*: stronger in theory, deferred — more complex to
  implement and tune; logistic FM with impression negatives already yields a
  usable ranking for this scale. Noted as a future upgrade.

## Decision 3: Explore path = Thompson sampling wrapped around the same predictor

**Decision**: The explore action is not a separate model but an exploration
*policy* over the same FM predictor: maintain an uncertainty estimate per
flavor feature for the user (Beta-Bernoulli counts of positive/negative
outcomes), and for explore, score candidate items by a **sampled** optimistic
value (Thompson sampling) that favors high-uncertainty / novel flavors. Results
are labelled exploratory and their outcomes update the counts.

**Rationale**:
- Directly implements the spec's "one predictor, two policies": safe = low
  temperature + diversity/recency penalty; explore = sampled/optimistic.
- Beta-Bernoulli Thompson sampling over flavor features is tiny, online, needs no
  retraining, and naturally surfaces flavors the user hasn't tried (high variance)
  — which is what "explore something new" means.
- Honest exploration: only on the opt-in path, so it is never measured by the
  beat-the-baseline gate (which applies to the safe path only).

**Alternatives considered**:
- *Epsilon-greedy random injection*: simpler but dumber (uniform randomness, not
  uncertainty-directed); kept as a trivial fallback when a user has no counts yet.
- *Full contextual bandit replacing the FM*: rejected for v1 — more moving parts;
  the wrap-around policy captures the value with far less risk and reuses the FM.

## Decision 4: Safe-path anti-repetition (diversity / recency)

**Decision**: On the safe path, apply a recency penalty to items the user was
recently recommended or ordered, and a light diversity pass (cap near-duplicate
flavor profiles in the top-N), so a recurring favorite is not the identical #1
every time. This is exploit-with-variety, distinct from the explore path.

**Rationale**: Resolves the FM "same dish every week" feedback-loop the user
raised. Reuses the existing `recency` concept from feature 002. Keeps the safe
path predictable (no intentional bad picks) while avoiding degeneracy (FR-022).

**Alternatives considered**: Pure argmax (rejected — degenerate repetition);
softmax sampling on the safe path (rejected — introduces unwanted randomness into
the "safe" promise; sampling belongs to explore).

## Decision 5: Stable item identity = normalized name within office

**Decision**: Resolve the deferred identity item with a best-effort heuristic key:
a normalized (lowercased, trimmed, punctuation-collapsed) item name scoped to the
office. Persist this key on menu items at import; history/marks/learning join on
it so a re-import or rename of the same dish keeps its accumulated signal.

**Rationale**: Feature 002 already keys taste history on item **name**; promoting
that to an explicit normalized per-office key formalizes existing behavior and
survives re-imports. Cheap, transparent, no external entity resolution.

**Alternatives considered**:
- *Fuzzy/embedding-based dedup*: rejected for v1 — heavier, risk of wrongly
  merging distinct dishes. Documented as a known limitation: two genuinely
  different dishes sharing a normalized name within one office will merge; this is
  an accepted heuristic boundary, callable out in quickstart.
- *Manual admin item-mapping UI*: deferred — more product surface than warranted
  now.

## Decision 6: Item feature tagging at import (persisted; AI gap-fill optional)

**Decision**: At menu import, tag each item via the curated keyword taxonomy
(reuse `mealFeatures.extractFeatures`), persist the tags with provenance
(`keyword`), and — only for items the taxonomy leaves untagged and only when an
AI provider is configured — request tags from the AI provider (reuse
`mealRecommendationAi` boundary, Azure or generic), persist with provenance
(`ai`). Import never blocks on AI; untagged items are recorded as such.

**Rationale**: Raises coverage toward SC-003 (≥85%) cheaply; keeps deterministic
offline path working; reuses 002's privacy-safe provider boundary (only item
name/description text sent — no identifiers). Persisting means the recommender
reads tags instead of recomputing every request, with live extraction as fallback
for legacy untagged items.

**Alternatives considered**: Recompute-on-read only (rejected — caps coverage at
the keyword list, wastes work); mandatory AI tagging (rejected — breaks the
offline/no-key guarantee).

## Decision 7: Training cadence & model storage

**Decision**: Train the shared FM as a batch job triggered by (a) an admin action
and (b) an optional schedule; persist each trained model as a versioned row
(serialized parameters JSON + feature index + training metadata). The serving
layer loads the active model version into memory; if none/active load fails, it
falls back to the deterministic baseline.

**Rationale**: "Batch-trained safe model" from clarification Q1; keeps request
latency flat; versioning enables eval-before-enable and instant revert (just
point the office back to baseline). JSON-in-DB avoids a model file store.

**Alternatives considered**: Online/incremental training of the safe model
(rejected — clarified as batch; online behavior belongs to the explore policy);
filesystem model artifacts (rejected — DB row is simpler for a single-package app
and works across containers).

## Decision 8: Offline evaluation harness

**Decision**: Replay persisted recommendation impressions joined with subsequent
orders as ground truth: for each historical recommendation, compute whether the
ordered item was in the top 3 of (a) the baseline ranking and (b) the candidate
model's ranking, over a held-out time split, aggregated per office. Store a
`ModelEvaluationResult` row. The per-office enable action is blocked unless the
model's top-3 hit rate exceeds the baseline's by ≥5 percentage points (SC-001 /
FR-011).

**Rationale**: Uses already-persisted impressions (no new ground-truth capture);
top-3 hit rate is the clarified metric; held-out split avoids training-on-test;
per-office gate matches the shared-model-but-per-office-rollout decision.

**Alternatives considered**: Live A/B test (rejected for v1 — needs traffic and
time the offline replay avoids; the conservative gate is offline-first); NDCG/MRR
(kept internally as secondary diagnostics but not the gate, per clarification Q2).

## Dependency spike: FM libraries (`@wlearn/xlearn`)

**Decision**: Keep the default implementation as an in-repo TypeScript FM for
v1, but record `@wlearn/xlearn` as a viable optional spike/fallback dependency
if the hand-rolled implementation becomes too costly or underperforms.

**Findings**:
- `@wlearn/xlearn` 0.2.0 exposes xLearn v0.44 compiled to WebAssembly for Node
  and browser use, with LR/FM/FFM classifiers/regressors.
- It supports dense and CSR sparse inputs, `predictProba`, model save/load as a
  `Uint8Array`, and Apache-2.0 licensing.
- A local Windows/Node smoke test passed: install, CommonJS import, FM create,
  fit, `predictProba`, save/load, and `dispose`.
- It requires explicit `.dispose()` because WASM memory is not garbage collected.
- It does **not** support `sampleWeight`, which conflicts with the planned
  confidence-weighted examples from Decision 2 unless we oversample examples or
  accept weaker weighting.

**Rationale for not adopting by default**:
- Our current FM is small sparse-vector math; owning it keeps behavior,
  serialization, confidence weights, deterministic seeding, and explainability
  fully under test in the repo.
- A new WASM dependency adds memory lifecycle, binary artifact, CommonJS interop,
  and package supply-chain surface. That is acceptable only if it materially
  reduces implementation risk or improves model quality.
- The app's current data scale is tiny; xLearn's main advantage is high-scale
  sparse training, which we do not need yet.

**When to revisit**:
- Hand-rolled FM training fails to beat the deterministic baseline despite sane
  features.
- Training/evaluation becomes slow enough that a WASM backend matters.
- We decide confidence weights can be implemented by oversampling or by changing
  the learning target.

## Decision 9: Privacy & office scoping

**Decision**: Match feature 002 exactly. AI tagging payloads contain only item
name/description text. The shared FM pools only non-identifying features (flavor
tags, office id, opaque per-user factor index) — never names, emails, actor keys,
notes, or remarks. Requests resolve office via the existing
`resolveOfficeLocationIdFromCookie` rules; eval and enable/disable are admin-only.

**Rationale**: Privacy parity is a hard requirement (FR-014); reuses proven
office-resolution and the existing admin authz.

**Alternatives considered**: None — non-negotiable constraint.

## Resolved deferrals from spec

- Explore-policy specifics → Decision 3 (Thompson over Beta-Bernoulli feature
  counts; epsilon-greedy fallback).
- Stable item-identity rule → Decision 5 (normalized name per office, documented
  merge limitation).
- Algorithm choice (FM vs bandit) → Decisions 1 + 3 (FM predictor for safe,
  Thompson wrap for explore — one predictor, two policies).

No open NEEDS CLARIFICATION remain.
