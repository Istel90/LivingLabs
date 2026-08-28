param(
  [string]$PgHome = 'D:\90_Data\VWORLD\tools\pgsql-17.11\pgsql',
  [string]$DataDir = 'D:\90_Data\VWORLD\postgresql\data',
  [string]$LogFile = 'D:\90_Data\VWORLD\postgresql\logs\postgresql.log',
  [int]$Port = 55432
)

$ErrorActionPreference = 'Stop'
$pgCtl = Join-Path $PgHome 'bin\pg_ctl.exe'
$pgIsReady = Join-Path $PgHome 'bin\pg_isready.exe'

& $pgIsReady -h 127.0.0.1 -p $Port -U postgres | Out-Null
if ($LASTEXITCODE -eq 0) {
  Write-Output "VWorld PostGIS is already running on 127.0.0.1:$Port"
  exit 0
}

& $pgCtl -D $DataDir -l $LogFile -o "`"-p $Port -h 127.0.0.1`"" start
if ($LASTEXITCODE -ne 0) {
  throw "Unable to start VWorld PostGIS"
}

& $pgIsReady -h 127.0.0.1 -p $Port -U postgres
