$ErrorActionPreference = "Continue"

$root = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $root ".runtime-logs"
$processFile = Join-Path $runtimeDir "platform-processes.json"
$ports = @(4173, 4174, 4175, 4176)

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
  $lines = netstat -ano | Select-String "^\s*TCP\s+.+:$port\s+.+\s+LISTENING\s+(\d+)\s*$"
  foreach ($line in $lines) {
    $portPid = [int]$line.Matches[0].Groups[1].Value
    Stop-ProcessId $portPid "port $port"
  }
}

if (Test-Path $processFile) {
  Remove-Item -LiteralPath $processFile -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Stop request completed."
Write-Host "Check status: npm run platform:status"
