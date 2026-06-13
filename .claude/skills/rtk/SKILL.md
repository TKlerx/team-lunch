---
name: rtk
description: Token-optimized CLI proxy for shell commands. Use when running shell commands in this project so commands are prefixed with rtk and PowerShell cmdlets are invoked through pwsh.
---

# RTK - Rust Token Killer

**Usage**: Token-optimized CLI proxy for shell commands.

## Rule

Always prefix shell commands with `rtk`.

Examples:

```bash
rtk git status
rtk cargo test
rtk npm run build
rtk pytest -q
```

## Windows PowerShell

RTK resolves external programs from PATH. PowerShell cmdlets/builtins are not
PATH executables, so run them through `pwsh -Command`.

```powershell
rtk pwsh -NoProfile -Command "Get-Content IMPLEMENTATION_PLAN.md"
rtk pwsh -NoProfile -Command "Test-Path graphify-out\graph.json"
rtk pwsh -NoProfile -Command "Get-ChildItem specs | Select-Object -ExpandProperty Name"
rtk pwsh -NoProfile -Command "rg -n 'displayName|actor_key' src tests prisma"
```

PowerShell scripts must be launched with `pwsh -File`; running the `.ps1`
directly through RTK can fail on Windows with `%1 is not a valid Win32
application`.

```powershell
rtk pwsh -NoProfile -File ./validate.ps1
rtk pwsh -NoProfile -File ./validate.ps1 full
rtk pwsh -NoProfile -File ./validate.ps1 test
```

External executables can still run directly:

```powershell
rtk git status --short
rtk git add AGENTS.md IMPLEMENTATION_PLAN.md
rtk git commit -m "test: reconcile display name identity validation"
rtk graphify query "How does display name identity work?"
rtk graphify update .
rtk pnpm lint
rtk pnpm test
rtk pnpm exec vitest run --project server tests/server/food-selection-routes.test.ts
```

Use `rtk proxy` when you want raw command output with little/no RTK filtering:

```powershell
rtk proxy git diff --stat
rtk proxy git show --stat --oneline --no-renames HEAD
```

Avoid:

```powershell
rtk Get-Content AGENTS.md      # PowerShell cmdlet, not PATH executable
rtk Test-Path graphify-out     # PowerShell cmdlet, not PATH executable
rtk ./validate.ps1             # Script file is not a Win32 executable
```

## Meta Commands

```bash
rtk gain            # Token savings analytics
rtk gain --history  # Recent command savings history
rtk proxy <cmd>     # Run raw command without filtering
```

## Verification

```bash
rtk --version
rtk gain
which rtk
```

On Windows:

```powershell
rtk --version
rtk gain
rtk pwsh -NoProfile -Command "where.exe rtk"
```
