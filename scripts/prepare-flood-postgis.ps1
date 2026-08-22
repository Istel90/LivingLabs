param(
  [string]$PgHome = 'D:\90_Data\VWORLD\tools\pgsql-17.11\pgsql',
  [string]$HostName = '127.0.0.1',
  [int]$Port = 55432,
  [string]$Database = 'vworld_cadastral',
  [string]$User = 'postgres'
)
$ErrorActionPreference = 'Stop'
$psql = Join-Path $PgHome 'bin\psql.exe'
$schemaFile = Join-Path $PSScriptRoot 'prepare-flood-grid.sql'
foreach ($required in @($psql, $schemaFile)) {
  if (-not (Test-Path -LiteralPath $required)) { throw "Required path does not exist: $required" }
}
& $psql -v ON_ERROR_STOP=1 -h $HostName -p $Port -U $User -d $Database -f $schemaFile
if ($LASTEXITCODE -ne 0) { throw 'Unable to prepare flood PostGIS schema.' }
& $psql -h $HostName -p $Port -U $User -d $Database -P pager=off -c @"
SELECT d.dataset_key,
       (SELECT count(*) FROM analysis.flood_values_100m WHERE version_id = d.version_id) AS value_cells,
       (SELECT count(*) FROM analysis.flood_region_indicator_stats WHERE version_id = d.version_id) AS region_indicators
FROM analysis.flood_dataset_versions d
WHERE d.active = true
ORDER BY d.version_id;
"@
