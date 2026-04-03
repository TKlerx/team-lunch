param(
  [int[]]$Ports = @(),
  [switch]$NonInteractive,
  [switch]$KillAll
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($env:PORT) -or [string]::IsNullOrWhiteSpace($env:VITE_PORT)) {
  $envFilePath = Join-Path (Get-Location) '.env'
  if (Test-Path $envFilePath) {
    foreach ($line in Get-Content $envFilePath) {
      $trimmed = $line.Trim()
      if ($trimmed.Length -eq 0 -or $trimmed.StartsWith('#') -or -not $trimmed.Contains('=')) {
        continue
      }

      $parts = $trimmed.Split('=', 2)
      $key = $parts[0].Trim()
      $value = $parts[1].Trim().Trim('"').Trim("'")

      if ($key -eq 'PORT' -and [string]::IsNullOrWhiteSpace($env:PORT)) {
        $env:PORT = $value
      }

      if ($key -eq 'VITE_PORT' -and [string]::IsNullOrWhiteSpace($env:VITE_PORT)) {
        $env:VITE_PORT = $value
      }
    }
  }
}

if (-not $Ports -or $Ports.Count -eq 0) {
  $serverPort = if ([string]::IsNullOrWhiteSpace($env:PORT)) { 3000 } else { [int]$env:PORT }
  $vitePort = if ([string]::IsNullOrWhiteSpace($env:VITE_PORT)) { 5173 } else { [int]$env:VITE_PORT }
  $Ports = @($serverPort, $vitePort)
}

function Get-BlockingProcesses {
  param([int[]]$TargetPorts)

  $listeners = @()
  foreach ($port in $TargetPorts) {
    $portListeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($portListeners) {
      $listeners += $portListeners
    }
  }

  if (-not $listeners -or $listeners.Count -eq 0) {
    return @()
  }

  $grouped = $listeners |
    Group-Object -Property OwningProcess |
    Sort-Object { [int]$_.Name }

  $results = @()
  foreach ($group in $grouped) {
    $procId = [int]$group.Name
    $ports = $group.Group.LocalPort | Sort-Object -Unique

    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    $procName = if ($proc) { $proc.ProcessName } else { '<unknown>' }

    $cmdLine = ''
    try {
      $wmi = Get-CimInstance Win32_Process -Filter "ProcessId = $procId" -ErrorAction SilentlyContinue
      if ($wmi -and $wmi.CommandLine) {
        $cmdLine = $wmi.CommandLine
      }
    } catch {
      $cmdLine = ''
    }

    $results += [pscustomobject]@{
      Pid         = $procId
      ProcessName = $procName
      Ports       = ($ports -join ', ')
      CommandLine = $cmdLine
    }
  }

  return $results
}

function Try-StopProcess {
  param(
    [int]$ProcessId,
    [string]$ProcessName
  )

  try {
    Stop-Process -Id $ProcessId -Force -ErrorAction Stop
    Write-Host "Stopped PID $ProcessId ($ProcessName)" -ForegroundColor Green
    return $true
  }
  catch {
    Write-Warning "Failed to stop PID $ProcessId ($ProcessName): $($_.Exception.Message)"
    return $false
  }
}

Write-Host "Checking for listeners on ports: $($Ports -join ', ')" -ForegroundColor Cyan
$blockers = Get-BlockingProcesses -TargetPorts $Ports

if (-not $blockers -or $blockers.Count -eq 0) {
  Write-Host 'No blocking listeners found.' -ForegroundColor Green
  exit 0
}

Write-Host ''
Write-Host 'Blocking processes:' -ForegroundColor Yellow
$blockers |
  Select-Object Pid, ProcessName, Ports |
  Format-Table -AutoSize

if ($KillAll) {
  foreach ($blocker in $blockers) {
    [void](Try-StopProcess -ProcessId $blocker.Pid -ProcessName $blocker.ProcessName)
  }
  exit 0
}

if ($NonInteractive) {
  Write-Host 'Non-interactive mode enabled; no processes were terminated.' -ForegroundColor Yellow
  exit 1
}

Write-Host ''
Write-Host 'Choose per process: [Y]es kill, [N]o skip, [A]ll kill remaining, [Q]uit.' -ForegroundColor Cyan

$killRemaining = $false
foreach ($blocker in $blockers) {
  if ($killRemaining) {
    [void](Try-StopProcess -ProcessId $blocker.Pid -ProcessName $blocker.ProcessName)
    continue
  }

  Write-Host ''
  Write-Host "PID: $($blocker.Pid)  Name: $($blocker.ProcessName)  Ports: $($blocker.Ports)" -ForegroundColor White
  if ($blocker.CommandLine) {
    Write-Host "Command: $($blocker.CommandLine)" -ForegroundColor DarkGray
  }

  while ($true) {
    $choice = Read-Host 'Kill this process? [Y/N/A/Q]'
    if ([string]::IsNullOrWhiteSpace($choice)) {
      continue
    }

    $moveToNextProcess = $false

    switch ($choice.Trim().ToUpperInvariant()) {
      'Y' {
        [void](Try-StopProcess -ProcessId $blocker.Pid -ProcessName $blocker.ProcessName)
        $moveToNextProcess = $true
      }
      'N' {
        Write-Host "Skipped PID $($blocker.Pid)" -ForegroundColor DarkYellow
        $moveToNextProcess = $true
      }
      'A' {
        [void](Try-StopProcess -ProcessId $blocker.Pid -ProcessName $blocker.ProcessName)
        $killRemaining = $true
        $moveToNextProcess = $true
      }
      'Q' {
        Write-Host 'Stopped by user.' -ForegroundColor Yellow
        exit 0
      }
      default {
        Write-Host 'Please enter Y, N, A, or Q.' -ForegroundColor Yellow
      }
    }

    if ($moveToNextProcess) {
      break
    }
  }
}

Write-Host ''
Write-Host 'Done.' -ForegroundColor Green
