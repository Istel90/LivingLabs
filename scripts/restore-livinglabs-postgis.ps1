param(
  [string]$PgHome = 'D:\90_Data\VWORLD\tools\pgsql-17.11\pgsql',
  [Parameter(Mandatory = $true)]
  [string]$DumpFile,
  [string]$HostName = '127.0.0.1',
  [int]$Port = 55432,
  [string]$Database = 'livinglabs_postgis',
  [int]$Jobs = 4,
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
if ($Database -notmatch '^[A-Za-z0-9_]+$') {
  throw "Invalid database name: $Database"
}

$createdb = Join-Path $PgHome 'bin\createdb.exe'
$dropdb = Join-Path $PgHome 'bin\dropdb.exe'
$pgRestore = Join-Path $PgHome 'bin\pg_restore.exe'
$psql = Join-Path $PgHome 'bin\psql.exe'

foreach ($required in @($createdb, $dropdb, $pgRestore, $psql, $DumpFile)) {
  if (-not (Test-Path -LiteralPath $required)) {
    throw "Required path does not exist: $required"
  }
}

$manifestFile = "$DumpFile.manifest.json"
if (Test-Path -LiteralPath $manifestFile) {
  $manifest = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
  $actualHash = Get-Sha256Hex -Path $DumpFile
  if ($actualHash -ne $manifest.sha256) {
    throw "Backup checksum mismatch. Expected $($manifest.sha256), got $actualHash"
  }
  Write-Output "Checksum verified: $actualHash"
} else {
  Write-Warning "Manifest not found: $manifestFile. Restore will continue without checksum verification."
}

$databaseExists = (& $psql -h $HostName -p $Port -U postgres -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname='$Database';") -eq '1'
if ($databaseExists -and -not $Force) {
  throw "Database '$Database' already exists. Use -Force only when it is safe to replace it."
}

if ($databaseExists) {
  & $dropdb -h $HostName -p $Port -U postgres --force $Database
  if ($LASTEXITCODE -ne 0) { throw "Unable to replace database '$Database'." }
}

& $createdb -h $HostName -p $Port -U postgres $Database
if ($LASTEXITCODE -ne 0) { throw "Unable to create database '$Database'." }

& $pgRestore `
  -h $HostName `
  -p $Port `
  -U postgres `
  -d $Database `
  --no-owner `
  --no-acl `
  --exit-on-error `
  --jobs $Jobs `
  $DumpFile

if ($LASTEXITCODE -ne 0) {
  throw "PostGIS restore failed with exit code $LASTEXITCODE."
}

$validationSql = @'
SELECT
  pg_size_pretty(pg_database_size(current_database())) AS database_size,
  to_regclass('cadastre.parcels') IS NOT NULL AS cadastre_ready,
  to_regclass('analysis.grid_cells_100m') IS NOT NULL AS grid_ready,
  to_regclass('analysis.flood_values_100m') IS NOT NULL AS flood_ready,
  to_regclass('analysis.hev_values_100m') IS NOT NULL AS hev_ready,
  to_regclass('analysis.flood_building_sensitivity_100m') IS NOT NULL AS building_ready,
  to_regclass('analysis.kma_extreme_rainfall_grid_100m') IS NOT NULL AS rainfall_ready,
  to_regclass('population.grid_100m') IS NOT NULL AS population_ready;
  to_regclass('analysis.civil_defense_shelter_points') IS NOT NULL AS shelter_points_ready,
  to_regclass('analysis.national_road_links') IS NOT NULL AS road_links_ready,
'@

& $psql -h $HostName -p $Port -U postgres -d $Database -P pager=off -c $validationSql
if ($LASTEXITCODE -ne 0) { throw 'Restore validation failed.' }

Write-Output "LivingLabs PostGIS restore completed: ${HostName}:$Port/$Database"
