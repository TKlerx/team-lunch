# Feature Specification: Learned Meal Recommender

**Feature Branch**: `003-learned-meal-recommender`

**Created**: 2026-06-16

**Status**: Draft

**Input**: User description: "Learned meal recommender (BACKLOG-002): a per-user meal recommendation model that learns feature importance instead of using hand-tuned weights, as the successor to the existing deterministic content-based scorer. Model in feature space (ingredient/style tags), not item space, because menus can be re-imported or differ per office. Candidate techniques: factorization machine and/or contextual bandit. Feature representation: explainable ingredient/style tags from a curated taxonomy plus optional AI tagging at menu import, with keyword extraction as the offline fallback. Keep the deterministic scorer as the always-available baseline and graceful fallback. Use both explicit ratings and implicit feedback. Prerequisites: persisted/AI-tagged item features at import, stable item identity across menu re-imports, and an offline hit-rate evaluation harness so any learned model must prove it beats the baseline before rollout. Privacy and office-scoping must match the existing recommendation feature. Links back to BACKLOG-002."

## Context

This feature is the successor to [002-ai-meal-recommendations](../002-ai-meal-recommendations/spec.md)
(backlog `BACKLOG-001`). That feature shipped a deterministic content-based
scorer with hand-tuned signal weights, a per-user taste profile over
ingredient/style features, explicit + implicit feedback, and persisted
recommendation impressions. This feature (`BACKLOG-002`) replaces the
hand-tuned weighting with a model that **learns** how much each flavor feature
matters per person, while keeping the deterministic scorer as the
always-available baseline and fallback. It is explicitly bounded so a learned
model is never switched on for real users until it is measured to beat that
baseline.

The feature offers two distinct, complementary recommendation modes:
- **Safe** ("Recommend a meal") — a batch-trained model that always serves its
  best-matched ranking; this is the path gated against the deterministic
  baseline before rollout.
- **Explore** ("Explore something new") — an opt-in path that intentionally
  surfaces novel/uncertain items to learn and broaden the user's experience;
  because the user explicitly asks to explore, it is not held to the
  beat-the-baseline gate.

## Clarifications

### Session 2026-06-16

- Q: Allow users to highlight meals they expect to like even without ordering? → A: Yes — an always-available "anticipated like/dislike" mark on any current-menu dish, feeding flavor-feature preferences as an explicit pre-taste signal (lower confidence than a real rating, superseded by one). Onboarding is a special case of this for new users.
- Q: When does the safe learned path serve a user vs the baseline, and how to handle new-user cold start? → A: Optional onboarding active learning — a new/low-history user marks liked dishes from existing menus to seed their profile immediately; if skipped, fall back to baseline until ≥4 orders or ≥2 ratings. The onboarding list covers a varied spread of flavors and is skippable.
- Q: Model/personalization scope across offices? → A: Single shared model with office as a feature (pools non-identifying flavor signal across offices, still per-user/office-scoped recommendations); per-office evaluation and enablement retained; no personal identifiers pooled.
- Q: Safe-path rollout gate — which metric and margin? → A: Top-3 hit rate (ordered item appears in shown top 3), must exceed the baseline by ≥5 percentage points on held-out history before an office may enable it.
- Q: Learning approach & exploration behavior — one model or both? → A: Both — a "safe" batch-trained model (exploit) for the default recommendation plus an opt-in "explore" path (exploration/bandit) as a separate user action; only the safe path is gated against the baseline. Framed as one predictor (e.g., FM) with two exploration policies: low-temperature + diversity/recency for safe, high-exploration (e.g., Thompson sampling / novelty-first) for explore. The safe path must still avoid degenerate repetition.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recommendations get more personal the more I participate (Priority: P1)

A team member orders and occasionally rates lunches over several weeks. Without
ever tuning anything, their "Recommend a meal" suggestions become noticeably
better matched to the flavors and styles they actually choose - distinguishing,
for example, that they like Thai and chicken dishes but avoid fish - even for
menu items they have never ordered before.

**Why this priority**: This is the core value of the feature - moving from
fixed, hand-tuned rules to recommendations that adapt to each person. Without
it, nothing else matters.

**Independent Test**: Seed a user's order/rating history with a consistent
flavor pattern, request recommendations, and verify never-ordered items that
share the preferred flavors rank above unrelated items, and that the ranking
reflects learned preference strength rather than fixed weights.

**Acceptance Scenarios**:

1. **Given** a user with a consistent flavor preference in their history, **When** they request a recommendation, **Then** current-menu items matching that preference are ranked highest even if never ordered before.
2. **Given** two users with opposite flavor preferences and identical menus, **When** each requests recommendations, **Then** they receive meaningfully different rankings.
3. **Given** a user with too little history for the model to be confident, **When** they request a recommendation, **Then** the system falls back to the deterministic baseline without error.

---

### User Story 1b - I can deliberately explore something new (Priority: P2)

Alongside the default "safe" recommendation, a user can opt into an "Explore
something new" action that intentionally surfaces dishes outside their usual
flavors or that the system is uncertain about - to broaden their lunches and to
help the system learn. The user knows this is exploratory, and the result is
clearly labelled as such rather than presented as the safest match.

**Why this priority**: Exploration both improves the user's experience (variety,
discovery) and feeds the system the diverse signal a pure exploit loop never
generates. It is opt-in and distinct from the safe path, so it is not gated by
the beat-the-baseline requirement - but it is a secondary action on top of the
core safe recommendation.

**Independent Test**: Trigger the explore action for a user with an established
flavor profile and verify the surfaced items are deliberately different from the
safe ranking (novel flavors or higher-uncertainty items), clearly labelled as
exploratory, and that the outcome is captured to inform future learning.

**Acceptance Scenarios**:

1. **Given** a user with an established flavor profile, **When** they choose "Explore something new", **Then** the system surfaces items that differ from their safe recommendation (novel flavors or higher-uncertainty items) and labels them as exploratory.
2. **Given** the explore action is used, **When** the user orders (or does not order) the explored item, **Then** that outcome is captured as learning signal.
3. **Given** a user with little or no history, **When** they choose to explore, **Then** the system still returns varied current-menu options without error.

---

### User Story 1c - Tell the system what I like, anytime (Priority: P2)

Any user can mark dishes they think they'll like (or dislike) on existing menus
at any time, even for dishes they have never ordered. New users are additionally
offered this as an optional onboarding step so personalized recommendations work
from their first lunch instead of after weeks of ordering. These "anticipated
like" marks seed flavor-feature preferences as an explicit, pre-taste signal -
lower confidence than a real post-meal rating, and superseded by one once the
dish is actually ordered and rated. Marking is always optional; a new user who
skips onboarding falls back to the baseline until enough real orders accumulate.

**Why this priority**: This attacks the user cold-start the shared model alone
cannot solve and gives users a cheap, always-available way to steer their own
recommendations without having to order first. High payoff for low effort;
secondary to the core learned ranking but a material UX improvement.

**Independent Test**: Mark several never-ordered dishes as liked, then request a
recommendation and verify results reflect those marked flavors; then order and
rate one of them differently and verify the real rating overrides the mark.

**Acceptance Scenarios**:

1. **Given** any user, **When** they mark never-ordered dishes as liked, **Then** their next recommendation reflects those flavor preferences.
2. **Given** a new user with no order history, **When** they complete onboarding marking, **Then** recommendations are personalized without waiting for real orders; **When** they skip it, **Then** recommendations fall back to the baseline with no error.
3. **Given** a dish a user marked as liked, **When** they later order and rate it, **Then** the actual rating supersedes the pre-taste mark as the stronger signal.
4. **Given** the system suggests dishes to mark during onboarding, **When** it builds that list, **Then** it offers a spread covering varied flavor features, not near-duplicates.

---

### User Story 2 - I can still see why a meal was suggested (Priority: P1)

Every recommendation continues to show a short, human-readable reason referring
to flavors or signals the user understands ("matches flavors you tend to like:
thai, chicken"), even though a learned model now drives the ranking.

**Why this priority**: Explainability was a core, valued property of the
previous feature. A learned model must not turn recommendations into an opaque
score. This constraint shapes the entire modeling approach (feature-based, not
black-box embeddings as the sole representation).

**Independent Test**: Request recommendations driven by the learned model and
verify each item carries a concise reason naming the contributing flavor
features, with no raw model internals exposed.

**Acceptance Scenarios**:

1. **Given** the learned model is active, **When** a recommendation is shown, **Then** each item has a human-readable reason naming the flavor features that drove it.
2. **Given** an item recommended mainly by features the user dislikes is shown lower, **When** the user views it, **Then** the reason communicates that without exposing numeric model parameters.

---

### User Story 3 - Menu items are richly tagged automatically (Priority: P2)

When a menu is imported or updated, its items are automatically tagged with
ingredient and style features so the recommender has good coverage. A curated
keyword taxonomy tags items offline at no cost; optional AI tagging fills gaps
for items the keywords miss. Tags are reviewable.

**Why this priority**: Model quality is capped by feature coverage. The previous
keyword-only approach left many items untagged. This raises coverage across the
varied, multilingual menus different offices use, but it depends on US1's
modeling being in place to be valuable.

**Independent Test**: Import a menu containing items the keyword taxonomy cannot
tag, and verify those items receive features (via the optional AI tagging path
when configured) or are clearly flagged as untagged when it is not.

**Acceptance Scenarios**:

1. **Given** a menu item whose name/description contains known flavor terms, **When** the menu is imported, **Then** the item is tagged with the matching ingredient/style features.
2. **Given** an item the keyword taxonomy cannot tag and AI tagging is configured, **When** the menu is imported, **Then** the item still receives features.
3. **Given** AI tagging is not configured, **When** an untaggable item is imported, **Then** import still succeeds and the item is recorded as untagged without blocking recommendations.

---

### User Story 4 - The team can prove the new model is actually better (Priority: P2)

Before the learned model is shown to real users, an evaluation compares it
against the deterministic baseline on historical data: did the model rank the
item people actually ordered higher than the baseline did? The learned model is
only enabled for an office once it demonstrably beats the baseline; an
administrator controls the switch and can revert at any time.

**Why this priority**: A learned model that is not measured can silently be
worse than simple rules. This guardrail makes "is it good?" answerable and
prevents regressions, but it is a safety/quality layer on top of US1.

**Independent Test**: Run the evaluation over a fixed historical dataset and
verify it reports a comparable hit-rate metric for both the baseline and the
learned model, and that the learned model cannot be enabled for an office unless
its metric exceeds the baseline's.

**Acceptance Scenarios**:

1. **Given** historical recommendation and order data, **When** the evaluation runs, **Then** it reports a hit-rate (and/or mean ordered-item rank) for both the baseline and the learned model.
2. **Given** the learned model does not beat the baseline for an office, **When** an administrator attempts to enable it there, **Then** the system prevents activation and explains why.
3. **Given** the learned model is enabled and later underperforms, **When** an administrator disables it, **Then** recommendations immediately revert to the deterministic baseline.

---

### User Story 5 - Personalization survives menu changes and works per office (Priority: P3)

A user's learned preferences keep working when a menu is re-imported, renamed,
or replaced, and when different offices run different menus. Because preferences
are learned over flavors rather than specific dish records, a renamed or
brand-new dish that shares known flavors is still personalized correctly.

**Why this priority**: Robustness to menu churn is what makes the feature-space
approach worthwhile, and it matters most for offices that change menus often.
It builds on the modeling and tagging already established.

**Independent Test**: Re-import a menu so item records change identity, then
verify a returning user's recommendations still reflect their learned flavor
preferences.

**Acceptance Scenarios**:

1. **Given** a user with learned preferences, **When** the menu is re-imported and items get new records, **Then** the user's recommendations still reflect those preferences.
2. **Given** two offices with different menus, **When** users in each request recommendations, **Then** each user's personalization is scoped to their own office context and history.

---

### Edge Cases

- A user has plenty of orders but no ratings → implicit feedback alone must still drive learning.
- A menu item has no recognizable flavor features at all → it is neither boosted nor unfairly buried; the baseline handles it.
- A brand-new office or user has no history → cold-start uses the deterministic baseline (existing popularity fallback), unless the user completes onboarding preference elicitation, which seeds their profile immediately.
- A new user completes onboarding but the menus are tiny / lack flavor variety → present the best available spread and still allow skipping; fall back to baseline if marks are too few to be informative.
- A user marks a dish as liked, then orders and rates it low → the actual rating supersedes the pre-taste mark; the system must not let the stale mark inflate that dish.
- A marked dish leaves the menu or is re-imported with a new record → the mark's flavor signal persists via features/stable identity; a dangling item reference must not error.
- A user with rating history on other menus sees a freshly imported menu → items are personalized immediately via feature transfer (no per-menu cold start); only flavors the user has never seen anywhere fall back.
- The optional AI tagging service is unavailable, slow, or misconfigured at import → import succeeds, items remain keyword-tagged or untagged, no blocking.
- The learned model artifact is missing, stale, or fails to load at request time → recommendations fall back to the deterministic baseline within the normal latency budget.
- Two dishes share a name across re-imports but are genuinely different → stable item identity must avoid silently merging unrelated history (documented limitation/heuristic).
- Sparse data for a small office → the system must avoid overconfident personalization and degrade gracefully toward the baseline.
- A user has one strongly-rated favorite that recurs on the menu → the safe path must not recommend that identical dish every single time (apply diversity/recency), while still respecting the strong preference.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST learn each user's flavor-feature preferences from their own order and rating history, replacing fixed hand-tuned feature weights with learned importance.
- **FR-002**: System MUST score current-menu items for a user using learned preferences over ingredient/style features, including items the user has never ordered.
- **FR-003**: System MUST use both explicit ratings and implicit feedback (ordering an item) as learning signal.
- **FR-004**: System MUST retain the deterministic content-based scorer as an always-available baseline and use it automatically whenever the learned model is unavailable, not yet proven, or lacks sufficient data for a user. "Sufficient data" for a user means at least 4 orders or 2 ratings (mirroring the existing taste-profile gate), OR the user has provided anticipated-like marks / completed onboarding (FR-025, FR-027).
- **FR-005**: System MUST present a concise, human-readable reason for every recommended item that references flavor features, without exposing raw model parameters.
- **FR-006**: System MUST tag menu items with ingredient/style features at import time using a curated keyword taxonomy.
- **FR-007**: System MUST support optional AI-assisted tagging at import to fill gaps for items the keyword taxonomy cannot tag, and MUST succeed import without it when it is not configured or unavailable.
- **FR-008**: System MUST persist item features so they are computed once at import rather than recomputed on every recommendation, while keeping live keyword extraction as a fallback for items lacking stored features.
- **FR-009**: System MUST maintain a stable identity for menu items across re-imports and renames so a user's learned preferences are not reset by menu changes.
- **FR-010**: System MUST provide an offline evaluation that compares the safe learned path against the deterministic baseline on held-out historical data using top-3 hit rate (whether the actually-ordered item appears in the shown top 3).
- **FR-011**: System MUST prevent the safe learned path from being enabled for an office unless its top-3 hit rate exceeds the baseline's by at least 5 percentage points for that office.
- **FR-012**: System MUST let an administrator enable or disable the learned model per office, defaulting to off (baseline) until explicitly enabled.
- **FR-013**: System MUST keep all recommendation requests office-scoped and personal, matching the access and office-resolution rules of the existing recommendation feature.
- **FR-014**: System MUST exclude personal identifiers (names, emails, actor keys, order notes, feedback remarks) from any payload sent to an external AI tagging or recommendation service, matching the existing feature's privacy rules.
- **FR-015**: System MUST keep recommendation response time within the existing budget (no slower than the current deterministic path from the user's perspective), falling back to the baseline rather than blocking on the learned model.
- **FR-016**: System MUST continue to persist a record of each displayed recommendation (ranked items, reasons, source: safe-baseline / safe-learned / explore) for audit and ongoing evaluation.
- **FR-017**: System MUST provide an opt-in "explore" action, separate from the default safe recommendation, that intentionally surfaces novel or higher-uncertainty current-menu items rather than the safest match.
- **FR-018**: System MUST clearly label explore results as exploratory so users understand they are not the safest match.
- **FR-019**: System MUST capture the outcome of explored items (ordered or not) as learning signal, reusing the existing implicit/explicit feedback mechanisms.
- **FR-020**: System MUST NOT gate the explore action behind the beat-the-baseline requirement (it is opt-in exploration by design), while the default safe recommendation remains so gated.
- **FR-021**: System MUST keep the explore action within the same response-time budget and fall back to varied baseline options when the explore model is unavailable or the user has no history.
- **FR-022**: The safe recommendation MUST avoid degenerate repetition — it MUST NOT surface the identical top item every time for a user whose favorite recurs on the menu; a mild diversity/recency mechanism MUST introduce variety without turning the safe path into exploration.
- **FR-023**: System MUST personalize items on a newly imported or otherwise unseen menu using the user's flavor-feature preferences already learned from their history on other menus in the same office, without requiring prior orders on the new menu (feature transfer). Only flavor features the user has never encountered fall back to baseline/exploration.
- **FR-024**: System MUST train a single shared safe model across all offices, using office (and per-user context) as model features, so a small or new office benefits from flavor-preference structure learned elsewhere. Only non-identifying flavor features and office context may be pooled across offices — never names, emails, actor keys, notes, or remarks. Evaluation and the enable/disable gate remain per office.
- **FR-025**: System MUST let any user mark or unmark any current-menu dish as "anticipated like" (or dislike) at any time, including dishes never ordered; these marks MUST feed the user's flavor-feature preferences as explicit pre-taste signal.
- **FR-026**: System MUST treat an anticipated-like mark as lower confidence than a real post-meal rating, and MUST let an actual rating of the same dish supersede the mark.
- **FR-027**: System MUST additionally surface marking as an optional onboarding step for new/low-history users, presenting a spread of varied flavor features (informative selection) rather than near-duplicates; the step MUST be skippable without error.
- **FR-028**: System MUST let an administrator enable or disable the opt-in explore action per office, independently of the safe-path mode; explore defaults to enabled.

### Key Entities *(include if feature involves data)*

- **Item Feature Set**: the ingredient/style tags associated with a menu item, with provenance (keyword vs AI tagged); basis for all feature-space reasoning.
- **Stable Item Identity**: a durable key linking item records that represent the same dish across menu re-imports/renames, so history and learning persist.
- **User Preference Model**: a single shared learned model of flavor-feature importance conditioned on user and office context; pools non-identifying flavor signal across offices while producing per-user, office-scoped recommendations.
- **Model Evaluation Result**: a per-office comparison of learned model vs baseline on historical data (relevance metric, sample size, timestamp) used to gate rollout.
- **Recommendation Mode Setting**: per-office flag controlling whether the safe path is served by the learned model or the deterministic baseline. The opt-in explore action is available independently of this setting.
- **Explore Policy**: the mechanism (e.g., exploration/bandit policy) that selects novel/uncertain items for the explore action and updates from their outcomes; distinct from the safe ranking model.
- **Anticipated-Like Mark**: a dish a user marks as liked (or disliked) without having ordered it, available anytime and as optional onboarding; an explicit pre-taste signal of lower confidence than a real rating, which a later rating of the same dish supersedes.
- **Recommendation Impression**: the existing persisted snapshot of a displayed recommendation, extended to record whether the baseline or learned model produced it (reused from feature 002).

### Realtime / SSE Events *(include if feature changes shared state)*

- No new SSE events. Recommendations remain on-demand request/response (consistent with feature 002). Import-time tagging, evaluation runs, and the per-office mode setting are not real-time shared state requiring broadcast.

### Data / Migration Impact *(include if feature touches persisted data)*

- New/changed models or columns: persisted item features (with provenance), stable item-identity key, learned per-user preference model storage, per-office model-evaluation results, per-office recommendation-mode setting, per-user anticipated-like marks (item + like/dislike, with item-name snapshot); the existing recommendation-impression record gains a safe-baseline / safe-learned / explore source marker.
- Both Postgres and SQLite schemas updated: yes (dual schema must change together).
- Name-snapshot column needed alongside any FK: yes where new references to menu items/offices are added, following the existing snapshot convention so history survives source-row deletion.
- `tests/server/helpers/db.ts` cleanup extended for new persisted models: yes.

### Scope Flags *(Team Lunch optional surfaces)*

- Multi-office aware: yes — recommendations, learning, evaluation, and the enable/disable switch are all office-scoped.
- Auth scope: recommendation requests use the same approved-user scope as feature 002; the per-office enable/disable control and evaluation results are admin-only.
- Email notification involved (Microsoft Graph): no.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On held-out historical data, the safe learned path's top-3 hit rate (the actually-ordered item appears in the shown top 3) exceeds the deterministic baseline's by at least 5 percentage points for an office before it may be enabled there.
- **SC-002**: 100% of displayed recommendations show a human-readable reason naming the contributing flavor features.
- **SC-003**: At least 85% of menu items across active menus carry at least one flavor feature after import (keyword + optional AI tagging combined).
- **SC-004**: 100% of recommendation requests return results within the existing latency budget, falling back to the baseline rather than failing when the learned model is unavailable.
- **SC-005**: Zero personal identifiers are sent to any external AI tagging or recommendation service (verified by payload inspection).
- **SC-006**: After a menu re-import that changes item records, a returning user's top recommendations reflect their previously learned preferences in 100% of cases where the equivalent dishes still exist.
- **SC-007**: The deterministic baseline remains available and selectable for every office at all times, with no scenario in which recommendations are unavailable due to learned-model issues.
- **SC-008**: When a user opts into "explore", at least a defined majority of surfaced items differ from their current safe recommendation (novel flavors or higher-uncertainty items), and explore results are always labelled as exploratory.
- **SC-009**: A new user who completes onboarding by marking liked dishes receives recommendations personalized to those flavors on their first request, without any prior orders.

## Assumptions

- Two complementary mechanisms are in scope: a batch-trained "safe" ranking model (exploit, gated against the baseline) and an opt-in "explore" policy (exploration). The exact algorithms (e.g., factorization machine for safe, a bandit/exploration policy for explore) are implementation decisions for planning/research; this spec only requires the safe/explore split and that the safe path is *learned* and *evaluated against the baseline*.
- "Explore" is a deliberately separate user action, not background randomization injected into the safe ranking; the safe path stays predictable and stable while exploration is consented and labelled.
- This feature includes the three enablers (persisted/AI-tagged features at import, stable item identity, and the offline evaluation harness) as in-scope foundation, because the learned model cannot be validated or rolled out safely without them.
- Rollout is conservative and human-controlled: the learned model is off by default per office and an administrator enables it only after the evaluation shows improvement; automatic, unattended switching is out of scope for this version.
- Text embeddings, if used at all, are an optional additional feature source layered on top of explainable tags - not a replacement that would remove human-readable reasons; full embedding-based modeling is out of scope for this version.
- Personalization is per user and served office-scoped, but the underlying safe model is a single shared model conditioned on office + user context (pooling only non-identifying flavor features across offices); per-office evaluation and enablement still apply.
- Implicit and explicit feedback capture already exists (delivered in feature 002) and is reused as the learning signal.
- Stable item identity relies on a best-effort heuristic (e.g., normalized name within an office/menu); perfectly disambiguating genuinely different dishes that share a name is a known limitation, not a guarantee.
- Evaluation uses the already-persisted recommendation impressions plus subsequent orders/ratings as ground truth; no new user-facing feedback prompt is introduced.
