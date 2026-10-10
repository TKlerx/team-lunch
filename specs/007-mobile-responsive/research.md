# Research

- App uses `h-screen` and a stacked, unbounded OrdersRail on phones. Use `h-dvh` and native mobile disclosure; desktop history remains visible.
- A Chromium probe at 320×568 with thirty history entries reproduced a 431px history rail and a zero-height route content pane on dashboard, menus, shopping, settings and administration. Empty-history pages alone did not reveal the bug.
- Shared Modal locks body scrolling but lacks a height limit. Fix the shared dialog rather than each consumer.
- Header allows wrapping but unbounded nickname and right-aligned popup can leave a narrow viewport. Constrain the account control and align its popup to the mobile edge.
- The same probe with a long account name measured its button extending to x=854px in a 320px viewport; the shell's hidden overflow masks this from document-width assertions. Check control bounding boxes as well.
- Ordering contacts and completed-order summaries contain long text in rigid rows. Use wrapping/stacking at those boundaries.
- Existing active meal selection already has mobile stacking and visible item-remove actions. Retain these and test all phases with long content.
- Existing Playwright smoke harness logs in normally against a dedicated DB. Reuse it and fixture only application reads for deterministic geometry checks.

Source investigation was delegated to a read-only research agent as required by the plan skill; no implementation was delegated.
