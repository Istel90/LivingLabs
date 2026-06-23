$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $root ".runtime-logs"
$processFile = Join-Path $runtimeDir "platform-processes.json"

if (-not (Test-Path $runtimeDir)) {
  New-Item -ItemType Directory -Path $runtimeDir | Out-Null
}

$apps = @(
  @{
    Name = "portal"
    Label = "Portal"
    Port = 5173
    Url = "http://127.0.0.1:5173/"
    Cwd = $root
  },
  @{
    Name = "survey"
    Label = "Survey"
    Port = 5174
    Url = "http://127.0.0.1:5174/"
    Cwd = Join-Path $root "Survey platform for collaboration"
  },
  @{
    Name = "riskmap"
    Label = "Internal Tools"
    Port = 5175
    Url = "http://127.0.0.1:5175/"
    Cwd = Join-Path $root "riskmap-core-main"
  },
  @{
    Name = "vworld-proxy"
    Label = "VWorld Data Proxy"
    Port = 5176
    Url = "http://127.0.0.1:5176/health"
    Cwd = Join-Path $root "riskmap-core-main"
    Command = "node"
    Args = @("./scripts/vworld-data-proxy.mjs", "--port=5176")
  }
)

function Get-PortProcessId($port) {
  $lines = netstat -ano | Select-String -Pattern "LISTENING"
  foreach ($line in $lines) {
    $parts = ($line.Line -replace "\s+", " ").Trim().Split(" ")
    if ($parts.Length -ge 5 -and $parts[1] -match ":$port$") {
      return [int]$parts[4]
    }
  }
  return $null
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
      mode = "dev"
      startedAt = (Get-Date).ToString("s")
    }
    continue
  }

  $combinedLog = Join-Path $runtimeDir "$($app.Name)-$($app.Port)-dev.log"
  $errorLog = Join-Path $runtimeDir "$($app.Name)-$($app.Port)-dev.err.log"

  if ($app.Command -eq "node") {
    $process = Start-Process `
      -FilePath "node.exe" `
      -ArgumentList $app.Args `
      -WorkingDirectory $app.Cwd `
      -WindowStyle Hidden `
      -RedirectStandardOutput $combinedLog `
      -RedirectStandardError $errorLog `
      -PassThru
  } else {
    $process = Start-Process `
      -FilePath "npm.cmd" `
      -ArgumentList @("run", "dev", "--", "--host", "0.0.0.0", "--port", "$($app.Port)", "--strictPort") `
      -WorkingDirectory $app.Cwd `
      -WindowStyle Hidden `
      -RedirectStandardOutput $combinedLog `
      -RedirectStandardError $errorLog `
      -PassThru
  }

  Write-Host "Started dev: $($app.Label) $($app.Url) (PID $($process.Id))"
  $records += [pscustomobject]@{
    name = $app.Name
    label = $app.Label
    port = $app.Port
    url = $app.Url
    pid = $process.Id
    reused = $false
    mode = "dev"
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
Write-Host "Platform dev servers"
$records | Select-Object label, url, port, pid, mode | Format-Table -AutoSize
Write-Host "Check status: npm run platform:status"
Write-Host "Stop all:     npm run platform:stop"
