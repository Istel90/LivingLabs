$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $root ".runtime-logs"
$processFile = Join-Path $runtimeDir "platform-processes.json"

$apps = @()

if (Test-Path $processFile) {
  try {
    $savedApps = @(Get-Content $processFile -Raw | ConvertFrom-Json)
    $apps = @($savedApps | ForEach-Object {
      @{ Label = $_.label; Port = [int]$_.port; Url = $_.url }
    })
  } catch {
    $apps = @()
  }
}

if (-not $apps.Count) {
  $apps = @(
    @{ Label = "Living Labs Platform"; Port = 4173; Url = "http://127.0.0.1:4173/" }
  )
}

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

function Test-Url($url) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2
    return "OK $($response.StatusCode)"
  } catch {
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      return "HTTP $([int]$_.Exception.Response.StatusCode)"
    }
    return "No response"
  }
}

$rows = foreach ($app in $apps) {
  $processId = Get-PortProcessId $app.Port
  [pscustomobject]@{
    Service = $app.Label
    Url = $app.Url
    Port = $app.Port
    State = if ($processId) { "Running" } else { "Stopped" }
    PID = if ($processId) { $processId } else { "-" }
    HTTP = if ($processId) { Test-Url $app.Url } else { "-" }
  }
}

$rows | Format-Table -AutoSize
