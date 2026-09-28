param([switch]$IncludeDatabase)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'platform-runtime.ps1')
New-Item -ItemType Directory -Path $PlatformRuntime -Force | Out-Null
# Written before waiting for the lock so an in-flight recovery stops starting services.
Set-Content -LiteralPath $PlatformPause -Value (Get-Date -Format o)
$lock = $null
try {
  for ($attempt = 0; $attempt -lt 150; $attempt++) {
    try {
      $lock = [IO.File]::Open((Join-Path $PlatformRuntime 'platform-runtime.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
      break
    } catch [IO.IOException] { Start-Sleep -Seconds 1 }
  }
  if (-not $lock) { throw 'Recovery is busy. Automatic recovery is paused; retry stop later.' }
  foreach ($owner in @(Get-PlatformListener 4173)) {
    $process = Assert-PlatformOwner $owner
    # Recheck identity immediately before the targeted stop.
    $null = Assert-PlatformOwner $process.ProcessId
    Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
  }
  if ($IncludeDatabase) {
    & (Join-Path $PlatformPgHome 'bin\pg_ctl.exe') -D $PlatformPgData status | Out-Null
    if ($LASTEXITCODE -eq 0) {
      & (Join-Path $PlatformPgHome 'bin\pg_ctl.exe') -D $PlatformPgData -w -t 120 stop -m fast
      if ($LASTEXITCODE -ne 0) { throw 'Database did not stop cleanly.' }
    }
  }
  Write-Output 'Local platform stopped; automatic recovery paused. Resume with npm run platform:start.'
} finally {
  if ($lock) { $lock.Dispose() }
}
