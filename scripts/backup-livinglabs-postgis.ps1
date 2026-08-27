param(
  [string]$PgHome = 'D:\90_Data\VWORLD\tools\pgsql-17.11\pgsql',
  [string]$OutputDirectory = 'D:\90_Data\LivingLabs\transfer_to_other_pc',
  [string]$HostName = '127.0.0.1',
  [int]$Port = 55432,
  [string]$Database = 'livinglabs_postgis',
  [int]$CompressionLevel = 6,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
function Get-Sha256Hex {
  param([Parameter(Mandatory = $true)][string]$Path)

  $stream = [System.IO.File]::OpenRead($Path)
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha256.Dispose()
    $stream.Dispose()
  }
}
$pgDump = Join-Path $PgHome 'bin\pg_dump.exe'
$pgIsReady = Join-Path $PgHome 'bin\pg_isready.exe'
$psql = Join-Path $PgHome 'bin\psql.exe'

foreach ($required in @($pgDump, $pgIsReady, $psql)) {
  if (-not (Test-Path -LiteralPath $required)) {
    throw "Required PostgreSQL tool does not exist: $required"
  }
}

& $pgIsReady -h $HostName -p $Port -U postgres -d $Database | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "PostGIS is not ready at ${HostName}:$Port/$Database"
}

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$dateLabel = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$dumpFile = Join-Path $OutputDirectory "livinglabs_postgis_full_$dateLabel.dump"
$manifestFile = "$dumpFile.manifest.json"

if ((Test-Path -LiteralPath $dumpFile) -and -not $Force) {
  throw "Dump already exists: $dumpFile. Use -Force only when replacement is intended."
}

& $pgDump `
  -h $HostName `
  -p $Port `
  -U postgres `
  -d $Database `
  -Fc `
  -Z "zstd:$CompressionLevel" `
  --no-owner `
  --no-acl `
  -f $dumpFile

if ($LASTEXITCODE -ne 0) {
  throw "PostGIS backup failed with exit code $LASTEXITCODE."
}

$dump = Get-Item -LiteralPath $dumpFile
$hash = Get-Sha256Hex -Path $dumpFile
$databaseBytes = [long](& $psql -h $HostName -p $Port -U postgres -d $Database -Atc 'SELECT pg_database_size(current_database());')
$postgisVersion = (& $psql -h $HostName -p $Port -U postgres -d $Database -Atc 'SELECT postgis_full_version();').Trim()
$repoRoot = Split-Path -Parent $PSScriptRoot
$gitBranch = (& git -C $repoRoot rev-parse --abbrev-ref HEAD 2>$null)
$gitCommit = (& git -C $repoRoot rev-parse HEAD 2>$null)
$requiredTables = @(
  'cadastre.parcels',
  'analysis.grid_cells_100m',
  'analysis.region_grid_cells_100m',
  'analysis.flood_values_100m',
  'analysis.hev_values_100m',
  'analysis.flood_building_sensitivity_100m',
  'analysis.kma_extreme_rainfall_grid_100m',
  'analysis.civil_defense_shelter_points',
  'analysis.national_road_links',
  'population.grid_100m'
)
$manifest = [ordered]@{
  schemaVersion = 'livinglabs-postgis-transfer/v1'
  createdAt = (Get-Date).ToString('o')
  database = $Database
  source = "${HostName}:$Port"
  dumpFile = $dump.Name
  bytes = $dump.Length
  sourceDatabaseBytes = $databaseBytes
  postgisVersion = $postgisVersion
  git = [ordered]@{
    branch = $gitBranch
    commit = $gitCommit
  }
  sha256 = $hash
  requiredSchemas = @('cadastre', 'analysis', 'raw', 'population')
  requiredTables = $requiredTables
  rawSourceDataRequiredForRestore = $false
  rawSourceDataRequiredForRebuildOrUpdate = $true
  rawSourceRoots = @(
    'D:\90_Data\VWORLD',
    'D:\90_Data\LivingLabs'
  )
  restoreScript = 'scripts/restore-livinglabs-postgis.ps1'
}

$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestFile -Encoding utf8
Write-Output "Created: $dumpFile"
Write-Output "Manifest: $manifestFile"

