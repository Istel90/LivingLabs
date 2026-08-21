param(
  [string]$PgHome = 'D:\90_Data\VWORLD\tools\pgsql-17.11\pgsql',
  [string]$HostName = '127.0.0.1',
  [int]$Port = 55432,
  [string]$Database = 'vworld_cadastral'
)

$ErrorActionPreference = 'Stop'
$psql = Join-Path $PgHome 'bin\psql.exe'
$pgIsReady = Join-Path $PgHome 'bin\pg_isready.exe'

& $pgIsReady -h $HostName -p $Port -U postgres
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

& $psql -h $HostName -p $Port -U postgres -d $Database -P pager=off -c @'
SELECT
  count(*) AS parcel_count,
  min(a6) AS earliest_reference_date,
  max(a6) AS latest_reference_date,
  pg_size_pretty(pg_total_relation_size('cadastre.parcels')) AS total_size
FROM cadastre.parcels;
'@
