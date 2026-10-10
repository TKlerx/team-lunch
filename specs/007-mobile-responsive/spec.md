# Feature: Mobile-friendly Team Lunch

**Branch**: `codex/007-mobile-responsive` | **Date**: 2026-10-09
**Intake**: BACKLOG-011 | [Issue #67](https://github.com/TKlerx/team-lunch/issues/67)

## User Story 1 — Use the app on a phone

As a lunch participant or administrator, I can navigate and operate the existing app on a narrow screen without content or controls being clipped.

### Acceptance scenarios

1. At 320px and 375px widths, sign-in, navigation, dashboard, menus, shopping, settings and administration remain reachable without page-level horizontal scrolling.
2. Many past lunches do not consume the whole phone viewport; history remains available and the current lunch stays reachable.
3. Long account names, restaurant links, meal names and comments wrap or truncate accessibly rather than widen the page.
4. Active polling, meal selection, ordering, delivery and completed summaries retain usable controls on phones.
5. A tall dialog fits the viewport, scrolls internally and allows keyboard focus and the final action to be reached.
6. Desktop navigation and the visible history rail retain their existing behavior; 768px and desktop layouts are verified.

## Requirements

- FR-001: Use the current viewport height, including mobile browser chrome changes.
- FR-002: Provide a compact mobile history disclosure and keep the desktop history list visible.
- FR-003: Bound shared dialogs to the viewport and allow internal scrolling.
- FR-004: Contain long content in shared controls and phase-specific summaries.
- FR-005: Keep primary navigation, account menus and touch controls operable, with visible focus and accessible names.
- FR-006: Add browser regressions for overflow, disclosure, dialogs, long content and desktop behavior.

## Scope and success

Existing routes and visual style; CSS and native controls, no redesign, new dependencies, API or persistence changes. Browser checks must establish actual geometry and interaction rather than only asserting CSS classes. Supported widths: 320, 375, 768 and 1280 pixels.

## Edge cases

Empty history, long history, long unbroken text, short landscape viewport, dialog keyboard focus, account menu alignment, and long completed-order feedback.
