$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
$stateFile = Join-Path $root ".runtime-logs\remote-tunnel.json"

if (Test-Path -LiteralPath $stateFile) {
  try {
    $state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    $process = Get-Process -Id $state.pid -ErrorAction SilentlyContinue
    if ($process -and $process.ProcessName -eq 'cloudflared') {
      Stop-Process -Id $state.pid -Force -ErrorAction SilentlyContinue
    }
  } catch {}
  Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
}

& (Join-Path $PSScriptRoot "stop-platform.ps1") | Out-Host
Write-Host "Remote demo connection stopped."
