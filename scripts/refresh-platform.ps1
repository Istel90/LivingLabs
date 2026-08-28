$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$stopScript = Join-Path $PSScriptRoot 'stop-platform.ps1'
$startScript = Join-Path $PSScriptRoot 'start-platform.ps1'
$currentIndex = Join-Path $root 'pages-dist\index.html'

function Invoke-NpmTask([string]$Task) {
  & npm.cmd run $Task
  if ($LASTEXITCODE -ne 0) { throw ('Task failed: {0}' -f $Task) }
}

Push-Location $root
try {
  Write-Host 'Preparing the new unified build while the current platform stays online...'
  Invoke-NpmTask 'build:unified:prepare'

  Write-Host 'Stopping the platform briefly for the build swap...'
  & $stopScript

  Write-Host 'Activating the prepared build...'
  Invoke-NpmTask 'build:unified:activate'

  Write-Host 'Starting the platform with the new build...'
  & $startScript
} catch {
  if (Test-Path -LiteralPath $currentIndex) {
    Write-Warning 'Refresh did not finish. Attempting to keep the available build online.'
    try { & $startScript } catch { Write-Warning $_.Exception.Message }
  }
  throw
} finally {
  Pop-Location
}
