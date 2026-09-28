# Shared local runtime operations. Never terminate a process by a saved PID alone.
$PlatformRoot = Split-Path -Parent $PSScriptRoot
$PlatformRuntime = Join-Path $PlatformRoot '.runtime-logs'
$PlatformPause = Join-Path $PlatformRuntime 'platform-autostart.paused'
$PlatformPgHome = 'D:\90_Data\VWORLD\tools\pgsql-17.11\pgsql'
$PlatformPgData = 'D:\90_Data\VWORLD\postgresql\data'

function Get-PlatformListener([int]$Port) {
  @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique)
}

function Assert-PlatformOwner([int]$ProcessId) {
  $p = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId"
  if (-not $p -or $p.Name -ne 'node.exe' -or
      $p.CommandLine -notmatch 'riskmap-core-main[/\\]scripts[/\\]vworld-data-proxy\.mjs' -or
      $p.CommandLine -notmatch '--port=4173(?:\s|"|$)' -or
      $p.CommandLine -notmatch '--static-root=(?:"[^"]*[/\\])?pages-dist(?:"|\s|$)') {
    throw "Port 4173 has an unrecognized owner (PID $ProcessId); leaving it untouched."
  }
  return $p
}

function Invoke-PlatformRecovery {
  if (Test-Path -LiteralPath $PlatformPause) { return 'paused' }
  $owners = @(Get-PlatformListener 4173)
  foreach ($owner in $owners) { $null = Assert-PlatformOwner $owner }
  $ready = Join-Path $PlatformPgHome 'bin\pg_isready.exe'
  & $ready -h 127.0.0.1 -p 55432 -U postgres -t 3 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    # A listening server may still be recovering. Do not start a second instance.
    if (@(Get-PlatformListener 55432).Count) { throw 'Database is listening but not ready; retry next minute.' }
    & (Join-Path $PlatformPgHome 'bin\pg_ctl.exe') -D $PlatformPgData `
      -l 'D:\90_Data\VWORLD\postgresql\logs\postgresql.log' `
      -o '-p 55432 -h 127.0.0.1' -w -t 120 start | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Database startup failed; see PostgreSQL log.' }
    & $ready -h 127.0.0.1 -p 55432 -U postgres -t 3 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Database is not ready after startup.' }
  }
  if (Test-Path -LiteralPath $PlatformPause) { return 'paused' }
  if (-not @(Get-PlatformListener 4173).Count) {
    if (-not (Test-Path (Join-Path $PlatformRoot 'pages-dist\internal-tools\_app'))) {
      throw 'Existing internal-tools build is missing; automatic rebuilding is disabled.'
    }
    $config = Get-Content (Join-Path $PlatformRuntime 'platform-autostart.json') -Raw | ConvertFrom-Json
    $tokenFile = Join-Path $PlatformRoot '.runtime-secrets\postgis-tunnel-token.txt'
    $priorToken = $env:LIVINGLABS_TUNNEL_TOKEN
    try {
      if (Test-Path $tokenFile) { $env:LIVINGLABS_TUNNEL_TOKEN = (Get-Content $tokenFile -Raw).Trim() }
      $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
      $null = Start-Process -FilePath $config.node -ArgumentList @(
        'riskmap-core-main/scripts/vworld-data-proxy.mjs', '--port=4173',
        '--postgis-host=127.0.0.1', '--postgis-port=55432',
        '--postgis-database=livinglabs_postgis', '--postgis-user=postgres', '--static-root=pages-dist'
      ) -WorkingDirectory $PlatformRoot -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $PlatformRuntime "platform-$stamp.log") `
        -RedirectStandardError (Join-Path $PlatformRuntime "platform-$stamp.err.log")
    } finally { $env:LIVINGLABS_TUNNEL_TOKEN = $priorToken }
    for ($attempt = 0; $attempt -lt 15; $attempt++) {
      Start-Sleep -Seconds 1
      if (@(Get-PlatformListener 4173).Count) { break }
    }
    if (-not @(Get-PlatformListener 4173).Count) { throw 'Platform did not open port 4173.' }
  }
  foreach ($owner in @(Get-PlatformListener 4173)) { $null = Assert-PlatformOwner $owner }
  return 'running'
}
