param(
  [switch]$VerifyBackupHash,
  [string]$PortableRoot = 'D:\90_Data\LivingLabs\PORTABLE_2026-08-28'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$results = [System.Collections.Generic.List[object]]::new()

function Add-Check($area, $state, $detail) {
  $results.Add([pscustomobject]@{
    Area = $area
    State = $state
    Detail = $detail
  })
}

function Get-PortProcessId($port) {
  $connection = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($connection) { return [int]$connection.OwningProcess }
  return $null
}

function Test-Url($label, $url, $expectedText = $null) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 15
    $ready = $response.StatusCode -eq 200
    if ($expectedText) { $ready = $ready -and $response.Content.Contains($expectedText) }
    Add-Check $label $(if ($ready) { 'PASS' } else { 'FAIL' }) "HTTP $([int]$response.StatusCode)"
  } catch {
    Add-Check $label 'FAIL' $_.Exception.Message
  }
}

$resolvedRoot = (Resolve-Path -LiteralPath $root).Path
Add-Check 'Canonical workspace' 'PASS' $resolvedRoot

$worktreeRows = @(git -C $root worktree list --porcelain | Where-Object { $_ -like 'worktree *' })
if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect Git worktrees.' }
Add-Check 'Git worktrees' $(if ($worktreeRows.Count -eq 1) { 'PASS' } else { 'WARN' }) "$($worktreeRows.Count) registered worktree(s)"

$changes = @(git -C $root status --short)
Add-Check 'Working changes' $(if ($changes.Count) { 'WARN' } else { 'PASS' }) "$($changes.Count) changed or untracked entries"

$snapshotRefs = @(git -C $root for-each-ref --format='%(refname:short)' refs/codex-snapshots/)
Add-Check 'Code recovery refs' $(if ($snapshotRefs.Count) { 'PASS' } else { 'WARN' }) "$($snapshotRefs.Count) recovery reference(s)"

$unifiedIndex = Join-Path $root 'pages-dist\index.html'
$previousIndex = Join-Path $root 'pages-dist.previous\index.html'
Add-Check 'Current unified build' $(if (Test-Path -LiteralPath $unifiedIndex) { 'PASS' } else { 'FAIL' }) $unifiedIndex
Add-Check 'Previous unified build' $(if (Test-Path -LiteralPath $previousIndex) { 'PASS' } else { 'WARN' }) $previousIndex

$sourceRoots = @(
  (Join-Path $root 'src'),
  (Join-Path $root 'shared'),
  (Join-Path $root 'Survey platform for collaboration\src'),
  (Join-Path $root 'riskmap-core-main\src')
)
$latestSource = $sourceRoots | Where-Object { Test-Path -LiteralPath $_ } | ForEach-Object {
  Get-ChildItem -LiteralPath $_ -File -Recurse -Force | Select-Object -ExpandProperty LastWriteTime
} | Sort-Object -Descending | Select-Object -First 1
$buildMarker = Join-Path $root 'pages-dist\.livinglabs-build.json'
if (Test-Path -LiteralPath $buildMarker) {
  $buildInfo = Get-Content -LiteralPath $buildMarker -Raw | ConvertFrom-Json
  $buildWrite = [DateTimeOffset]::Parse([string]$buildInfo.builtAt).LocalDateTime
  Add-Check 'Build freshness' $(if ($latestSource -le $buildWrite) { 'PASS' } else { 'WARN' }) "source=$latestSource; build=$buildWrite; revision=$($buildInfo.sourceRevision)"
} elseif (Test-Path -LiteralPath $unifiedIndex) {
  $buildWrite = (Get-Item -LiteralPath $unifiedIndex).LastWriteTime
  Add-Check 'Build freshness' $(if ($latestSource -le $buildWrite) { 'PASS' } else { 'WARN' }) "legacy source=$latestSource; build=$buildWrite"
}

$analysisContract = Join-Path $root 'riskmap-core-main\src\lib\domain\priority-management\analysisGridContract.js'
$analysisContractTest = Join-Path $root 'scripts\test-ui-analysis-contract.mjs'
Add-Check 'Analysis UI contract' $(if ((Test-Path -LiteralPath $analysisContract) -and (Test-Path -LiteralPath $analysisContractTest)) { 'PASS' } else { 'FAIL' }) $analysisContract
if (Test-Path -LiteralPath $analysisContractTest) {
  & node $analysisContractTest | Out-Null
  Add-Check 'Analysis contract test' $(if ($LASTEXITCODE -eq 0) { 'PASS' } else { 'FAIL' }) $analysisContractTest
}

$platformPid = Get-PortProcessId 4173
if ($platformPid) {
  $platformProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$platformPid" -ErrorAction SilentlyContinue
  $commandLine = [string]$platformProcess.CommandLine
  $normalized = $commandLine.Replace('\', '/').ToLowerInvariant()
  $owned = $normalized.Contains('riskmap-core-main/scripts/vworld-data-proxy.mjs') -and $normalized.Contains('--port=4173')
  Add-Check 'Platform process' $(if ($owned) { 'PASS' } else { 'FAIL' }) "PID $platformPid; $commandLine"
} else {
  Add-Check 'Platform process' 'FAIL' 'Nothing is listening on port 4173.'
}

$pgIsReady = 'D:\90_Data\VWORLD\tools\pgsql-17.11\pgsql\bin\pg_isready.exe'
if (Test-Path -LiteralPath $pgIsReady) {
  & $pgIsReady -h 127.0.0.1 -p 55432 -U postgres | Out-Null
  Add-Check 'PostGIS' $(if ($LASTEXITCODE -eq 0) { 'PASS' } else { 'FAIL' }) '127.0.0.1:55432'
} else {
  Add-Check 'PostGIS' 'FAIL' "Missing pg_isready: $pgIsReady"
}

Test-Url 'Portal route' 'http://127.0.0.1:4173/'
Test-Url 'Flood page' 'http://127.0.0.1:4173/internal-tools/priority-management-area/flood?regionCode=28177' 'data-indicator-code="UFMAX"'
Test-Url 'Platform health' 'http://127.0.0.1:4173/health'
Test-Url 'Cadastre health' 'http://127.0.0.1:4173/cadastre/health'
Test-Url 'Flood health' 'http://127.0.0.1:4173/flood-grid/health'
Test-Url 'UFMAX data' 'http://127.0.0.1:4173/flood-grid?regionCode=28177&indicator=UFMAX' '"indicator":"UFMAX"'

$readme = Join-Path $PortableRoot 'README_FIRST.md'
$inventory = Join-Path $PortableRoot '05_inventory\file_inventory_sha256.csv'
$verifyScript = Join-Path $PortableRoot '05_inventory\verify-package.ps1'
$manifestFiles = @(Get-ChildItem -LiteralPath (Join-Path $PortableRoot '03_database') -File -Filter '*.dump.manifest.json' -ErrorAction SilentlyContinue)

foreach ($required in @($readme, $inventory, $verifyScript)) {
  Add-Check 'Portable package' $(if (Test-Path -LiteralPath $required -PathType Leaf) { 'PASS' } else { 'FAIL' }) $required
}

if ($manifestFiles.Count -eq 1) {
  $manifest = Get-Content -LiteralPath $manifestFiles[0].FullName -Raw | ConvertFrom-Json
  $dumpPath = Join-Path $manifestFiles[0].DirectoryName $manifest.backup_file
  if (Test-Path -LiteralPath $dumpPath -PathType Leaf) {
    $dump = Get-Item -LiteralPath $dumpPath
    $sizeMatches = $dump.Length -eq [int64]$manifest.bytes
    Add-Check 'Database backup size' $(if ($sizeMatches) { 'PASS' } else { 'FAIL' }) "$($dump.Length) bytes"
    Add-Check 'Database backup catalog' $(if ($manifest.pg_restore_list_verified) { 'PASS' } else { 'FAIL' }) "pg_restore_list_verified=$($manifest.pg_restore_list_verified)"
    if ($VerifyBackupHash) {
      $actualHash = (Get-FileHash -LiteralPath $dumpPath -Algorithm SHA256).Hash.ToLowerInvariant()
      $expectedHash = ([string]$manifest.sha256).ToLowerInvariant()
      Add-Check 'Database backup SHA256' $(if ($actualHash -eq $expectedHash) { 'PASS' } else { 'FAIL' }) $actualHash
    } else {
      Add-Check 'Database backup SHA256' 'SKIP' 'Use npm run platform:audit:full for the 11.5 GB hash check.'
    }
  } else {
    Add-Check 'Database backup' 'FAIL' "Missing dump: $dumpPath"
  }
} else {
  Add-Check 'Database backup manifest' 'FAIL' "Expected 1 manifest, found $($manifestFiles.Count)."
}

Write-Host ''
Write-Host 'Living Labs safety audit'
$results | Format-Table -AutoSize -Wrap

$failures = @($results | Where-Object { $_.State -eq 'FAIL' })
if ($failures.Count) {
  Write-Error "Safety audit failed: $($failures.Count) critical check(s)."
  exit 1
}

Write-Host "Safety audit passed with $(@($results | Where-Object { $_.State -eq 'WARN' }).Count) warning(s)."
