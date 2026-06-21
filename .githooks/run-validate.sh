#!/usr/bin/env sh
set -eu

MODE="${1:-all}"

if command -v pwsh >/dev/null 2>&1; then
  exec pwsh -NoProfile -ExecutionPolicy Bypass -File ./validate.ps1 "$MODE"
fi

if command -v powershell >/dev/null 2>&1; then
  exec powershell -NoProfile -ExecutionPolicy Bypass -File ./validate.ps1 "$MODE"
fi

echo "PowerShell is required to run validate.ps1." >&2
exit 1
