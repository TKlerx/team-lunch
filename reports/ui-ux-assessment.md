# UI/UX Assessment — Team Lunch

*Date: 2026-07-07 · Scope: client UI (`src/client/`) — app shell, header, dashboard, poll flow, orders rail, theme system, `ui/` primitives.*

## What's already good

Worth protecting in any refactor:

- Semantic token system (`bg-surface`, `text-fg-muted`, CSS vars with documented WCAG-AA choices in `src/client/index.css`).
- Dark mode applied before first paint (`index.html` inline script).
- Icon buttons carry `aria-label`s.
- Phase-driven `MainView` switch is a clean mental model.

The flaws below are mostly **inconsistent application** of these foundations, not missing foundations.

## Usability flaws

1. **Native `window.confirm` for destructive actions** — 10 occurrences across 5 files (`PollActiveView.tsx:312`, `FoodDeliveryView`, etc.), while `ManageMenus.tsx:91` already has a themed `ConfirmDialog`. Native confirms are unstyled, blocking, and say nothing about consequences ("Confirm completion?").
2. **No feedback system for async results** — 67 `setError(...)` call sites render inline strings; zero toasts, zero `aria-live`/`role="alert"` anywhere. Success is silent, errors appear wherever the local component renders them and are missed if the user scrolled away. Screen readers hear nothing.
3. **Modal lacks focus management** (`ui/Modal.tsx`) — no focus trap, no initial focus, no focus return, background scroll not locked. `ConfirmDialog` in ManageMenus is worse: hand-rolled overlay without `role="dialog"` or Escape handling, duplicating Modal.
4. **Timer-adjust dropdown is a wall of 24 buttons** (`PollActiveView.tsx:418`) plus a free-text input (`type="text"`) for "manual minutes" — no validation feedback, `parseInt` of garbage silently fails. The poll duration `<select>` has **144 options** (5 min – 12 h in 5-min steps).
5. **Cryptic status language** — the rail shows `2/3 · 04:32` with no legend for the three phases; "Kill poll (admin)" is aggressive jargon; "I'll sit this one out" as the *collapse* label reads like an action with consequences (it just hides the panel).
6. **Mobile layout** — `App.tsx` is `h-screen overflow-hidden` with the OrdersRail stacked *above* the main content on small screens; the history list competes with the live poll for a slice of a non-scrollable viewport.
7. **Misleading affordances** — Quick Stats cards in `PollIdleView.tsx:68` are non-interactive `<div>`s with `hover:bg-surface` hover states; conversely, history rows are buttons that look like static cards.
8. **First-poll start is buried** — "Start new Team Lunch" lives in the rail as a colored slab; when a process is ongoing the *same button* silently changes meaning to "navigate to it". One control, two behaviors, styled as a status banner.

## Visual / aesthetic flaws

9. **Border-radius chaos** — `rounded`, `rounded-lg`, `rounded-xl`, `rounded-2xl`, and `rounded-[28px]` all coexist, sometimes in one view (PollIdleView).
10. **Inverted text hierarchy in Quick Stats** — labels are `text-fg` (strong) and values are `text-fg-muted` (dim): the data is de-emphasized and the caption shouts.
11. **`ui/` primitives exist but aren't used** — `Button.tsx` has 6 variants with proper focus rings and disabled states, yet nearly every view hand-rolls `className="rounded border px-4 py-2 …"` buttons (most missing `focus-visible` rings). Same for Card/Panel/Input. Root cause of #9/#10.
12. **Section-title styles differ everywhere** — `uppercase tracking-wide`, `tracking-[0.18em]`, `tracking-[0.25em]`, plain `font-semibold` — no type scale.
13. **Watermark collage** — two stacked 20%-opacity images (cuisine art + company logo) behind *all* main content (`App.tsx:250-271`) reduce text contrast on every screen and read as visual noise rather than branding.
14. **Default-Tailwind-blue identity** — accent is stock `blue-600`; combined with the pizza logo + emoji (⏰) accents, the app has no cohesive personality.
15. **Google Fonts loads Material Symbols for a single icon** (`person_heart` in `index.html`) while everything else is hand-drawn inline SVG — an external render-blocking request for one glyph.

## Improvement plan — ordered by effort

All paths below are relative to `src/client/` unless noted. Line numbers are as of 2026-07-07 (commit `d7c24d8`); use the quoted identifiers/greps if lines have drifted.

### Quick wins (≤ ½ day each)

- [x] **T1** ✅ *(2026-07-07)* Swap Quick Stats hierarchy: label `text-fg-muted text-xs`, value `text-fg`; remove hover styles from non-interactive divs.
  *Where:* `components/PollIdleView.tsx`, `DashboardStats` component (lines ~52–92). The three stat tiles (lines 68–89) each have a label `<p className="text-xs … text-fg">` and value `<p className="… text-fg-muted">` — swap the color classes. Also remove `hover:bg-surface` from those tile `<div>`s (they are not clickable).
  *Done:* swapped label→`text-fg-muted`, value→`text-fg`, and removed `hover:bg-surface` on all three tiles.
- [x] **T2** ✅ *(2026-07-07)* Wording + phase legibility.
  *Where:*
  - "Kill poll (admin)" → "Cancel poll": `components/PollActiveView.tsx:412` (button inside the `TimerActionHeader` menu). A sibling exists in `FoodDeliveryView.tsx` / `FoodSelectionActiveView.tsx` ("Abort food selection?" confirms) — align wording there too.
  - "I'll sit this one out" → "Hide voting panel": `PollActiveView.tsx:132` (collapse button in `VotingPanel`).
  - Phase badge "2/3" → "Step 2/3 · Ordering": labels originate in the `inProgressDetails` memo in `App.tsx:130–171` (`phaseLabel: '1/3'` etc.) and render in `components/OrdersRail.tsx:53–69` (`inProgressPhaseLabel`). Extend `phaseLabel` with a name, or add a `phaseName` field.
  *Done:* "Cancel poll" applied in **both** `PollActiveView.tsx` and `PollTiedView.tsx` (same jargon). "Hide voting panel" applied. `phaseLabel`s → "Step 1/3 · Poll" / "Step 2/3 · Ordering" / "Step 3/3 · Delivery". **Gotcha fixed:** `OrdersRail.tsx:40` derived `isPhase3Due` from the exact string `=== '3/3'`; loosened to `?.includes('3/3')` so wording can change freely. Tests updated (PollActiveView, PollTiedView); `App.test` `1/3`/`2/3` assertions still pass (substring). **Left for T7:** the poll abort *confirm* dialog still reads "Kill this poll?" / "Yes, kill" — belongs with the ConfirmDialog rework, not a bare wording swap.
- [x] **T3** ✅ *(2026-07-07)* Manual-minutes input → `type="number" min=1 max=720` with inline validation; replace the 24-button preset list with the number input + 3–4 presets (5/15/30/60).
  *Where:* `components/PollActiveView.tsx`. The preset wall is `timerOptions` (line 369, `Array.from({length: 24}…)`) rendered as buttons at lines 418–435; the free-text input is lines 437–457 (`manualRemainingMinutes`, `type="text"`, bare `Number.parseInt` on Enter). All inside the `TimerActionHeader` children render-prop. `components/MinutesActionDropdown.tsx` looks like a related/duplicate control — check whether it should be the shared home for this.
  *Done:* `timerOptions` → `[5, 15, 30, 60]`. Manual input → `type="number" min=1 max=720`, with a JS bounds check on Enter (`1 ≤ n ≤ 720`, integer) that shows an inline `role="alert"` error + `aria-invalid` and blocks the API call — previously `NaN`/garbage went straight to `updatePollTimer`. **Verdict on `MinutesActionDropdown`:** *not* the shared home here — it ships its own trigger button + open/close state + outside-click handler, so nesting it inside `TimerActionHeader`'s render-prop menu would double the dropdown chrome. Improved the inline control in place instead. Added a test for the reject-out-of-range path.
- [x] **T4** ✅ *(2026-07-07)* Poll duration select → ~10 presets (5, 10, 15, 30, 45 min, 1 h, 2 h, 4 h, 8 h, 12 h) instead of 144 options.
  *Where:* `components/PollIdleView.tsx:18` — `const POLL_DURATIONS = Array.from({ length: (720 - 5) / 5 + 1 }, …)` consumed by the `<select id="poll-duration">` in `PollStartForm` (lines ~456–468). `FOOD_DURATIONS` (line 19) is already a short list — leave it.
  *Done:* `POLL_DURATIONS` → `[5, 10, 15, 30, 45, 60, 120, 240, 480, 720]`; `formatDuration` already renders 60/120/… as `1h`/`2h`/…. `PollStartForm` default (`5`) stays in-list. `FOOD_DURATIONS` untouched.
- [x] **T5** ✅ *(2026-07-07)* Drop the Material Symbols Google Fonts request; inline the one glyph as SVG.
  *Where:* the `<link rel="preconnect">`s + font stylesheet are `index.html:11–16` (repo root). The sole consumer is `components/FoodSelectionActiveView.tsx:208–211` (`className="material-symbols-outlined"` rendering `person_heart`). Replace with an inline SVG following the `iconBaseProps` pattern in `components/Header.tsx:22–30`, then delete the `.material-symbols-outlined` rule in `index.css:86–104`.
  *Done:* removed the 2 preconnect links + font stylesheet from `index.html`, inlined a heart SVG (24×24, `currentColor`, `h-5 w-5`) in `FoodSelectionActiveView.tsx`, deleted the `.material-symbols-outlined` rule from `index.css`. No render-blocking external request remains (verified via `grep` + production build). **Note:** used a plain **heart**, not person+heart — the icon is `aria-hidden` next to a "Ingredient Preferences" text label, so the "person" glyph carried no meaning; heart reads as "likes/preferences" and is one path.
- [x] **T6** ✅ *(2026-07-07)* Tone the watermark down to ~6–8% opacity, or render it only on empty/idle states.
  *Where:* `App.tsx:250–271` — the `pointer-events-none absolute` block layering `cuisineAroundTheWorldImage` and `exampleCompanyLogoImage`, both `opacity-20` (imports at `App.tsx:32–33`). For "idle only", gate it on the `phase` value already available from `useAppPhase()` (line 98).
  *Done:* both images `opacity-20` → `opacity-[0.08]`. Chose the tone-down over idle-only gating — the latter adds `phase` branching for a marginal gain, and the images stay in the DOM either way. Idle-only remains a follow-up if text contrast is still a complaint.

### Small (½–1 day each)

- [x] **T7** ✅ *(2026-07-07)* Extract `ConfirmDialog` into `components/ui/` built on `ui/Modal.tsx` (gets Escape + `role="dialog"` for free), with title / consequence-text / destructive-variant props; replace all `window.confirm` calls.
  *Donor:* the hand-rolled `ConfirmDialog` in `pages/ManageMenus.tsx:91–130` (delete it after extraction).
  *Call sites to replace (10):
  - `components/PollActiveView.tsx:312, 327`
  - `components/FoodDeliveryView.tsx:453, 470`
  - `components/FoodSelectionActiveView.tsx:159, 1324, 1358`
  - `components/FoodSelectionOrderingView.tsx:280, 302`
  - `pages/Administration.tsx:718`
  Note the call sites are `async` handlers that branch on the boolean — the component API either needs a promise-based `confirm()` helper or each site converts to open-state + `onConfirm` callback.
  *Done:* added `components/ui/ConfirmDialog.tsx` with shared `ConfirmDialog` + promise-based `useConfirmDialog()` helper. Deleted the donor dialog from `ManageMenus.tsx` and replaced all listed `window.confirm` call sites with modal confirmations while preserving boolean async handler flow. Updated impacted client tests to confirm/cancel through the dialog.
- [x] **T8** ✅ *(2026-07-07)* Define the type + radius scale once (`rounded-lg` controls, `rounded-2xl` cards, one section-title style), then sweep.
  *Known offenders:* `PollIdleView.tsx:549` (`rounded-[28px]` hero), `PollIdleView.tsx:44` (`tracking-[0.18em]` card titles), `PollIdleView.tsx:550` (`tracking-[0.25em]` eyebrow), `OrdersRail.tsx:76` (`tracking-wide`).
  *Sweep greps:* `rounded-\[`, `tracking-\[`, and compare `rounded(-lg|-xl|-2xl)?\b` counts per file. Put the canonical section-title style into `ui/Section.tsx` (already exists) and use it.
  *Done:* `Button`/`Input`/`Select` now default to `rounded-lg`; `Card` defaults to `rounded-2xl`; `ui/Section.tsx` exports `sectionTitleClass`. Replaced the arbitrary `rounded-[28px]`, `tracking-[0.18em]`, `tracking-[0.25em]`, and `OrdersRail` `tracking-wide` offenders.
- [x] **T9** ✅ *(2026-07-07)* Adopt the existing `ui/` primitives (`Button`, `Input`, `Select`, `Card`) in the main views instead of hand-rolled `className` buttons.
  *Primitives:* `components/ui/Button.tsx` (6 variants, focus ring, disabled states), `Input.tsx`, `Select.tsx`, `Card.tsx`, `FormField.tsx`.
  *Biggest wins by hand-rolled-button density:* `PollIdleView.tsx` (form submits, quick actions), `PollActiveView.tsx` (vote buttons, withdraw, menu items), `OrdersRail.tsx` (top action, history rows), then `FoodSelectionActiveView.tsx` / `FoodDeliveryView.tsx`. Vote-toggle buttons with selected-state styling may need a `Button` variant or stay bespoke — don't force it.
  *Done:* converted the main lunch-flow views and shared controls to use the shared primitives where applicable: `PollIdleView.tsx`, `OrdersRail.tsx`, `PollActiveView.tsx`, `PollTiedView.tsx`, `FoodSelectionActiveView.tsx`, `FoodSelectionOrderingView.tsx`, `FoodSelectionOvertimeView.tsx`, `FoodSelectionCompletedView.tsx`, `FoodDeliveryView.tsx`, `Header.tsx`, `TimerActionHeader.tsx`, `MinutesActionDropdown.tsx`, `MealOnboardingDialog.tsx`, and `FoodSelectionAbortControl.tsx`. Native checkboxes remain native; there is no checkbox primitive and adding one just for T9 would be extra scope.
- [x] **T10** ✅ *(2026-07-07)* Add focus trap + initial focus + focus restore + body scroll lock to `ui/Modal.tsx`.
  *Where:* extend the existing `useEffect` at `Modal.tsx:29–36` (currently Escape-only). Trap = keydown Tab handler cycling `dialog.querySelectorAll` focusables; restore = capture `document.activeElement` on open. Scroll lock = `document.body.style.overflow = 'hidden'` with cleanup. ~30 lines, no library. All Modal consumers (`DatabaseConnectionModal`, `MealOnboardingDialog`, T7's ConfirmDialog) inherit the fix.
  *Done:* `Modal` now captures/restores focus, moves initial focus into the dialog, traps Tab/Shift+Tab across focusable children, preserves Escape close behavior, locks body scrolling while open, and restores the previous body overflow on cleanup.

### Medium (1–3 days each)

- [ ] **T11** Toast/announcement system: one `ToastProvider` + portal + `aria-live="polite"` region; route async success/failure through it, keep inline errors only for field-level validation.
  *Mount point:* wrap in `main.tsx` next to the existing `AppContext`/`ThemeContext` providers (follow `context/ThemeContext.tsx` as the pattern; expose a `useToast()` hook).
  *Call sites to migrate:* grep `setError((err as Error).message)` — 67 hits across 9 files, heaviest: `pages/ManageMenus.tsx` (29), `PollIdleView.tsx` (7), `PollActiveView.tsx` (6), `FoodSelectionActiveView.tsx` (6), `FoodSelectionOvertimeView.tsx` (6). Migrate incrementally — action-level errors (vote failed, abort failed) become toasts; form-validation errors ("Description is required") stay inline.
- [ ] **T12** Mobile pass: collapse the OrdersRail to a bottom sheet or "Past lunches (N)" disclosure below `md`, keeping the live-status pill visible.
  *Where the layout splits:* `App.tsx:215` (`<main className="flex min-h-0 flex-1 flex-col md:flex-row">`) and `OrdersRail.tsx:46` (`<aside className="… w-full … md:w-80 …">`). The problem: below `md` the rail stacks above the routed content inside a `h-screen overflow-hidden` shell (`App.tsx:201`), so history steals viewport from the live poll. Native `<details>` around the history list is the lazy version. Verify every `AppPhase` view at 375 px.
- [ ] **T13** Visible 3-step progress stepper (Poll → Selection → Delivery) on all in-flow views, replacing the bare `1/3` fraction.
  *Where:* phase state comes from `hooks/useAppPhase.ts` (`AppPhase` union in `src/lib/types.ts`); the fraction labels live in the `inProgressDetails` memo (`App.tsx:130–171`). Add a small `ui/Stepper` (or extend `components/TimerActionHeader.tsx`, which every in-flow view already renders as its header) and derive the active step from `phase`. Supersedes the T2 badge tweak — do T2 first anyway, it's minutes.
- [ ] **T14** Separate "Start new Team Lunch" (primary CTA) from "View lunch in progress" (status link) — two controls, one meaning each.
  *Where:* the dual-behavior button is `OrdersRail.tsx:35–74` (`topActionLabel` / `topActionClass` switch on `hasOngoingLunchProcess`) with the branching handler passed from `App.tsx:225–247` (`onStartNewTeamLunch` navigates to poll/selection when one is ongoing, else dispatches `START_NEW_TEAM_LUNCH`). Split into: a status banner (link) rendered when `hasOngoingLunchProcess`, and a start CTA that also gets a home on the idle dashboard (`PollIdleView` already contains `PollStartForm` — the rail CTA can simply navigate/scroll there).

### Large (1 week+, only when the above is done)

- [ ] **T15** Visual identity pass: food-warm accent replacing stock blue-600, display font for headings, consistent empty-state illustrations.
  *Where:* all accent tokens are `index.css:16–78` (`--color-accent*` in `:root` and `.dark`) exposed via `tailwind.config.ts` — swapping the palette is ~30 lines with no component changes. Fonts: add to `tailwind.config.ts` `theme.extend.fontFamily` + a self-hosted `@font-face` in `index.css` (avoid reintroducing the Google Fonts request removed in T5). Keep the documented AA contrast pairs (see comments in `index.css:38–47`) when choosing shades.
- [ ] **T16** Split the monoliths into subcomponents: `pages/Administration.tsx` (1890 lines), `pages/ManageMenus.tsx` (1560), `components/FoodSelectionActiveView.tsx` (1494). Each already contains named inner components (e.g. `ConfirmDialog`, `VotingPanel`-style sections) that can move to sibling files verbatim. Not user-visible, but it's why styling drift keeps happening; do it opportunistically as T8/T9 touch those files.
- [ ] **T17** History rail upgrades: group by month, filter by menu, ratings inline.
  *Where:* the flat list render is `OrdersRail.tsx:88–113` (`history.map`); data is `completedFoodSelectionsHistory` from `context/AppContext.tsx` — grouping/filtering is client-side over data already loaded. Rating helpers to reuse: `utils/dashboard.ts` (`getAverageMealRating` etc.).

### Suggested sequence

T1–T6 in one afternoon sweep → T7+T10 (dialog correctness) → T11 (feedback) → T8/T9 (consistency) → T12/T13 (mobile + stepper) → the rest as appetite allows.

**Laziest high-impact path:** T7 + T11 + T9 — everything they need already exists in `ui/` and the token system; it's adoption work, not new design. Skip T15 until users complain about looks; skip T17 until someone asks for it.
