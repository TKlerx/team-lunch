# PR Stack Merge Plan

## Goal

Land the open PRs without repeatedly reviewing upstream changes or merging a
known-red required check.

## Order

1. Create a `main`-based dependency-audit PR that fixes the required production
   dependency audit without importing menu-tag or safety-label work.
2. Make that PR green, review it independently, and merge it first.
3. Rebase #28 onto the updated `main` and validate it.
4. Rebase #29 onto the latest #28 tip, then set its base to #28. This is
   required because #29 was forked before #28's latest review-fix commits.
5. Rebase #30 onto the rewritten #29, then set its base to #29.
6. Review and merge bottom-up: #28, then #29, then #30. Use merge commits for
   the dependent PRs to preserve their ancestry.
7. After each merge, retarget the next PR to `main`, verify its incremental
   diff, rerun required validation, and merge only when green.

## Dependency-audit PR scope

- Update only production dependencies, pnpm audit policy/overrides when a
  vulnerability cannot be safely upgraded, and compatibility tests needed by
  the chosen dependency versions.
- Do not copy commits from #29 or #30 wholesale: their parent-context changes
  would pull feature tests into this standalone fix.

## Exit criteria

- `pnpm audit --prod` passes under `validate.ps1 full`.
- Every stacked PR has a green required check and an incremental diff against
  its immediate parent.
- No dependent PR omits #28's post-review commits.
