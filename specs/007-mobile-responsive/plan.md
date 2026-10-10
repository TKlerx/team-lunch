# Plan: Mobile-friendly Team Lunch

## Technical context

React 19, TypeScript, Vite 8 and Tailwind 3; existing native controls, shared Modal and authenticated Playwright harness. No dependencies, schema, API or service changes.

## Constitution check

One vertical implementation task with tests and all/full gates. Reuse shared controls; CSS handles viewport and long-text constraints, native disclosure handles mobile history. Keep desktop behavior. No exceptions required.

## Implementation

The responsive PR is stacked on `codex/006-individual-order-removal` so the shared security patch and Spec Kit continuation state integrate in order.

1. Use dynamic viewport height in App and bound mobile history in OrdersRail, with a native disclosure and desktop-visible list.
2. Constrain shared Modal height and overflow; bound account text/menu and office select; improve shared icon touch targets.
3. Wrap long contact and phase-summary content, stacking crowded feedback rows on phones.
4. Extend Playwright with real local-auth login, deterministic read fixtures, viewport geometry assertions and interactions across routes/phases. No production mutations.

## Validation

Focused client regressions and responsive browser tests, then `validate.ps1 all` and `full` against dedicated disposable schemas. Record actual evidence in tasks/quickstart before committing and opening a PR closing #67.

## Complexity tracking

No new abstraction, dependency, or authorization bypass. Existing route API fixtures isolate layout from changing lunch state.
