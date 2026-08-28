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
  c.reltuples::bigint AS estimated_parcel_count,
  pg_size_pretty(pg_total_relation_size('cadastre.parcels')) AS total_size
FROM pg_class c
WHERE c.oid = 'cadastre.parcels'::regclass;
'@
