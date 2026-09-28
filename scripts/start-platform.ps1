$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'platform-runtime.ps1')
New-Item -ItemType Directory -Path $PlatformRuntime -Force | Out-Null
$configPath = Join-Path $PlatformRuntime 'platform-autostart.json'
if (-not (Test-Path $configPath)) {
  [pscustomobject]@{node=(Get-Command node.exe -ErrorAction Stop).Source;root=$PlatformRoot} |
    ConvertTo-Json | Set-Content $configPath -Encoding UTF8
}
Remove-Item -LiteralPath $PlatformPause -ErrorAction SilentlyContinue
& "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'watch-platform.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Platform startup failed. Check .runtime-logs/platform-watchdog-status.json.' }
Get-Content (Join-Path $PlatformRuntime 'platform-watchdog-status.json')
