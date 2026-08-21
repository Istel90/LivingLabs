param(
  [string]$PgHome = 'D:\90_Data\VWORLD\tools\pgsql-17.11\pgsql',
  [string]$DataDir = 'D:\90_Data\VWORLD\postgresql\data'
)

$ErrorActionPreference = 'Stop'
$pgCtl = Join-Path $PgHome 'bin\pg_ctl.exe'

& $pgCtl -D $DataDir stop -m fast
if ($LASTEXITCODE -ne 0) {
  throw "Unable to stop VWorld PostGIS"
}
