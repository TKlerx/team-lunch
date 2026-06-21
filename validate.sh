#!/usr/bin/env bash
set -euo pipefail

phase="${1:-all}"

if command -v pwsh >/dev/null 2>&1; then
  exec pwsh -NoProfile -ExecutionPolicy Bypass -File ./validate.ps1 "$phase"
fi

if command -v powershell.exe >/dev/null 2>&1; then
  exec powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./validate.ps1 "$phase"
fi

if command -v powershell >/dev/null 2>&1; then
  exec powershell -NoProfile -ExecutionPolicy Bypass -File ./validate.ps1 "$phase"
fi

echo "PowerShell 7 (pwsh) or Windows PowerShell is required to run validate.ps1." >&2
exit 127
