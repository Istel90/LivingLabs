$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $root ".runtime-logs"
$processFile = Join-Path $runtimeDir "platform-processes.json"

if (-not (Test-Path $runtimeDir)) {
  New-Item -ItemType Directory -Path $runtimeDir | Out-Null
}

$postgisStartScript = Join-Path $PSScriptRoot "start-vworld-postgis.ps1"
if (Test-Path -LiteralPath $postgisStartScript) {
  & $postgisStartScript
  if ($LASTEXITCODE -ne 0) {
    throw "VWorld PostGIS failed to start."
  }
}

$unifiedIndex = Join-Path $root "pages-dist\index.html"
if (-not (Test-Path $unifiedIndex)) {
  Write-Host "Unified build output is missing. Building the platform first..."
  & npm.cmd run build:unified
  if ($LASTEXITCODE -ne 0) {
    throw "Unified platform build failed."
  }
}

$apps = @(
  @{
    Name = "platform"
    Label = "Living Labs Platform"
    Port = 4173
    Url = "http://127.0.0.1:4173/"
    Cwd = $root
    Command = "node.exe"
    Args = @(
      "riskmap-core-main/scripts/vworld-data-proxy.mjs",
      "--port=4173",
      "--static-root=pages-dist"
    )
  }
)

function Get-PortProcessId($port) {
  $lines = netstat -ano | Select-String "^\s*TCP\s+.+:$port\s+.+\s+LISTENING\s+(\d+)\s*$"
  if (-not $lines) {
    return $null
  }
  return [int]$lines[0].Matches[0].Groups[1].Value
}

function Test-PlatformEndpoint($path) {
  $url = "http://127.0.0.1:4173$path"
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 10
    return [pscustomobject]@{
      Path = $path
      Status = [int]$response.StatusCode
      Ready = $response.StatusCode -eq 200
    }
  } catch {
    return [pscustomobject]@{
      Path = $path
      Status = "No response"
      Ready = $false
    }
  }
}

function Quote-PSString($value) {
  return "'" + ($value -replace "'", "''") + "'"
}

$records = @()

foreach ($app in $apps) {
  $existingPid = Get-PortProcessId $app.Port
  if ($existingPid) {
    Write-Host "Already running: $($app.Label) $($app.Url) (PID $existingPid)"
    $records += [pscustomobject]@{
      name = $app.Name
      label = $app.Label
      port = $app.Port
      url = $app.Url
      pid = $existingPid
      reused = $true
      startedAt = (Get-Date).ToString("s")
    }
    continue
  }

  $combinedLog = Join-Path $runtimeDir "$($app.Name)-$($app.Port).log"
  $errorLog = Join-Path $runtimeDir "$($app.Name)-$($app.Port).err.log"

  $process = Start-Process `
    -FilePath $app.Command `
    -ArgumentList $app.Args `
    -WorkingDirectory $app.Cwd `
    -WindowStyle Hidden `
    -RedirectStandardOutput $combinedLog `
    -RedirectStandardError $errorLog `
    -PassThru

  Write-Host "Started: $($app.Label) $($app.Url) (PID $($process.Id))"
  $records += [pscustomobject]@{
    name = $app.Name
    label = $app.Label
    port = $app.Port
    url = $app.Url
    pid = $process.Id
    reused = $false
    startedAt = (Get-Date).ToString("s")
  }
}

Start-Sleep -Seconds 4

foreach ($record in $records) {
  $actualPid = Get-PortProcessId $record.port
  if ($actualPid) {
    $record.pid = $actualPid
  } else {
    Write-Host "Warning: $($record.Label) did not stay running on port $($record.Port). Check .runtime-logs."
  }
}

$records | ConvertTo-Json -Depth 4 | Set-Content -Path $processFile -Encoding UTF8

Write-Host ""
Write-Host "Platform server"
$records | Select-Object label, url, port, pid | Format-Table -AutoSize

$healthChecks = @(
  Test-PlatformEndpoint "/"
  Test-PlatformEndpoint "/tools"
  Test-PlatformEndpoint "/internal-tools/priority-management-area"
  Test-PlatformEndpoint "/internal-tools/climate-hazard-lab"
  Test-PlatformEndpoint "/health"
  Test-PlatformEndpoint "/cadastre/health"
)

Write-Host "Critical route checks"
$healthChecks | Select-Object Path, Status, Ready | Format-Table -AutoSize

if ($healthChecks.Where({ -not $_.Ready }).Count) {
  throw "Platform started, but one or more critical routes are unavailable. Check .runtime-logs."
}

Write-Host "Check status: npm run platform:status"
Write-Host "Stop all:     npm run platform:stop"
