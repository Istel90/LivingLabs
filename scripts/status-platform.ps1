$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $root ".runtime-logs"
$processFile = Join-Path $runtimeDir "platform-processes.json"

$apps = @(
  @{ Label = "Portal"; Port = 5173; Url = "http://127.0.0.1:5173/" },
  @{ Label = "Survey"; Port = 5174; Url = "http://127.0.0.1:5174/" },
  @{ Label = "Internal Tools"; Port = 5175; Url = "http://127.0.0.1:5175/" },
  @{ Label = "VWorld Data Proxy"; Port = 5176; Url = "http://127.0.0.1:5176/health" }
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

$saved = @()
if (Test-Path $processFile) {
  try {
    $saved = Get-Content $processFile -Raw | ConvertFrom-Json
  } catch {
    $saved = @()
  }
}

$rows = foreach ($app in $apps) {
  $processId = Get-PortProcessId $app.Port
  $savedRecord = $saved | Where-Object { $_.port -eq $app.Port } | Select-Object -First 1
  [pscustomobject]@{
    Service = $app.Label
    Url = $app.Url
    Port = $app.Port
    State = if ($processId) { "Running" } else { "Stopped" }
    PID = if ($processId) { $processId } elseif ($savedRecord) { "Saved: $($savedRecord.pid)" } else { "-" }
    HTTP = if ($processId) { Test-Url $app.Url } else { "-" }
  }
}

$rows | Format-Table -AutoSize
