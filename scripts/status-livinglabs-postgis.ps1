param(
  [string]$PgHome = 'D:\90_Data\VWORLD\tools\pgsql-17.11\pgsql',
  [string]$HostName = '127.0.0.1',
  [int]$Port = 55432,
  [string]$Database = 'livinglabs_postgis'
)

$ErrorActionPreference = 'Stop'
$psql = Join-Path $PgHome 'bin\psql.exe'
$pgIsReady = Join-Path $PgHome 'bin\pg_isready.exe'

foreach ($required in @($psql, $pgIsReady)) {
  if (-not (Test-Path -LiteralPath $required)) {
    throw "Required PostgreSQL tool does not exist: $required"
  }
}

& $pgIsReady -h $HostName -p $Port -U postgres -d $Database
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$statusSql = @'
SELECT
  current_database() AS database,
  pg_size_pretty(pg_database_size(current_database())) AS database_size,
  postgis_lib_version() AS postgis_version;

SELECT
  table_name,
  CASE
    WHEN relation IS NULL THEN false
    ELSE true
  END AS ready,
  COALESCE(reltuples::bigint, 0) AS estimated_rows
FROM (
  VALUES
    ('cadastre.parcels', to_regclass('cadastre.parcels')),
    ('analysis.grid_cells_100m', to_regclass('analysis.grid_cells_100m')),
    ('analysis.flood_values_100m', to_regclass('analysis.flood_values_100m')),
    ('analysis.hev_values_100m', to_regclass('analysis.hev_values_100m')),
    ('analysis.civil_defense_shelter_points', to_regclass('analysis.civil_defense_shelter_points')),
    ('population.grid_100m', to_regclass('population.grid_100m'))
) AS required(table_name, relation)
LEFT JOIN pg_class ON pg_class.oid = relation
ORDER BY table_name;
'@

& $psql -h $HostName -p $Port -U postgres -d $Database -P pager=off -c $statusSql
if ($LASTEXITCODE -ne 0) {
  throw 'LivingLabs PostGIS status check failed.'
}
