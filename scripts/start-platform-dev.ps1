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
    Port = 4173
    Url = "http://127.0.0.1:4173/"
    Cwd = $root
  },
  @{
    Name = "survey"
    Label = "Survey"
    Port = 4174
    Url = "http://127.0.0.1:4174/"
    Cwd = Join-Path $root "Survey platform for collaboration"
  },
  @{
    Name = "riskmap"
    Label = "Internal Tools"
    Port = 4175
    Url = "http://127.0.0.1:4175/"
    Cwd = Join-Path $root "riskmap-core-main"
  },
  @{
    Name = "vworld-proxy"
    Label = "VWorld Data Proxy"
    Port = 4176
    Url = "http://127.0.0.1:4176/health"
    Cwd = Join-Path $root "riskmap-core-main"
    Command = "node"
    Args = @("./scripts/vworld-data-proxy.mjs", "--port=4176")
  }
)

function Get-PortProcessId($port) {
  $lines = netstat -ano | Select-String "^\s*TCP\s+.+:$port\s+.+\s+LISTENING\s+(\d+)\s*$"
  if (-not $lines) {
    return $null
  }
  return [int]$lines[0].Matches[0].Groups[1].Value
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
      mode = "dev"
      startedAt = (Get-Date).ToString("s")
    }
    continue
  }

  $combinedLog = Join-Path $runtimeDir "$($app.Name)-$($app.Port).dev.log"
  $errorLog = Join-Path $runtimeDir "$($app.Name)-$($app.Port).dev.err.log"
  $nodePath = Join-Path $env:ProgramFiles "nodejs\node.exe"
  if ($app.Command -eq "node") {
    $nodeArgs = ($app.Args | ForEach-Object { "`"$_`"" }) -join " "
    $cmdCommand = "set `"CI=true`" && cd /d `"$($app.Cwd)`" && `"$nodePath`" $nodeArgs > `"$combinedLog`" 2> `"$errorLog`""
  } else {
    $vitePath = Join-Path $app.Cwd "node_modules\vite\bin\vite.js"
    $cmdCommand = "set `"CI=true`" && cd /d `"$($app.Cwd)`" && `"$nodePath`" `"$vitePath`" dev --host 0.0.0.0 --port $($app.Port) --strictPort > `"$combinedLog`" 2> `"$errorLog`""
  }

  $process = Start-Process `
    -FilePath "cmd.exe" `
    -ArgumentList @("/k", $cmdCommand) `
    -WorkingDirectory $app.Cwd `
    -WindowStyle Hidden `
    -PassThru

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
