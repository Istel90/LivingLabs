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

if ($Database -notmatch '^[A-Za-z0-9_]+$') {
  throw ('Invalid database name: {0}' -f $Database)
}

$dumpPath = (Resolve-Path -LiteralPath $DumpFile).Path
$createdb = Join-Path $PgHome 'bin\createdb.exe'
$dropdb = Join-Path $PgHome 'bin\dropdb.exe'
$pgRestore = Join-Path $PgHome 'bin\pg_restore.exe'
$psql = Join-Path $PgHome 'bin\psql.exe'

foreach ($required in @($createdb, $dropdb, $pgRestore, $psql, $dumpPath)) {
  if (-not (Test-Path -LiteralPath $required)) {
    throw "Required path does not exist: $required"
  }
}

$manifestPath = $dumpPath + '.manifest.json'
if (Test-Path -LiteralPath $manifestPath) {
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  $actualHash = (Get-FileHash -LiteralPath $dumpPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne $manifest.sha256) {
    throw ('Backup checksum mismatch. Expected {0}, got {1}' -f $manifest.sha256, $actualHash)
  }
  Write-Output ('Checksum verified: {0}' -f $actualHash)
} else {
  Write-Warning ('Manifest not found: {0}' -f $manifestPath)
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
  $dumpPath

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
  to_regclass('population.grid_100m') IS NOT NULL AS population_ready,
  to_regclass('analysis.civil_defense_shelter_points') IS NOT NULL AS shelter_points_ready,
  to_regclass('analysis.national_road_links') IS NOT NULL AS road_links_ready;
'@

& $psql -h $HostName -p $Port -U postgres -d $Database -P pager=off -c $validationSql
if ($LASTEXITCODE -ne 0) { throw 'Restore validation failed.' }

Write-Output "LivingLabs PostGIS restore completed: ${HostName}:$Port/$Database"
