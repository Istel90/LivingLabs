param(
  [string]$PgHome = 'D:\90_Data\VWORLD\tools\pgsql-17.11\pgsql',
  [string]$DumpFile = 'D:\90_Data\VWORLD\transfer_to_other_pc\vworld_cadastral_2026-08-08.dump',
  [string]$HostName = '127.0.0.1',
  [int]$Port = 55432,
  [string]$Database = 'vworld_cadastral',
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

& $pgRestore -h $HostName -p $Port -U postgres -d $Database --no-owner --no-acl --exit-on-error --jobs=4 $DumpFile
if ($LASTEXITCODE -ne 0) { throw "PostGIS restore failed with exit code $LASTEXITCODE." }

& $psql -h $HostName -p $Port -U postgres -d $Database -P pager=off -c "SELECT count(*) AS parcel_count, min(a6) AS earliest_reference_date, max(a6) AS latest_reference_date FROM cadastre.parcels;"
if ($LASTEXITCODE -ne 0) { throw "Restore validation failed." }
