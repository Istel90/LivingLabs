$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $root ".runtime-logs"
$processFile = Join-Path $runtimeDir "platform-processes.json"

$apps = @(
  @{ Label = "Portal"; Port = 4173; Url = "http://127.0.0.1:4173/" },
  @{ Label = "Survey"; Port = 4174; Url = "http://127.0.0.1:4174/" },
  @{ Label = "Internal Tools"; Port = 4175; Url = "http://127.0.0.1:4175/" }
)

function Get-PortProcessId($port) {
  $lines = netstat -ano | Select-String "^\s*TCP\s+.+:$port\s+.+\s+LISTENING\s+(\d+)\s*$"
  if (-not $lines) {
    return $null
  }
  return [int]$lines[0].Matches[0].Groups[1].Value
}

function Test-Url($url) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2
    return "OK $($response.StatusCode)"
  } catch {
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
