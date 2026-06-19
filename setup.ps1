#!/usr/bin/env pwsh
<#
.SYNOPSIS
    One-time setup for Team Lunch development environment.
.DESCRIPTION
    Installs all prerequisites:
    - Node.js dependencies (pnpm install)
    - Prisma client generation
    - Python virtual environment with semgrep (security scanner)
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step([string]$message) {
    Write-Host "`n=== $message ===" -ForegroundColor Cyan
}

# --- Node.js dependencies ---
Write-Step "Installing Node.js dependencies"
corepack enable
pnpm install
if ($LASTEXITCODE -ne 0) { Write-Error "pnpm install failed"; exit 1 }

# --- Prisma client ---
Write-Step "Generating Prisma client"
pnpm exec prisma generate
if ($LASTEXITCODE -ne 0) { Write-Error "prisma generate failed"; exit 1 }

# --- Python venv + semgrep ---
Write-Step "Setting up Python virtual environment"

$venvDir = Join-Path $PSScriptRoot '.venv'

# Detect python executable (python3 on Linux/macOS, python on Windows)
$pythonExe = if (Get-Command python3 -ErrorAction SilentlyContinue) { 'python3' }
             elseif (Get-Command python -ErrorAction SilentlyContinue) { 'python' }
             else { Write-Error 'Neither python3 nor python found on PATH'; exit 1 }

if (-not (Test-Path $venvDir)) {
    & $pythonExe -m venv $venvDir
    if ($LASTEXITCODE -ne 0) { Write-Error "python -m venv failed"; exit 1 }
}

$binDir = if ($IsWindows -or $env:OS -eq 'Windows_NT') { 'Scripts' } else { 'bin' }
$pipExeName = if ($IsWindows -or $env:OS -eq 'Windows_NT') { 'pip.exe' } else { 'pip' }
$pipExe = Join-Path $venvDir $binDir $pipExeName
Write-Step "Installing semgrep into .venv"
& $pipExe install semgrep
if ($LASTEXITCODE -ne 0) { Write-Error "pip install semgrep failed"; exit 1 }

# --- Done ---
Write-Host "`n" -NoNewline
Write-Host "Setup complete!" -ForegroundColor Green
Write-Host "Next steps:"
Write-Host "  1. Copy .env.example to .env and edit as needed"
Write-Host "  2. Start PostgreSQL:  docker compose up db -d"
Write-Host "  3. Run migrations:    pnpm prisma migrate dev"
Write-Host "  4. Start the app:     pnpm dev"
