# Research: AI Meal Recommendations

## Decision: Deterministic recommender is the source of truth

**Rationale**: The feature must work even when AI is disabled, unavailable, or
slow. A deterministic service can be covered with stable unit tests and can use
existing persisted signals: orders, ratings, saved defaults, preferences,
office-level popularity, and recency.

**Alternatives considered**:

- AI-only ranking: rejected because recommendations would disappear when the
  provider is unavailable.
- Client-side ranking: rejected because it would expose more history than needed
  and duplicate business rules outside services.

## Decision: AI assistance enriches explanations only when requested/configured

**Rationale**: The user asked for AI as a "nice gimmick" and specifically wanted
the app to continue working without it. Keeping AI behind an explicit request
and server-side adapter lets the deterministic response remain usable while the
AI explanation can be skipped on timeout, malformed output, or missing config.

**Alternatives considered**:

- Auto-run AI on food-selection load: rejected because recommendations should be
  generated only after clicking "Recommend a meal".
- Persist provider prompts/responses as raw transcripts: rejected because the
  displayed response is the audit requirement; raw provider payloads increase
  privacy and storage risk.

## Decision: Provider payload is privacy-minimized food signal data

**Rationale**: Food preferences and ratings are still personal data when tied to
a user, so the AI payload must be de-identified. Allowed payload fields are
menu/item names, ratings, timestamps/recency, and preferences. Disallowed fields
include names, emails, feedback remarks, order notes, actor keys, and direct
identifiers. Feedback remarks and order notes are also excluded from the normal
recommender input set to avoid learning from sensitive free text.

**Alternatives considered**:

- Include feedback remarks: rejected because remarks may contain PII or sensitive
  free text.
- Current menu only: rejected because it would prevent personalized AI
  explanations.

## Decision: Persist recommendation impressions, not separate feedback

**Rationale**: The meaningful feedback signal is whether the user ordered a
recommended item and how they rated it afterward. Persisting the displayed
recommendation impression enables audit/debugging and later outcome analysis
without adding a second "helpful/not helpful" interaction.

**Alternatives considered**:

- Separate helpful/not helpful feedback: rejected because it adds UI friction and
  duplicates order/rating outcome signals.
- Compute-only recommendations: rejected because it cannot answer what was shown
  when debugging later ratings.

## Decision: No SSE event for recommendations

**Rationale**: Recommendations are user-specific, on-demand reads. Persisting an
impression does not alter shared lunch phase state and does not need to fan out
to other browsers.

**Alternatives considered**:

- Broadcast `recommendation_created`: rejected because it would expose
  user-specific recommendation activity and add no realtime coordination value.
