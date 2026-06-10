# Theming Migration Progress

Tracks the rollout of Light / Dark / System theme support across the client UI.

## Goal

Every UI surface respects the active theme (Light, Dark, or System-following) with
no hard-coded light-only colors left in components.

## Implementation approach

Theming is driven by **semantic CSS-variable tokens** plus **thin themed wrapper
components** — JSX should read as structure, with the theme classes bundled inside
small `ui/` primitives rather than repeated inline.

- **Tailwind**: `darkMode: 'class'` — the `dark` class is toggled on `<html>`.
- **Semantic tokens, not raw `dark:` variants.** Colors are CSS variables defined
  once in [`src/client/index.css`](src/client/index.css) under `:root` (light) and
  `.dark` (dark), exposed in [`tailwind.config.ts`](tailwind.config.ts) as
  `rgb(var(--color-x) / <alpha-value>)`. Components use `bg-surface`, `text-fg`,
  `border-border`, etc. — never `bg-white` / `dark:bg-gray-900`.
- **Thin primitives** in [`src/client/components/ui/`](src/client/components/ui/)
  bundle the token classes (e.g. `<Card>`, `<IconButton>`, `<Menu>`).
- **`cn()`** ([`src/client/lib/cn.ts`](src/client/lib/cn.ts), clsx + tailwind-merge)
  is used in every primitive so a caller's `className` override wins conflicts.
- **State**: [`ThemeContext.tsx`](src/client/context/ThemeContext.tsx) provider
  (`useTheme()` → `theme` / `resolvedTheme` / `setTheme`); persisted to
  `localStorage` (`team_lunch_theme`); a `matchMedia` listener keeps **System**
  in sync live. An inline **no-FOUC script** in [`index.html`](index.html) applies
  the saved theme before first paint (and must stay in sync with the provider).

### Token reference

| Token             | Light            | Dark             | Use                              |
| ----------------- | ---------------- | ---------------- | -------------------------------- |
| `surface`         | white            | gray-900         | page / card background           |
| `surface-muted`   | gray-100         | gray-800         | subtle fills, hover states       |
| `surface-raised`  | white            | gray-800         | popovers, dropdowns, modals      |
| `fg`              | gray-900         | gray-100         | primary text                     |
| `fg-muted`        | gray-600         | gray-400         | secondary text                   |
| `border`          | gray-200         | gray-700         | borders / dividers (`border-border`) |
| `accent`          | blue-600         | blue-400         | links, active nav, focus ring    |
| `accent-fg`       | blue-700         | blue-300         | text on soft accent              |
| `accent-soft`     | blue-100         | blue-900         | accent chip / badge backgrounds  |
| `accent-solid`    | blue-600         | blue-500         | filled (primary) buttons         |
| `accent-on`       | white            | white            | text on `accent-solid`           |

**Status families** — each has the shape `<status>` (border) · `<status>-soft`
(background) · `<status>-fg` (text), so a soft callout is
`border-<status> bg-<status>-soft text-<status>-fg`:

- `success` (emerald) — success callouts, selected history item
- `warning` (amber) — in-progress / caution states
- `danger` (red) — errors, destructive actions, alerts

Each status also has a `<status>-solid` + `<status>-on` pair for filled buttons /
badges (e.g. "Approve" / "Mark bought" / pending-approval count). Solid fills are
theme-independent (same in light and dark) since white text reads on them either way.

### Per-component migration checklist (how to migrate each)

1. Replace literal colors (`bg-white`, `text-gray-*`, `border-gray-*`, `bg-blue-*`)
   with the matching token.
2. Route shared chrome (cards, panels, inputs, buttons, modals) through a `ui/`
   primitive; create the primitive first if it doesn't exist.
3. Verify in both themes; check text/border contrast in dark.

---

## Tasks

### Phase 0 — Infrastructure ✅

- [x] Add `cn()` helper (clsx + tailwind-merge)
- [x] Tailwind `darkMode: 'class'` + semantic color tokens
- [x] CSS variables for light/dark in `index.css` + base `body` styles
- [x] No-FOUC inline script in `index.html`
- [x] `ThemeProvider` / `useTheme` context (light/dark/system + persistence + live system listener)
- [x] Wire `ThemeProvider` into `main.tsx`

### Phase 1 — Toolbar POC ✅

- [x] `ui/IconButton` primitive
- [x] `ui/Menu` primitives (`MenuList`, polymorphic `MenuItem`)
- [x] Icon-only `ThemeToggle` dropdown (Sun / Moon / Monitor)
- [x] Migrate `Header.tsx` to tokens + primitives

### Phase 2 — Shared primitives (build before broad migration) ✅

> Also extended the token set with **status families** (success / warning /
> danger) + `accent-solid` / `accent-on` so primitives have real variants and
> the shell's amber/emerald/red states theme correctly in dark mode.

- [x] `ui/Card` (surface + border + shadow container)
- [x] `ui/Panel` (muted inset block) + `ui/Section` (titled content block)
- [x] `ui/Button` (primary / secondary / ghost / danger / success / warning variants)
- [x] `ui/FormField` (label + control + help/error wrapper)
- [x] `ui/Input` (text input)
- [x] `ui/Textarea`
- [x] `ui/Select` (themed `<select>`; replaces the inline office picker styling)
- [x] `ui/Badge` (count / status pill — neutral / accent / danger / success / warning tones)
- [x] `ui/Modal` (overlay + raised surface, portal + Escape handling)
- [x] `ui/Divider`

### Phase 3 — App shell & layout ✅

- [x] `App.tsx` — main content background (`bg-white/95` → `bg-surface/95`)
- [x] `OrdersRail.tsx` — left history rail (status tokens for the action buttons + items)
- [x] `AuthGate.tsx` — auth / login screens (Card / Panel / Button / Input + tokens)
- [x] `index.css` — `delivery-due-alert-flicker` keyframe now drives off the danger tokens (adapts to light/dark)

### Phase 4 — Modals ✅

- [x] `NicknameModal.tsx` (rebuilt on `Modal` + `Input` + `Button`)
- [x] `DatabaseConnectionModal.tsx` (rebuilt on `Modal`)

> `Modal` now forwards `data-testid`; `useTheme` falls back to a default value
> when no `ThemeProvider` is present (matches the app's other contexts) so
> isolated component tests keep working.

### Phase 5 — Pages ✅

- [x] `pages/MainView.tsx` — no markup (phase switch only); nothing to theme
- [x] `pages/Settings.tsx` (Card / Section / Input / Select / Button)
- [x] `pages/ManageMenus.tsx` (token-swapped throughout: dialogs, item rows, import panel, default-meal editor, menu cards)
- [x] `pages/ShoppingList.tsx` (Card / Input / Button + status tokens; added solid `success`/`warning` fills)
- [x] `pages/Administration.tsx` (errors, inputs, and slate/rose/indigo/green/amber/emerald buttons mapped to tokens)

### Phase 6 — Lunch flow views ✅

Controls/helpers hand-migrated; the larger views were token-mapped mechanically
(emerald/sky/indigo → success/accent, etc.) then swept + tested. Solid action
buttons keep `text-white` (equal to the `*-on` token value, readable in both themes).

- [x] `PollIdleView.tsx` (dashboard cards, stat tiles, start forms)
- [x] `PollActiveView.tsx` (vote histogram, voting panel, timer menu)
- [x] `PollFinishedView.tsx`
- [x] `PollTiedView.tsx`
- [x] `FoodSelectionActiveView.tsx` (orders, recommended-action card, prefs)
- [x] `FoodSelectionOrderingView.tsx`
- [x] `FoodSelectionOrderBoard.tsx`
- [x] `FoodSelectionCompletedView.tsx`
- [x] `FoodSelectionOvertimeView.tsx`
- [x] `FoodSelectionAbortControl.tsx`
- [x] `FoodDeliveryView.tsx`
- [x] `NoMenusView.tsx`
- [x] `TimerActionHeader.tsx`
- [x] `MinutesActionDropdown.tsx`
- [x] `OrderCopyStatus.tsx`

### Phase 7 — Verification

- [ ] Full visual pass in Dark mode (every route/view)
- [ ] Confirm System mode follows OS preference live
- [ ] Contrast / a11y check on text, borders, focus rings in dark
- [ ] Update/extend tests where theme-dependent markup changed
