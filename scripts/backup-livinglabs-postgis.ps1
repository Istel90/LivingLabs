param(
  [string]$PgHome = 'D:\90_Data\VWORLD\tools\pgsql-17.11\pgsql',
  [string]$OutputDirectory = 'D:\90_Data\VWORLD\transfer_to_other_pc',
  [string]$HostName = '127.0.0.1',
  [int]$Port = 55432,
  [string]$Database = 'vworld_cadastral',
  [int]$CompressionLevel = 6,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$pgDump = Join-Path $PgHome 'bin\pg_dump.exe'
$pgIsReady = Join-Path $PgHome 'bin\pg_isready.exe'

foreach ($required in @($pgDump, $pgIsReady)) {
  if (-not (Test-Path -LiteralPath $required)) {
    throw "Required PostgreSQL tool does not exist: $required"
  }
}

& $pgIsReady -h $HostName -p $Port -U postgres -d $Database | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "PostGIS is not ready at ${HostName}:$Port/$Database"
}

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$dateLabel = Get-Date -Format 'yyyy-MM-dd'
$dumpFile = Join-Path $OutputDirectory "livinglabs_postgis_full_$dateLabel.dump"
$manifestFile = "$dumpFile.manifest.json"

if ((Test-Path -LiteralPath $dumpFile) -and -not $Force) {
  throw "Dump already exists: $dumpFile. Use -Force only when replacement is intended."
}

& $pgDump `
  -h $HostName `
  -p $Port `
  -U postgres `
  -d $Database `
  -Fc `
  -Z "zstd:$CompressionLevel" `
  --no-owner `
  --no-acl `
  -f $dumpFile

if ($LASTEXITCODE -ne 0) {
  throw "PostGIS backup failed with exit code $LASTEXITCODE."
}

$dump = Get-Item -LiteralPath $dumpFile
$hash = Get-FileHash -LiteralPath $dumpFile -Algorithm SHA256
$manifest = [ordered]@{
  schemaVersion = 'livinglabs-postgis-transfer/v1'
  createdAt = (Get-Date).ToString('o')
  database = $Database
  source = "${HostName}:$Port"
  dumpFile = $dump.Name
  bytes = $dump.Length
  sha256 = $hash.Hash.ToLowerInvariant()
  requiredSchemas = @('cadastre', 'analysis', 'raw', 'population')
  restoreScript = 'scripts/restore-livinglabs-postgis.ps1'
}

$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestFile -Encoding utf8
Write-Output "Created: $dumpFile"
Write-Output "Manifest: $manifestFile"

