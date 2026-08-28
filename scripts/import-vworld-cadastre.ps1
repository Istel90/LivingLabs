param(
  [string]$PgHome = 'D:\90_Data\VWORLD\tools\pgsql-17.11\pgsql',
  [string]$SourceRoot = 'D:\90_Data\VWORLD\continuous_cadastral\2026-08-08\extracted',
  [string]$HostName = '127.0.0.1',
  [int]$Port = 55432,
  [string]$Database = 'vworld_cadastral',
  [string]$Schema = 'cadastre',
  [string]$Table = 'parcels'
)

$ErrorActionPreference = 'Stop'

$shp2pgsql = Join-Path $PgHome 'bin\shp2pgsql.exe'
$psql = Join-Path $PgHome 'bin\psql.exe'

foreach ($required in @($shp2pgsql, $psql, $SourceRoot)) {
  if (-not (Test-Path -LiteralPath $required)) {
    throw "Required path does not exist: $required"
  }
}

$env:PGCLIENTENCODING = 'UTF8'

$qualifiedTable = "$Schema.$Table"
$connection = "PG:host=$HostName port=$Port dbname=$Database user=postgres"
$shapefiles = @(Get-ChildItem -LiteralPath $SourceRoot -File -Recurse -Filter 'AL_*.shp' | Sort-Object FullName)

if ($shapefiles.Count -eq 0) {
  throw "No AL_*.shp files found under $SourceRoot"
}

function Get-DbfRecordCount([string]$dbfPath) {
  $reader = [IO.BinaryReader]::new([IO.File]::OpenRead($dbfPath))
  try {
    $reader.BaseStream.Seek(4, [IO.SeekOrigin]::Begin) | Out-Null
    return [uint32]$reader.ReadInt32()
  } finally {
    $reader.Dispose()
  }
}

function Invoke-PsqlScalar([string]$sql) {
  $value = & $psql -h $HostName -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1 -Atc $sql
  if ($LASTEXITCODE -ne 0) {
    throw "psql failed with exit code $LASTEXITCODE"
  }
  return ($value | Select-Object -Last 1).Trim()
}

$tableExists = (Invoke-PsqlScalar "SELECT to_regclass('$qualifiedTable') IS NOT NULL;") -eq 't'
$loadedFiles = @{}
& $psql -h $HostName -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1 -Atc "SELECT source_file FROM $Schema.import_log WHERE status='loaded';" |
  ForEach-Object { $loadedFiles[$_.Trim()] = $true }
if ($LASTEXITCODE -ne 0) {
  throw "Unable to read import log"
}

$index = 0
foreach ($shapefile in $shapefiles) {
  $index++
  $sourceFile = $shapefile.Name
  if ($loadedFiles.ContainsKey($sourceFile)) {
    Write-Output "[$index/$($shapefiles.Count)] Skip completed $sourceFile"
    continue
  }

  $dbfPath = [IO.Path]::ChangeExtension($shapefile.FullName, '.dbf')
  $expectedRows = Get-DbfRecordCount $dbfPath
  Write-Output "[$index/$($shapefiles.Count)] Import $sourceFile ($expectedRows rows)"

  $beforeRows = if ($tableExists) { [int64](Invoke-PsqlScalar "SELECT count(*) FROM $qualifiedTable;") } else { 0 }
  $mode = if ($tableExists) { '-a' } else { '-c' }
  $escapedShapePath = $shapefile.FullName.Replace('"', '""')
  $escapedTable = $qualifiedTable.Replace('"', '""')
  $command = "`"$shp2pgsql`" -D -Z -s 5186 -g geom -W EUC-KR $mode `"$escapedShapePath`" `"$escapedTable`" | `"$psql`" -h $HostName -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1"

  & $env:ComSpec /d /s /c $command
  if ($LASTEXITCODE -ne 0) {
    throw "shp2pgsql/psql failed for $sourceFile with exit code $LASTEXITCODE"
  }

  $afterRows = [int64](Invoke-PsqlScalar "SELECT count(*) FROM $qualifiedTable;")
  $importedRows = $afterRows - $beforeRows
  if ($importedRows -ne $expectedRows) {
    throw "Row-count mismatch for ${sourceFile}: expected $expectedRows, imported $importedRows"
  }

  $escapedSource = $sourceFile.Replace("'", "''")
  Invoke-PsqlScalar "INSERT INTO $Schema.import_log(source_file, expected_rows, imported_rows, status) VALUES ('$escapedSource', $expectedRows, $importedRows, 'loaded') ON CONFLICT (source_file) DO UPDATE SET expected_rows=EXCLUDED.expected_rows, imported_rows=EXCLUDED.imported_rows, imported_at=now(), status='loaded';" | Out-Null
  $tableExists = $true
  Write-Output "[$index/$($shapefiles.Count)] Loaded $sourceFile"
}

$expectedTotal = Invoke-PsqlScalar "SELECT sum(expected_rows) FROM $Schema.import_log WHERE status='loaded';"
$actualTotal = Invoke-PsqlScalar "SELECT count(*) FROM $qualifiedTable;"
Write-Output "Import complete. Expected rows: $expectedTotal; actual rows: $actualTotal"

if ([int64]$expectedTotal -ne [int64]$actualTotal) {
  throw "Row-count mismatch: expected $expectedTotal, actual $actualTotal"
}
