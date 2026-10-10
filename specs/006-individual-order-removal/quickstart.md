# Validation

1. Run `pnpm exec vitest run --project client tests/client/FoodSelectionActiveView.test.tsx`.
2. Add two instances of a dish with different notes, remove one in Your added meals, check both browsers retain the other.
3. Withdraw all items: only own entries disappear.
4. Failed request: toast, retained entries, retry enabled.
5. Run `pwsh -File ./validate.ps1 all` and `full`; record actual evidence in tasks.md.
