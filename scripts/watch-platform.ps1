$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'platform-runtime.ps1')
New-Item -ItemType Directory -Path $PlatformRuntime -Force | Out-Null
$lock = $null
$resultCode = 0
try {
  try {
    $lock = [IO.File]::Open((Join-Path $PlatformRuntime 'platform-runtime.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
  } catch [IO.IOException] { exit 0 }
  $state = Invoke-PlatformRecovery
  [pscustomobject]@{ checkedAt=(Get-Date).ToString('o'); state=$state; processIds=@(Get-PlatformListener 4173) } |
    ConvertTo-Json | Set-Content (Join-Path $PlatformRuntime 'platform-watchdog-status.json') -Encoding UTF8
} catch {
  $resultCode = 1
  $message = $_.Exception.Message
  Add-Content (Join-Path $PlatformRuntime ("platform-watchdog-{0}.log" -f (Get-Date -Format 'yyyyMMdd'))) `
    ("{0} ERROR {1}" -f (Get-Date -Format o), $message)
  [pscustomobject]@{ checkedAt=(Get-Date).ToString('o'); state='error'; error=$message } |
    ConvertTo-Json | Set-Content (Join-Path $PlatformRuntime 'platform-watchdog-status.json') -Encoding UTF8
} finally {
  if ($lock) { $lock.Dispose() }
}
exit $resultCode
