#!/usr/bin/env powershell
<#
.SYNOPSIS
    Backpressure script - runs after each task to validate the build.

.DESCRIPTION
    Usage: ./validate.ps1 [phase]
    Phases:
      all        - typecheck + lint + duplication + semgrep + production audit + test + continuity freshness (default, pre-commit)
      full       - all quality checks + production audit + Playwright E2E tests (pre-push / before merge; skips continuity freshness)
      continuity - refresh CURRENT-WORK/RECONCILIATION and fail if that created uncommitted changes
      quick      - typecheck only (use during scaffolding before tests exist)
      test       - tests only
      e2e        - Playwright E2E tests only
      quality    - lint + duplication + semgrep
      commit     - validate all, then git add + commit + push
#>

param(
    [ValidateSet("all", "full", "continuity", "quick", "test", "e2e", "quality", "commit")]
    [string]$Phase = "all"
)

$ErrorActionPreference = "Stop"

if ($Host.UI -and $Host.UI.RawUI) {
    $Host.UI.RawUI.WindowTitle = "team-lunch validate"
}

function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Pass($msg) { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Fail($msg) { Write-Host "  [FAIL] $msg" -ForegroundColor Red }
function Write-Warn($msg) { Write-Host "  [SKIP] $msg" -ForegroundColor Yellow }

function Invoke-NativeCommand([string]$commandLine) {
    $stdoutPath = [System.IO.Path]::GetTempFileName()
    $stderrPath = [System.IO.Path]::GetTempFileName()

    try {
        if ($IsWindows -or $env:OS -eq "Windows_NT") {
            $fileName = "cmd.exe"
            $arguments = "/c $commandLine"
        } else {
            $fileName = "/bin/sh"
            $arguments = "-lc ""$commandLine"""
        }

        $process = Start-Process `
            -FilePath $fileName `
            -ArgumentList $arguments `
            -RedirectStandardOutput $stdoutPath `
            -RedirectStandardError $stderrPath `
            -Wait `
            -PassThru `
            -NoNewWindow

        return [pscustomobject]@{
            ExitCode = $process.ExitCode
            StdOut = [System.IO.File]::ReadAllText($stdoutPath)
            StdErr = [System.IO.File]::ReadAllText($stderrPath)
        }
    } finally {
        foreach ($path in @($stdoutPath, $stderrPath)) {
            if (Test-Path $path) {
                Remove-Item $path -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

function Get-CombinedOutput($result) {
    $stdout = if ($null -ne $result.StdOut) { $result.StdOut } else { '' }
    $stderr = if ($null -ne $result.StdErr) { $result.StdErr } else { '' }
    return ($stdout + "`n" + $stderr).Trim()
}

function Write-CommandLog($result) {
    foreach ($stream in @($result.StdOut, $result.StdErr)) {
        if (-not [string]::IsNullOrWhiteSpace($stream)) {
            Write-Host $stream.TrimEnd()
        }
    }
}

function Remove-Ansi([string]$text) {
    if (-not $text) {
        return $text
    }

    return [regex]::Replace($text, '\x1B\[[0-9;]*[A-Za-z]', '')
}

function Test-HasPlaywrightSpecs {
    $roots = @("e2e", "tests/e2e")
    $patterns = @("*.spec.ts", "*.spec.tsx", "*.e2e.ts", "*.e2e.tsx")

    foreach ($root in $roots) {
        if (-not (Test-Path $root)) {
            continue
        }

        foreach ($pattern in $patterns) {
            if (Get-ChildItem -Path $root -Recurse -File -Filter $pattern -ErrorAction SilentlyContinue | Select-Object -First 1) {
                return $true
            }
        }
    }

    return $false
}

function Get-TestSummary($result) {
    $output = Remove-Ansi (Get-CombinedOutput $result)
    $parts = @()

    $filesMatch = [regex]::Match($output, 'Test Files\s+(\d+)\s+passed')
    if ($filesMatch.Success) {
        $parts += "$($filesMatch.Groups[1].Value) files"
    }

    $testsMatch = [regex]::Match($output, 'Tests\s+(\d+)\s+passed')
    if ($testsMatch.Success) {
        $parts += "$($testsMatch.Groups[1].Value) tests"
    }

    $durationMatch = [regex]::Match($output, 'Duration\s+(.+)$', [System.Text.RegularExpressions.RegexOptions]::Multiline)
    if ($durationMatch.Success) {
        $parts += $durationMatch.Groups[1].Value.Trim()
    }

    if ($parts.Count -gt 0) {
        return "tests passed ($($parts -join ', '))"
    }

    return "tests passed"
}

function Get-DuplicationSummary($result) {
    $output = Remove-Ansi (Get-CombinedOutput $result)
    $threshold = ""

    if (Test-Path ".jscpd.json") {
        try {
            $threshold = ((Get-Content ".jscpd.json" -Raw | ConvertFrom-Json).threshold).ToString("0.##")
        } catch {
            $threshold = ""
        }
    }

    $match = [regex]::Match($output, 'Total:\s+\|\s+\d+\s+\|\s+\d+\s+\|\s+\d+\s+\|\s+\d+\s+\|\s+\d+\s+\(([\d.]+)%\)')
    if ($match.Success -and $threshold) {
        return "duplication check passed ($($match.Groups[1].Value)% <= $threshold%)"
    }

    return "duplication check passed"
}

function Get-SemgrepSummary($result) {
    $output = Remove-Ansi (Get-CombinedOutput $result)
    $match = [regex]::Match($output, '(\d+)\s+Code Findings')
    if ($match.Success) {
        return "semgrep passed ($($match.Groups[1].Value) findings)"
    }

    return "semgrep passed"
}

function Get-PlaywrightSummary($result) {
    $output = Remove-Ansi (Get-CombinedOutput $result)
    $match = [regex]::Match($output, '^\s*(\d+)\s+passed\s+\((.+)\)$', [System.Text.RegularExpressions.RegexOptions]::Multiline)
    if ($match.Success) {
        return "playwright tests passed ($($match.Groups[1].Value) passed ($($match.Groups[2].Value)))"
    }

    return "playwright tests passed"
}

function Get-NpmAuditSummary($result) {
    $output = Remove-Ansi (Get-CombinedOutput $result)
    $cleanOutput = $output.Trim()

    if ($cleanOutput -match 'found 0 vulnerabilities') {
        return "production npm audit passed (0 vulnerabilities)"
    }

    return "production npm audit passed"
}

function Invoke-ValidationStep(
    [string]$label,
    [string]$commandLine,
    [string]$failureKey,
    [string]$failureMessage,
    [scriptblock]$successMessageFactory
) {
    Write-Step $label
    try {
        $result = Invoke-NativeCommand $commandLine
        if ($result.ExitCode -ne 0) {
            Write-CommandLog $result
            throw $failureMessage
        }

        $successMessage = if ($null -ne $successMessageFactory) { & $successMessageFactory $result } else { $failureMessage -replace ' failed$', ' passed' }
        Write-Pass $successMessage
    } catch {
        Write-Fail $failureMessage
        $script:failures += $failureKey
    }
}

function Invoke-ContinuityValidation {
    Write-Step "Continuity snapshot (CURRENT-WORK / RECONCILIATION)"
    try {
        $result = Invoke-NativeCommand "npm run continuity:update"
        if ($result.ExitCode -ne 0) {
            Write-CommandLog $result
            throw "continuity updater failed"
        }

        $statusLines = @(git status --porcelain --untracked-files=all -- specs/CURRENT-WORK.md specs/RECONCILIATION.md)
        $blockingLines = @(
            $statusLines | Where-Object {
                $_ -match '^\?\?' -or ($_ -match '^..' -and $_.Substring(1, 1) -ne ' ')
            }
        )

        if ($blockingLines.Count -gt 0) {
            $blockingLines | ForEach-Object { Write-Host $_ }
            throw "continuity files changed"
        }

        Write-Pass "continuity files are current"
    } catch {
        Write-Fail "continuity files need review and commit"
        $script:failures += "continuity"
    }
}

$failures = @()

if ($Phase -in "all", "full", "quick", "commit") {
    Invoke-ValidationStep "Typecheck (tsc --noEmit)" "npm run typecheck" "typecheck" "typecheck failed" { "typecheck passed" }
}

if ($Phase -in "all", "full", "quality", "commit") {
    Invoke-ValidationStep "Lint (eslint)" "npm run lint" "lint" "lint failed" { "lint passed" }
}

if ($Phase -in "all", "full", "quality", "commit") {
    Invoke-ValidationStep "Duplication (jscpd)" "npm run duplication" "duplication" "duplication check failed" {
        param($result)
        Get-DuplicationSummary $result
    }
}

if ($Phase -in "all", "full", "quality", "commit") {
    Write-Step "Security scan (semgrep)"
    try {
        $env:PYTHONUTF8 = "1"
        $result = Invoke-NativeCommand "npm run semgrep"
        if ($result.ExitCode -ne 0) {
            Write-CommandLog $result
            throw "semgrep failed"
        }

        Write-Pass (Get-SemgrepSummary $result)
    } catch {
        Write-Fail "semgrep failed"
        $failures += "semgrep"
    }
}

if ($Phase -in "all", "full", "quality", "commit") {
    Invoke-ValidationStep "Dependency audit (npm audit --omit=dev)" "npm audit --omit=dev" "npm-audit" "production dependency audit failed" {
        param($result)
        Get-NpmAuditSummary $result
    }
}

if ($Phase -in "all", "full", "test", "commit") {
    Invoke-ValidationStep "Tests (vitest)" "npm test" "tests" "tests failed" {
        param($result)
        Get-TestSummary $result
    }
}

if ($Phase -in "all", "continuity", "commit") {
    Invoke-ContinuityValidation
}

if ($Phase -in "full", "e2e") {
    Write-Step "End-to-end tests (Playwright)"
    if (-not (Test-HasPlaywrightSpecs)) {
        Write-Warn "playwright skipped (no e2e spec files found)"
    } else {
        try {
            $result = Invoke-NativeCommand "npm run test:e2e"
            if ($result.ExitCode -ne 0) {
                Write-CommandLog $result
                throw "playwright tests failed"
            }

            Write-Pass (Get-PlaywrightSummary $result)
        } catch {
            Write-Fail "playwright tests failed"
            $failures += "playwright"
        }
    }
}

Write-Host ""
if ($failures.Count -gt 0) {
    Write-Host "FAILED: $($failures -join ', ')" -ForegroundColor Red
    Write-Host "Fix failures before proceeding to the next task." -ForegroundColor Yellow
    exit 1
}

Write-Host "ALL CHECKS PASSED" -ForegroundColor Green

if ($Phase -eq "commit") {
    Write-Step "Git commit"
    git add -A
    $msg = Read-Host "Commit message"
    if ($msg) {
        git commit -m $msg
        Write-Pass "committed: $msg"
        $branch = git branch --show-current
        git push origin $branch
    } else {
        Write-Host "Commit skipped (empty message)" -ForegroundColor Yellow
    }
}
