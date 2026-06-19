# Feature Specification: AI Meal Recommendations

**Feature Branch**: `002-ai-meal-recommendations`

**Created**: 2026-06-15

**Status**: Planned

**Backlog Link**: `BACKLOG-001`


**Input**: User description: "Recommend meals using AI based on your previous ratings."

## Clarifications

### Session 2026-06-15

- Q: What should the first implementation slice use for recommendation generation? -> A: AI-assisted ranking/explanations on request when configured, with a normal deterministic recommender and graceful fallback when AI is unavailable.
- Q: What personal data may the AI assistance receive when generating the optional explanation? -> A: Food-signal history may include item/menu names, ratings, timestamps, and preferences, but must exclude feedback remarks, names, emails, and other direct identifiers.
- Q: Should recommendation feedback be collected only for AI-assisted recommendations, or for all recommendations? -> A: No separate recommendation feedback; use order choice and post-meal rating as the feedback signal.
- Q: When should the app show the recommendation affordance during food selection? -> A: Show a small "Recommend a meal" action and generate recommendations only when clicked.
- Q: Should recommendation results be persisted, or computed on demand each time? -> A: Persist full displayed recommendation responses, including ranks, reasons, explanations, deterministic/AI source, and timestamp, for audit and debugging.

## User Scenarios & Testing

### User Story 1 - See Personal Meal Recommendations (Priority: P1)

When a food selection is active, a user can click a small "Recommend a meal"
action to request ranked meal suggestions for the winning menu based on their
previous orders, ratings, saved defaults, and ingredient preferences.

**Why this priority**: The core value is helping each user choose faster without
forcing them to remember what they liked before.

**Independent Test**: Seed a user with historical rated orders and preferences,
start a food selection for a menu with matching and non-matching items, then
verify the recommendation endpoint returns personalized ranked results.

**Acceptance Scenarios**:

1. **Given** a signed-in user has rated previous meals, **When** they click
   "Recommend a meal" during an active food selection, **Then** they see
   recommended items from the current menu before or alongside the full item
   list.
2. **Given** a user has disliked ingredients or allergen preferences, **When**
   recommendations are generated, **Then** risky or disliked items are demoted
   or flagged rather than promoted.
3. **Given** a user has no usable history, **When** recommendations are generated,
   **Then** the system falls back to transparent non-personal signals such as
   popular or highly rated items for that office.

### User Story 2 - Understand Why a Meal Was Suggested (Priority: P1)

A user can see a concise reason for each recommendation, such as similar meals
they rated well, saved defaults, office-level popularity, or an AI-generated
explanation when AI assistance is configured.

**Acceptance Scenarios**:

1. **Given** an item is recommended from personal history, **When** it is shown,
   **Then** the explanation references the signal category without exposing
   private raw history to other users.
2. **Given** an item is recommended from office-level popularity, **When** it is
   shown, **Then** the explanation states that it is based on team trend data.
3. **Given** AI assistance is configured, **When** the user requests an AI
   explanation, **Then** the system may enrich the normal recommendation with a
   concise generated reason.

### User Story 3 - Improve Recommendations from Meal Outcomes (Priority: P2)

After a user orders a recommended item and later rates the meal, the system uses
that order choice and post-meal rating as the recommendation feedback signal.

**Acceptance Scenarios**:

1. **Given** a recommendation is shown, **When** the user orders that item,
   **Then** the system can treat the order as an implicit positive selection
   signal.
2. **Given** a user later gives that ordered item a low meal rating, **When**
   future recommendations are generated, **Then** the system can treat the
   recommendation outcome as poor without asking for separate feedback.

### User Story 4 - Protect Privacy and Control AI Usage (Priority: P1)

Admins can configure whether AI recommendations are enabled, and users' personal
signals are scoped to the signed-in user and office.

**Acceptance Scenarios**:

1. **Given** AI assistance is disabled, unavailable, or not configured, **When**
   a user requests recommendations, **Then** the app still works and returns the
   normal deterministic recommender result.
2. **Given** a recommendation request is made, **When** data is prepared for an
   AI provider, **Then** the payload may include item/menu names, ratings,
   timestamps, and preferences, but excludes feedback remarks, names, emails,
   and other direct identifiers.
3. **Given** multiple offices exist, **When** recommendations are generated,
   **Then** office-scoped signals are not mixed across offices.

### Edge Cases

- No historical ratings exist for the user.
- Historical ratings point at deleted menu items; item/menu snapshots remain usable.
- A current menu has only items that conflict with disliked ingredients.
- AI provider is unavailable, times out, or returns malformed output.
- A user changes preferences after recommendations were already generated.
- A recommendation is for an item that becomes unavailable before ordering.
- Historical feedback remarks may contain sensitive or identifying text and must
  not be sent to an AI provider.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST produce per-user recommendations for items on the
  current winning menu during food selection when the user requests them.
- **FR-001a**: The user interface MUST expose recommendations through a small
  "Recommend a meal" action and MUST NOT generate recommendations automatically
  on food-selection load.
- **FR-002**: Normal recommendation input signals MUST include historical orders,
  numeric ratings, saved default meals, and ingredient preferences when
  available.
- **FR-003**: The system MUST use order choice and post-meal rating as the
  recommendation feedback signal instead of collecting a separate helpful/not
  helpful response.
- **FR-004**: The system MUST return a concise explanation for each suggested
  item, using deterministic signal labels by default and AI-generated wording
  only when AI assistance is configured and requested.
- **FR-005**: The system MUST fall back gracefully when the AI provider is not
  configured or unavailable.
- **FR-006**: The system MUST keep recommendations office-scoped.
- **FR-007**: The system MUST use the signed auth session as the user identity
  for recommendations and feedback.
- **FR-008**: The system MUST avoid sending unnecessary personal identifiers to
  external AI providers.
- **FR-009**: Recommendation APIs MUST reject unauthenticated requests.
- **FR-010**: Recommendation output MUST never auto-place an order; the user
  remains in control of the final meal choice.
- **FR-011**: AI assistance MUST be an optional enhancement to the normal
  recommender, not a required dependency for recommendation availability.
- **FR-012**: AI assistance payloads MUST NOT include user names, email addresses,
  feedback remarks, or other direct identifiers; allowed food signals are
  item/menu names, ratings, timestamps, and preferences.
- **FR-013**: The system MUST persist the displayed recommendation response,
  including item ranks, reasons, explanations, deterministic/AI source, and
  timestamp, so recommendation outcomes can be audited against later orders and
  ratings.

### Key Entities

- **Recommendation Signal**: Derived historical input such as ordered item,
  menu/item snapshot, rating, saved default, ingredient preference, recency, and
  office.
- **AI Assistance Payload**: Privacy-minimized food signal summary sent only on
  request, including menu/item names, ratings, timestamps, and preferences while
  excluding feedback remarks and direct user identifiers.
- **Meal Recommendation**: A ranked suggestion for a current menu item with score,
  reason, source signal categories, AI-assisted flag, and generated timestamp.
- **Recommendation Outcome**: Implicit feedback derived from whether the user
  ordered a recommended item and how they rated that meal afterward.
- **Recommendation Impression**: Persisted record of the recommendation response
  shown to the user, including food selection, recommended item IDs, rank,
  displayed reason/explanation text, deterministic/AI source, and timestamp.

### Realtime / SSE Events

- No new SSE event is required for the first slice. Recommendations can be fetched
  on demand for the current user and menu.

### Data / Migration Impact

- A persisted recommendation-impression model is expected.
- A separate persisted recommendation-feedback model is not expected for the
  first slice; existing orders and ratings should carry outcome learning.
- Displayed recommendation responses, including reasons/explanations, should be
  retained for audit/debugging; disallowed AI payload inputs such as remarks,
  names, and emails must still be excluded.
- Both PostgreSQL and SQLite Prisma schemas must stay aligned.
- `tests/server/helpers/db.ts` cleanup must be extended for new persisted models.

### Scope Flags

- Multi-office aware: yes - signals and recommendations are office-scoped.
- Auth scope: signed approved users only.
- Email notification involved (Microsoft Graph): no.
- AI provider involved: yes - provider must be optional, user-requested, and fail
  closed to deterministic fallback behavior.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A user with prior rated orders receives ranked recommendations for
  an active food selection in an automated server test.
- **SC-002**: Users with no history still receive a stable fallback response
  rather than an error.
- **SC-003**: Tests prove a recommended item that is ordered and then rated low
  affects future recommendation ranking without separate feedback capture.
- **SC-004**: Provider failure does not block food selection, order placement, or
  normal deterministic recommendations.
- **SC-005**: Office-scoping tests prove recommendations do not use another
  office's order/rating history.
- **SC-006**: Provider-bound payload tests prove names, emails, and feedback
  remarks are excluded from AI assistance requests.
- **SC-007**: Tests prove the displayed recommendation response is persisted with
  ranks, reasons/explanations, source, and timestamp.

## Assumptions

- Historical poll and food-selection records are retained indefinitely for
  analytics/recommender use.
- Per-order ratings and optional feedback remarks already exist.
- Ingredient preferences and saved default meals already exist.
- The first implementation slice may use a deterministic ranking baseline before
  adding an external AI provider, as long as the API contract can support AI
  explanations later.
