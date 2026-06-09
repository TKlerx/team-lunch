# Spec: App Shell & Navigation

## Topic of Concern
The overall structure of the web app: layout, routing, global state machine, and how users move between the distinct phases and views.

## Technology
- **Frontend**: React 18 + TypeScript, built with Vite
- **Routing**: React Router v6 (minimal routes; most app state is driven by server state rather than URL)
- **Styling**: Tailwind CSS
- **State management**: React Context + SSE-driven state hydration (no Redux/Zustand needed given the small surface)

---

## Layout Structure

```text
+---------------------------------------------+
| Header: App name | Manage Menus | Nickname |
+---------------------------------------------+
| Orders Rail           | Main Content Area   |
| (left, full height    | (phase/detail view) |
| between header/footer)|                     |
+---------------------------------------------+
```

- **Header** is always visible and contains:
  - App title: "Team Lunch"
  - Navigation link to "Manage Menus"
  - Current user's nickname (clickable to open rename dialog)
- **Orders rail** is always visible on the left side of the page content area and does not overlap the header.
- **Main content area** renders a phase view or a selected history detail view.

### Orders Rail

- Located on the left-hand side and vertically spans the page content area between header and footer.
- First item is a visually distinct **Start new Team Lunch** action.
- Triggering **Start new Team Lunch** returns the app flow to **Phase 1** (`POLL_IDLE`).
- Remaining items show completed order history in reverse chronological order (most recent first).
- Each history item displays:
  - Menu name
  - Completion date/time
- Clicking a history item opens that historical order detail in the main content area.

---

## App State Machine

The app has one global phase at a time, determined by server state:

```text
NICKNAME_PROMPT
      -> (nickname set)
NO_MENUS  <--------------------------------------------+
      -> (menu + item created)                         |
POLL_IDLE                                              |
      -> (poll started)                                |
POLL_ACTIVE                                            |
      -> (timer expires, winner found) ---> POLL_TIED |
      -> (winner resolved)                             | (extended back to POLL_ACTIVE)
POLL_FINISHED                                          |
      -> (food selection started)                      |
FOOD_SELECTION_ACTIVE                                  |
      -> (timer expires) ---> FOOD_SELECTION_OVERTIME  |
      -> (confirmed or extended)                       | (extended back to FOOD_SELECTION_ACTIVE)
FOOD_ORDERING                                          |
      -> (ordering claimed / order placed)             |
FOOD_DELIVERY_ACTIVE                                   |
      -> (timer expires) ---> FOOD_DELIVERY_DUE        |
      -> (ETA update / arrival confirm)                | (ETA update back to FOOD_DELIVERY_ACTIVE)
FOOD_SELECTION_COMPLETED                               |
      +----------------------------------------------->+
         (cycle restarts at POLL_IDLE)
```

---

## Phase Views

### NICKNAME_PROMPT
- Rendered as a full-screen modal or overlay on top of the app shell.
- Blocks all other interaction.
- Disappears once a valid nickname is stored in localStorage.

### NO_MENUS
- Shown when: no menus exist OR all menus have zero items.
- Centered empty-state card with message and "Create Menu" CTA.
- Clicking "Create Menu" navigates to the Manage Menus view.

### POLL_IDLE
- Shown when: menus with items exist, no poll is active, last phase was completed (or this is the first run).
- Displays:
  - A dashboard-style home view for the idle state.
  - A primary "Start a Poll" card with description input and duration picker.
  - A quick action for menu management, including menu import.
  - Insight cards derived from recent history, including:
    - meals waiting for your rating
    - most popular menus
    - most popular meals
    - recently used menus
    - team lunch history preview
    - quick stats (last winner, average rating, most ordered item across menus)

### POLL_ACTIVE
- Full-page poll view with:
  - Poll description and remaining time (circular countdown ring + text).
  - Live vote histogram.
  - Voting panel: list of menus with toggle buttons to cast or withdraw votes.
  - "I'll sit this one out" option to collapse the voting panel without voting.

### POLL_TIED
- Displayed after timer expires with a tie.
- Shows tied menus and their vote counts.
- Offers two actions: "Extend voting" (duration picker: 5/10/15/30 min) or "Pick randomly".

### POLL_FINISHED
- Shows winning menu name (and "chosen randomly" label if applicable).
- Shows final vote counts.
- "Start Food Selection" CTA with duration picker (10/15/30 min).

### FOOD_SELECTION_ACTIVE
- The main meal-selection view:
  - Subtle countdown in the header or top bar area (small text timer or thin progress bar - must not obstruct).
  - **Order form** (left / primary): item list from winning menu, notes text field, submit, update, or withdraw button.
  - **Order board** (right / secondary): live list of nickname, item, and notes for all placed orders.

### FOOD_SELECTION_OVERTIME
- Order form is disabled because the timer expired.
- Prompt shown: "Time's up! Extend or confirm the order?"
- Actions: duration picker (5/10/15 min) or "Confirm - we're done".

### FOOD_ORDERING
- Winning menu is fixed, but meal collection remains open until someone explicitly claims the ordering responsibility.
- Users who skipped the poll may still add their meal here before the order is claimed.
- Existing meal lines may still be adjusted or withdrawn while ordering is still unclaimed.
- The view should clearly distinguish:
  - still collecting meals
  - ordering responsibility not yet claimed
- Admins or the food-selection creator may still adjust the remaining collection window while ordering is unclaimed.
- Once someone claims ordering, meal-selection controls become read-only and the flow proceeds toward delivery tracking.

### FOOD_SELECTION_COMPLETED
- Final order summary list (nickname, item, notes).
- Shows completion date and time.
- Includes ETA input (`HH:mm`) with explicit confirmation for ETA updates.
- Heading supports both contexts:
  - current completion (immediate post-phase confirmation)
  - historical completion (when opened from Orders rail history)
- Idle or default navigation returns to `POLL_IDLE`; completed summaries remain accessible from history.

---

## Manage Menus View (`/menus`)

- Accessible at all times from the header link.
- Does not interrupt an active poll or food selection - users can still see the active phase indicators in the header but will navigate away from the main view.
- Lists all menus with their items.
- Inline CRUD for menus and items (no separate pages needed).

---

## Routing

| Path | View |
|------|------|
| `/` | Main content area (phase-driven view above) |
| `/menus` | Manage Menus view |

No other routes are required. Deep linking into a specific poll or order is out of scope.

---

## Responsive Design
- Primary target: desktop browser (office use).
- Minimum supported viewport: 768px wide.
- Mobile-friendly is a nice-to-have but not required.

## Out of Scope
- Dark mode.
- Localization / i18n.
- Offline support / PWA.
- Browser back/forward navigation for phase transitions.
