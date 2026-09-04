param(
  [string]$CloudflaredPath = "D:\90_Data\Cloudflare\cloudflared.exe",
  [switch]$SkipPublish
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $root ".runtime-logs"
$secretDir = Join-Path $root ".runtime-secrets"
$secretFile = Join-Path $secretDir "postgis-tunnel-token.txt"
$caBundle = Join-Path $secretDir "windows-root-cas.pem"
$stateFile = Join-Path $runtimeDir "remote-tunnel.json"
$outLog = Join-Path $runtimeDir "cloudflared.out.log"
$errorLog = Join-Path $runtimeDir "cloudflared.err.log"
$repository = "Istel90/LivingLabs"

New-Item -ItemType Directory -Force -Path $runtimeDir, $secretDir | Out-Null

if (-not (Test-Path -LiteralPath $CloudflaredPath)) {
  throw "cloudflared is missing: $CloudflaredPath"
}

if (-not (Test-Path -LiteralPath $caBundle)) {
  $pemBlocks = Get-ChildItem Cert:\CurrentUser\Root, Cert:\CurrentUser\CA, Cert:\LocalMachine\Root, Cert:\LocalMachine\CA `
    -ErrorAction SilentlyContinue | Sort-Object Thumbprint -Unique | ForEach-Object {
      $base64 = [Convert]::ToBase64String($_.RawData, [Base64FormattingOptions]::InsertLineBreaks)
      "-----BEGIN CERTIFICATE-----`r`n$base64`r`n-----END CERTIFICATE-----"
    }
  [IO.File]::WriteAllText($caBundle, (($pemBlocks -join "`r`n") + "`r`n"), [Text.Encoding]::ASCII)
}

if (-not (Test-Path -LiteralPath $secretFile)) {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  $token = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
  Set-Content -LiteralPath $secretFile -Value $token -Encoding ASCII -NoNewline
}

$token = (Get-Content -LiteralPath $secretFile -Raw).Trim()
if ($token.Length -lt 32) {
  throw "The local tunnel token is invalid."
}

function Publish-Tunnel([string]$origin, [string]$secret) {
  if ($SkipPublish) { return }
  & gh secret set POSTGIS_TUNNEL_TOKEN --repo $repository --body $secret
  if ($LASTEXITCODE -ne 0) { throw "Could not update the GitHub tunnel secret." }
  & gh variable set POSTGIS_TUNNEL_ORIGIN --repo $repository --body $origin
  if ($LASTEXITCODE -ne 0) { throw "Could not update the GitHub tunnel origin." }
  & gh workflow run deploy-cloudflare.yml --repo $repository --ref master
  if ($LASTEXITCODE -ne 0) { throw "Could not start the Cloudflare deployment." }
}

if (Test-Path -LiteralPath $stateFile) {
  try {
    $existing = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    $existingProcess = Get-Process -Id $existing.pid -ErrorAction SilentlyContinue
    if ($existingProcess -and $existingProcess.ProcessName -eq 'cloudflared' -and $existing.url -match '^https://[a-z0-9-]+\.trycloudflare\.com$') {
      $health = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:4173/cadastre/health" `
        -Headers @{ "CF-Ray" = "local-reuse-check"; "X-LivingLabs-Tunnel-Token" = $token } -TimeoutSec 15
      $registered = (Test-Path -LiteralPath $errorLog) -and ((Get-Content -LiteralPath $errorLog -Raw) -match 'Registered tunnel connection')
      if ($health.StatusCode -eq 200 -and $registered) {
        Publish-Tunnel $existing.url $token
        Write-Host "Remote demo tunnel is already ready."
        Write-Host "Public site: https://livinglabs-platform.pages.dev/"
        exit 0
      }
    }
  } catch {
    # Stale state is replaced below.
  }

  if ($existingProcess -and $existingProcess.ProcessName -eq 'cloudflared') {
    Stop-Process -Id $existingProcess.Id -Force -ErrorAction SilentlyContinue
  }
}

$env:LIVINGLABS_TUNNEL_TOKEN = $token
$platformListener = Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($platformListener) {
  Stop-Process -Id $platformListener.OwningProcess -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
}
& (Join-Path $PSScriptRoot "start-platform.ps1") | Out-Host

$localUnauthorizedStatus = $null
try {
  Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:4173/cadastre/health" `
    -Headers @{ "CF-Ray" = "local-access-check" } -TimeoutSec 10 | Out-Null
  $localUnauthorizedStatus = 200
} catch {
  if ($_.Exception.Response) { $localUnauthorizedStatus = [int]$_.Exception.Response.StatusCode }
}
if ($localUnauthorizedStatus -ne 401) {
  throw "Local tunnel access control check failed (expected 401, received $localUnauthorizedStatus)."
}

$localAuthorized = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:4173/cadastre/health" `
  -Headers @{ "CF-Ray" = "local-access-check"; "X-LivingLabs-Tunnel-Token" = $token } -TimeoutSec 15
if ($localAuthorized.StatusCode -ne 200) {
  throw "Local PostGIS authorization check failed."
}

$env:LIVINGLABS_TUNNEL_TOKEN = $null

Remove-Item -LiteralPath $outLog, $errorLog -Force -ErrorAction SilentlyContinue
$tunnel = Start-Process -FilePath $CloudflaredPath `
  -ArgumentList @("tunnel", "--no-autoupdate", "--protocol", "quic", "--origin-ca-pool", $caBundle, "--url", "http://127.0.0.1:4173") `
  -WorkingDirectory $root `
  -WindowStyle Hidden `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errorLog `
  -PassThru

$tunnelUrl = $null
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  Start-Sleep -Seconds 1
  $logText = @(
    if (Test-Path -LiteralPath $outLog) { Get-Content -LiteralPath $outLog -Raw }
    if (Test-Path -LiteralPath $errorLog) { Get-Content -LiteralPath $errorLog -Raw }
  ) -join "`n"
  $match = [regex]::Match($logText, 'https://[a-z0-9-]+\.trycloudflare\.com')
  if ($match.Success -and $logText -match 'Registered tunnel connection') {
    $tunnelUrl = $match.Value
    break
  }
  if ($tunnel.HasExited) { break }
}

if (-not $tunnelUrl) {
  if (-not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -Force -ErrorAction SilentlyContinue }
  throw "Cloudflare Tunnel did not provide a URL. Check .runtime-logs/cloudflared.err.log."
}

[pscustomobject]@{
  pid = $tunnel.Id
  url = $tunnelUrl
  startedAt = (Get-Date).ToString('s')
  publicSite = 'https://livinglabs-platform.pages.dev/'
} | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8

Publish-Tunnel $tunnelUrl $token
Write-Host "Remote PostGIS demo connection is ready."
Write-Host "Public site: https://livinglabs-platform.pages.dev/"
