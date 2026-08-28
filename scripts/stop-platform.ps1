param(
  [switch]$IncludeDatabase
)

$ErrorActionPreference = "Continue"

$root = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $root ".runtime-logs"
$processFile = Join-Path $runtimeDir "platform-processes.json"
$platformPort = 4173

function Get-ProcessCommandLine($targetPid) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$targetPid" -ErrorAction SilentlyContinue
  if (-not $process) {
    return $null
  }
  return [string]$process.CommandLine
}

function Test-OwnedPlatformProcess($targetPid) {
  $commandLine = Get-ProcessCommandLine $targetPid
  if (-not $commandLine) {
    return $false
  }
  $normalized = $commandLine.Replace('\', '/').ToLowerInvariant()
  return $normalized.Contains('riskmap-core-main/scripts/vworld-data-proxy.mjs') -and $normalized.Contains('--port=4173')
}

function Stop-ProcessId($targetPid, $reason) {
  if (-not $targetPid) {
    return
  }

  $process = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
  if (-not $process) {
    return
  }
  if (-not (Test-OwnedPlatformProcess $targetPid)) {
    Write-Warning "Skipped PID $targetPid ($reason): it is not the Living Labs platform process."
    return
  }
  Write-Host "Stopping PID $targetPid ($reason)"
  Stop-Process -Id $targetPid -Force -ErrorAction SilentlyContinue
}

if (Test-Path $processFile) {
  try {
    $records = Get-Content $processFile -Raw | ConvertFrom-Json
    foreach ($record in $records) {
      Stop-ProcessId $record.pid "$($record.label)"
    }
  } catch {
    Write-Host "Could not read saved process file. Falling back to port cleanup."
  }
}

$connections = netstat -ano | Select-String -Pattern "LISTENING" | Where-Object {
  $parts = ($_.Line -replace "\s+", " ").Trim().Split(" ")
  $parts.Length -ge 5 -and $parts[1] -match ":$platformPort$"
}
foreach ($connection in $connections) {
  $parts = ($connection.Line -replace "\s+", " ").Trim().Split(" ")
  Stop-ProcessId ([int]$parts[4]) "port $platformPort"
}

if (Test-Path $processFile) {
  Remove-Item -LiteralPath $processFile -Force -ErrorAction SilentlyContinue
}

if ($IncludeDatabase) {
  $postgisStopScript = Join-Path $PSScriptRoot "stop-vworld-postgis.ps1"
  $pgIsReady = "D:\90_Data\VWORLD\tools\pgsql-17.11\pgsql\bin\pg_isready.exe"
  if ((Test-Path -LiteralPath $postgisStopScript) -and (Test-Path -LiteralPath $pgIsReady)) {
    & $pgIsReady -h 127.0.0.1 -p 55432 -U postgres | Out-Null
    if ($LASTEXITCODE -eq 0) {
      & $postgisStopScript
    }
  }
}

Write-Host ""
Write-Host "Platform app stop request completed."
if ($IncludeDatabase) {
  Write-Host "PostGIS stop was also requested."
} else {
  Write-Host "PostGIS was left running for safer, faster refreshes."
}
Write-Host "Check status: npm run platform:status"
