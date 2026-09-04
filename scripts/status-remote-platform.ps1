$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
$stateFile = Join-Path $root ".runtime-logs\remote-tunnel.json"
$secretFile = Join-Path $root ".runtime-secrets\postgis-tunnel-token.txt"
$tunnelLog = Join-Path $root ".runtime-logs\cloudflared.err.log"

if (-not (Test-Path -LiteralPath $stateFile)) {
  Write-Host "Remote demo tunnel: not configured"
  exit 1
}

$state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
$process = Get-Process -Id $state.pid -ErrorAction SilentlyContinue
$ready = $false
if ($process -and (Test-Path -LiteralPath $secretFile)) {
  try {
    $token = (Get-Content -LiteralPath $secretFile -Raw).Trim()
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:4173/cadastre/health" `
      -Headers @{ "CF-Ray" = "local-status-check"; "X-LivingLabs-Tunnel-Token" = $token } -TimeoutSec 15
    $registered = (Test-Path -LiteralPath $tunnelLog) -and ((Get-Content -LiteralPath $tunnelLog -Raw) -match 'Registered tunnel connection')
    $ready = $response.StatusCode -eq 200 -and $registered
  } catch {}
}

[pscustomobject]@{
  Ready = $ready
  TunnelProcess = if ($process) { "Running" } else { "Stopped" }
  StartedAt = $state.startedAt
  PublicSite = $state.publicSite
} | Format-List

if (-not $ready) { exit 1 }
