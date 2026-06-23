$ErrorActionPreference = "Continue"

$root = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $root ".runtime-logs"
$processFile = Join-Path $runtimeDir "platform-processes.json"
$ports = @(5173, 5174, 5175, 5176, 4173, 4174, 4175, 4176)

function Stop-ProcessId($targetPid, $reason) {
  if (-not $targetPid) {
    return
  }

  $process = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
  if ($process) {
    Write-Host "Stopping PID $targetPid ($reason)"
    Stop-Process -Id $targetPid -Force -ErrorAction SilentlyContinue
  }
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

foreach ($port in $ports) {
  $connections = netstat -ano | Select-String -Pattern "LISTENING" | Where-Object {
    $parts = ($_.Line -replace "\s+", " ").Trim().Split(" ")
    $parts.Length -ge 5 -and $parts[1] -match ":$port$"
  }
  foreach ($connection in $connections) {
    $parts = ($connection.Line -replace "\s+", " ").Trim().Split(" ")
    Stop-ProcessId ([int]$parts[4]) "port $port"
  }
}

if (Test-Path $processFile) {
  Remove-Item -LiteralPath $processFile -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Stop request completed."
Write-Host "Check status: npm run platform:status"
