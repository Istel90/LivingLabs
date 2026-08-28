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
$sourceRoots = @(
  (Join-Path $root "src"),
  (Join-Path $root "shared"),
  (Join-Path $root "Survey platform for collaboration\src"),
  (Join-Path $root "riskmap-core-main\src")
)
$sourceFiles = @(
  (Join-Path $root "package.json"),
  (Join-Path $root "scripts\build-unified-platform.mjs"),
  (Join-Path $root "riskmap-core-main\package.json"),
  (Join-Path $root "Survey platform for collaboration\package.json")
)
$latestSourceWrite = ($sourceRoots | Where-Object { Test-Path -LiteralPath $_ } | ForEach-Object {
  Get-ChildItem -LiteralPath $_ -File -Recurse -Force | Select-Object -ExpandProperty LastWriteTime
}) + ($sourceFiles | Where-Object { Test-Path -LiteralPath $_ } | ForEach-Object {
  (Get-Item -LiteralPath $_).LastWriteTime
}) | Sort-Object -Descending | Select-Object -First 1
$unifiedBuildWrite = if (Test-Path -LiteralPath $unifiedIndex) {
  (Get-Item -LiteralPath $unifiedIndex).LastWriteTime
} else {
  [datetime]::MinValue
}

if (-not (Test-Path -LiteralPath $unifiedIndex) -or $latestSourceWrite -gt $unifiedBuildWrite) {
  Write-Host "Unified build is missing or older than the source. Building the platform first..."
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

function Get-ProcessCommandLine($targetPid) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$targetPid" -ErrorAction SilentlyContinue
  if (-not $process) {
    return $null
  }
  return [string]$process.CommandLine
}

function Test-OwnedPlatformProcess($targetPid) {
  $commandLine = Get-ProcessCommandLine $targetPid
  if (-not $commandLine) {
    return $false
  }
  $normalized = $commandLine.Replace('\', '/').ToLowerInvariant()
  return $normalized.Contains('riskmap-core-main/scripts/vworld-data-proxy.mjs') -and $normalized.Contains('--port=4173')
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

function Test-PlatformContent($path, $expectedText) {
  $url = "http://127.0.0.1:4173$path"
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 10
    return [pscustomobject]@{
      Path = $path
      Status = [int]$response.StatusCode
      Ready = $response.StatusCode -eq 200 -and $response.Content.Contains($expectedText)
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
    if (-not (Test-OwnedPlatformProcess $existingPid)) {
      $occupiedCommand = Get-ProcessCommandLine $existingPid
      throw "Port $($app.Port) is occupied by a different process (PID $existingPid). Refusing to reuse or stop it. Command: $occupiedCommand"
    }
    Write-Host "Already running: $($app.Label) $($app.Url) (PID $existingPid)"
    $records += [pscustomobject]@{
      name = $app.Name
      label = $app.Label
      port = $app.Port
      url = $app.Url
      pid = $existingPid
      reused = $true
      workspaceRoot = $root
      commandLine = Get-ProcessCommandLine $existingPid
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
    workspaceRoot = $root
    commandLine = "$($app.Command) $($app.Args -join ' ')"
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

$processFileTemp = "$processFile.tmp"
$records | ConvertTo-Json -Depth 4 | Set-Content -Path $processFileTemp -Encoding UTF8
Move-Item -LiteralPath $processFileTemp -Destination $processFile -Force

Write-Host ""
Write-Host "Platform server"
$records | Select-Object label, url, port, pid | Format-Table -AutoSize

$healthChecks = @(
  Test-PlatformEndpoint "/"
  Test-PlatformEndpoint "/tools"
  Test-PlatformEndpoint "/internal-tools/priority-management-area"
  Test-PlatformEndpoint "/internal-tools/climate-hazard-lab"
  Test-PlatformContent "/internal-tools/priority-management-area/flood?regionCode=28177&regionName=%EC%9D%B8%EC%B2%9C%EA%B4%91%EC%97%AD%EC%8B%9C+%EB%AF%B8%EC%B6%94%ED%99%80%EA%B5%AC" 'data-indicator-code="UFMAX"'
  Test-PlatformEndpoint "/health"
  Test-PlatformEndpoint "/cadastre/health"
  Test-PlatformEndpoint "/flood-grid/health"
)

Write-Host "Critical route checks"
$healthChecks | Select-Object Path, Status, Ready | Format-List

$failedHealthChecks = @($healthChecks | Where-Object { -not $_.Ready })
if ($failedHealthChecks.Count) {
  $failedPaths = ($failedHealthChecks | ForEach-Object { $_.Path }) -join ', '
  throw "Platform started, but one or more critical routes are unavailable: $failedPaths. Check .runtime-logs."
}

Write-Host "Check status: npm run platform:status"
Write-Host "Stop app:     npm run platform:stop"
Write-Host "Stop app+DB:  npm run platform:stop:all"
