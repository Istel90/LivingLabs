param(
  [string]$PgHome = 'C:\Program Files\PostgreSQL\17',
  [Parameter(Mandatory = $true)]
  [string]$DumpFile,
  [string]$HostName = '127.0.0.1',
  [int]$Port = 5432,
  [string]$Database = 'vworld_cadastral',
  [int]$Jobs = 4,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$createdb = Join-Path $PgHome 'bin\createdb.exe'
$dropdb = Join-Path $PgHome 'bin\dropdb.exe'
$pgRestore = Join-Path $PgHome 'bin\pg_restore.exe'
$psql = Join-Path $PgHome 'bin\psql.exe'

foreach ($required in @($createdb, $dropdb, $pgRestore, $psql, $DumpFile)) {
  if (-not (Test-Path -LiteralPath $required)) {
    throw "Required path does not exist: $required"
  }
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
'@

& $psql -h $HostName -p $Port -U postgres -d $Database -P pager=off -c $validationSql
if ($LASTEXITCODE -ne 0) { throw 'Restore validation failed.' }

Write-Output "LivingLabs PostGIS restore completed: ${HostName}:$Port/$Database"
