param(
  [string]$PgHome = 'D:\90_Data\VWORLD\tools\pgsql-17.11\pgsql',
  [Parameter(Mandatory = $true)]
  [string]$DumpFile,
  [string]$ExpectedSha256 = '',
  [string]$HostName = '127.0.0.1',
  [int]$Port = 55432,
  [string]$Database = 'vworld_cadastral',
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
    throw ('Required path does not exist: {0}' -f $required)
  }
}

if ($ExpectedSha256) {
  $actualHash = (Get-FileHash -LiteralPath $dumpPath -Algorithm SHA256).Hash.ToUpperInvariant()
  if ($actualHash -ne $ExpectedSha256.ToUpperInvariant()) {
    throw ('Backup checksum mismatch. Expected {0}, got {1}' -f $ExpectedSha256, $actualHash)
  }
  Write-Output ('Checksum verified: {0}' -f $actualHash)
}

$existsSql = 'SELECT 1 FROM pg_database WHERE datname=''' + $Database + ''';'
$exists = (& $psql -h $HostName -p $Port -U postgres -d postgres -Atc $existsSql) -eq '1'
if ($exists -and -not $Force) {
  throw ('Database {0} already exists. Use -Force only when it is safe to replace it.' -f $Database)
}

if ($exists) {
  & $dropdb -h $HostName -p $Port -U postgres --force $Database
  if ($LASTEXITCODE -ne 0) { throw ('Unable to replace database {0}.' -f $Database) }
}

& $createdb -h $HostName -p $Port -U postgres $Database
if ($LASTEXITCODE -ne 0) { throw ('Unable to create database {0}.' -f $Database) }

& $pgRestore -h $HostName -p $Port -U postgres -d $Database --no-owner --no-acl --exit-on-error --jobs $Jobs $dumpPath
if ($LASTEXITCODE -ne 0) { throw ('PostGIS restore failed with exit code {0}.' -f $LASTEXITCODE) }

$validationSql = @'
SELECT
  pg_size_pretty(pg_database_size(current_database())) AS database_size,
  EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') AS postgis_ready,
  to_regclass('cadastre.parcels') IS NOT NULL AS parcels_ready,
  to_regclass('cadastre.parcels_readable') IS NOT NULL AS readable_view_ready;
'@

& $psql -h $HostName -p $Port -U postgres -d $Database -P pager=off -c $validationSql
if ($LASTEXITCODE -ne 0) { throw 'Restore validation failed.' }

Write-Output ('VWorld PostGIS restore completed: {0}:{1}/{2}' -f $HostName, $Port, $Database)
