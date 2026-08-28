param(
  [string]$SourceRoot = 'D:\90_Data\LivingLabs\imports\2026-08-25_home\flood_admin\urban',
  [string]$WorkRoot = 'D:\90_Data\LivingLabs\work\urban-flood-frequency-import',
  [string]$PgBin = 'D:\90_Data\VWORLD\tools\pgsql-17.11\pgsql\bin',
  [string]$Database = 'livinglabs_postgis',
  [string]$HostName = '127.0.0.1',
  [int]$Port = 55432,
  [string]$UserName = 'postgres',
  [switch]$Resume,
  [switch]$FinalizeOnly
)

$ErrorActionPreference = 'Stop'
$psql = Join-Path $PgBin 'psql.exe'
$shp2pgsql = Join-Path $PgBin 'shp2pgsql.exe'
$extractRoot = Join-Path $WorkRoot 'extract'

foreach ($required in @($SourceRoot, $psql, $shp2pgsql)) {
  if (-not (Test-Path -LiteralPath $required)) { throw "Required path not found: $required" }
}

New-Item -ItemType Directory -Force -Path $WorkRoot | Out-Null
$resolvedWork = (Resolve-Path -LiteralPath $WorkRoot).Path.TrimEnd('\')

function Invoke-Psql {
  param([Parameter(Mandatory)][string]$Sql)
  & $psql -h $HostName -p $Port -U $UserName -d $Database -v ON_ERROR_STOP=1 -c $Sql
  if ($LASTEXITCODE -ne 0) { throw "psql failed with exit code $LASTEXITCODE" }
}

if (-not $Resume -and -not $FinalizeOnly) {
Invoke-Psql @'
DROP SCHEMA IF EXISTS urban_flood_stage CASCADE;
CREATE SCHEMA urban_flood_stage;
CREATE TABLE urban_flood_stage.source_polygons (
  seg_code text,
  fldlv_freq text,
  sgg_cd text,
  geom geometry(MultiPolygon, 5186)
);
'@
}

$importedKeys = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
if ($Resume) {
  $existingKeys = & $psql -h $HostName -p $Port -U $UserName -d $Database -Atc "SELECT DISTINCT fldlv_freq || ':' || sgg_cd FROM urban_flood_stage.source_polygons"
  if ($LASTEXITCODE -ne 0) { throw 'Unable to read existing staging keys.' }
  foreach ($key in $existingKeys) { if ($key) { [void]$importedKeys.Add($key.Trim()) } }
  Write-Host "Resume mode: $($importedKeys.Count) archive keys already staged"
}


if (-not $FinalizeOnly) {
$frequencies = @(50, 80, 100)
$archives = foreach ($frequency in $frequencies) {
  Get-ChildItem -LiteralPath (Join-Path $SourceRoot "${frequency}y") -File -Filter '*.zip' |
    Sort-Object Name |
    ForEach-Object { [pscustomobject]@{ Frequency = $frequency; Archive = $_ } }
}

$processed = 0
foreach ($item in $archives) {
  if (Test-Path -LiteralPath $extractRoot) {
    $resolvedExtract = (Resolve-Path -LiteralPath $extractRoot).Path
    if (-not $resolvedExtract.StartsWith($resolvedWork, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Unsafe extract path: $resolvedExtract"
    }
    Remove-Item -LiteralPath $resolvedExtract -Recurse -Force
  }
  New-Item -ItemType Directory -Path $extractRoot | Out-Null
  Expand-Archive -LiteralPath $item.Archive.FullName -DestinationPath $extractRoot
  $shape = Get-ChildItem -LiteralPath $extractRoot -File -Filter '*.shp' | Select-Object -First 1
  if (-not $shape) { throw "Shapefile not found in $($item.Archive.FullName)" }

  if ($shape.BaseName -notmatch '^CFM_SGG_(\d{5})_(\d{3})$') {
    throw "Unexpected shapefile name: $($shape.Name)"
  }
  $archiveKey = "$($Matches[2]):$($Matches[1])"
  if ($importedKeys.Contains($archiveKey)) {
    $processed += 1
    continue
  }

  $nativeCommand = "`"$shp2pgsql`" -a -D -s 5186 -W CP949 `"$($shape.FullName)`" urban_flood_stage.source_polygons | `"$psql`" -h $HostName -p $Port -U $UserName -d $Database -v ON_ERROR_STOP=1"
  & $env:ComSpec /d /s /c $nativeCommand | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Import failed: $($item.Archive.FullName)" }

  [void]$importedKeys.Add($archiveKey)
  $processed += 1
  if (($processed % 25) -eq 0 -or $processed -eq $archives.Count) {
    Write-Host "Imported $processed / $($archives.Count) archives"
  }
}
}

Invoke-Psql @'
DELETE FROM urban_flood_stage.source_polygons
WHERE fldlv_freq NOT IN ('050', '080', '100')
   OR seg_code !~ '^N33[0-4]$'
   OR geom IS NULL;

CREATE TABLE urban_flood_stage.parts AS
SELECT fldlv_freq::integer AS frequency_year,
       CASE right(seg_code, 1)
         WHEN '0' THEN 0.25::real
         WHEN '1' THEN 0.75::real
         WHEN '2' THEN 1.50::real
         WHEN '3' THEN 3.50::real
         WHEN '4' THEN 5.00::real
       END AS depth_m,
       sgg_cd,
       subdivided.geom::geometry(Polygon, 5186) AS geom
FROM urban_flood_stage.source_polygons source
CROSS JOIN LATERAL ST_Dump(source.geom) input_part
CROSS JOIN LATERAL ST_Dump(
  CASE WHEN ST_IsValid(input_part.geom)
    THEN input_part.geom
    ELSE ST_CollectionExtract(ST_MakeValid(input_part.geom), 3)
  END
) valid_part
CROSS JOIN LATERAL ST_Subdivide(valid_part.geom, 256) AS subdivided(geom);

CREATE INDEX urban_flood_stage_parts_geom_gix ON urban_flood_stage.parts USING gist (geom);
ANALYZE urban_flood_stage.parts;

ALTER TABLE analysis.flood_values_100m
  ADD COLUMN IF NOT EXISTS uf50 real,
  ADD COLUMN IF NOT EXISTS uf80 real,
  ADD COLUMN IF NOT EXISTS uf100 real;

CREATE UNLOGGED TABLE urban_flood_stage.grid_cells_5186 AS
SELECT cell_id,
       ST_Transform(geom, 5186)::geometry(Point, 5186) AS geom
FROM analysis.grid_cells_100m;
CREATE UNIQUE INDEX urban_flood_stage_grid_cells_5186_pk ON urban_flood_stage.grid_cells_5186 (cell_id);
CREATE INDEX urban_flood_stage_grid_cells_5186_geom_gix ON urban_flood_stage.grid_cells_5186 USING gist (geom);
ANALYZE urban_flood_stage.grid_cells_5186;

CREATE UNLOGGED TABLE urban_flood_stage.mapped_cells AS
SELECT cells.cell_id,
       max(parts.depth_m) FILTER (WHERE parts.frequency_year = 50) AS uf50,
       max(parts.depth_m) FILTER (WHERE parts.frequency_year = 80) AS uf80,
       max(parts.depth_m) FILTER (WHERE parts.frequency_year = 100) AS uf100
FROM urban_flood_stage.parts parts
JOIN urban_flood_stage.grid_cells_5186 cells
  ON cells.geom && parts.geom
 AND ST_Covers(parts.geom, cells.geom)
GROUP BY cells.cell_id;

CREATE UNIQUE INDEX urban_flood_stage_mapped_cells_pk ON urban_flood_stage.mapped_cells (cell_id);
ANALYZE urban_flood_stage.mapped_cells;

INSERT INTO analysis.flood_values_100m (version_id, cell_id, uf50, uf80, uf100)
SELECT versions.version_id, mapped.cell_id, mapped.uf50, mapped.uf80, mapped.uf100
FROM urban_flood_stage.mapped_cells mapped
CROSS JOIN LATERAL (
  SELECT version_id
  FROM analysis.flood_dataset_versions
  WHERE dataset_key = 'national-2024-v1'
  LIMIT 1
) versions
ON CONFLICT (version_id, cell_id) DO UPDATE
SET uf50 = EXCLUDED.uf50,
    uf80 = EXCLUDED.uf80,
    uf100 = EXCLUDED.uf100,
    updated_at = now();

ALTER TABLE analysis.flood_region_indicator_stats
  DROP CONSTRAINT IF EXISTS flood_region_indicator_stats_indicator_code_check;
ALTER TABLE analysis.flood_region_indicator_stats
  ADD CONSTRAINT flood_region_indicator_stats_indicator_code_check
  CHECK (indicator_code IN ('FH01','FH02','FH03','UF50','UF80','UF100','FE01','FE02','FE03'));

WITH indicator_defs(indicator_code, column_name, frequency_year, source_resolution) AS (
  VALUES
    ('UF50', 'uf50', 50, 'Urban flood 50-year source polygons aligned to EPSG:5179 national 100m cell centers; class depth midpoints'),
    ('UF80', 'uf80', 80, 'Urban flood 80-year source polygons aligned to EPSG:5179 national 100m cell centers; class depth midpoints'),
    ('UF100', 'uf100', 100, 'Urban flood 100-year source polygons aligned to EPSG:5179 national 100m cell centers; class depth midpoints')
), region_values AS (
  SELECT defs.indicator_code,
         defs.frequency_year,
         defs.source_resolution,
         regional.region_code,
         count(value.raw_value) AS valid_cells,
         avg(value.raw_value) AS raw_mean
  FROM indicator_defs defs
  CROSS JOIN analysis.region_grid_cells_100m regional
  LEFT JOIN analysis.flood_values_100m flood
    ON flood.cell_id = regional.cell_id
   AND flood.version_id = (SELECT version_id FROM analysis.flood_dataset_versions WHERE dataset_key = 'national-2024-v1')
  LEFT JOIN LATERAL (
    SELECT CASE defs.column_name
      WHEN 'uf50' THEN flood.uf50
      WHEN 'uf80' THEN flood.uf80
      WHEN 'uf100' THEN flood.uf100
    END AS raw_value
  ) value ON true
  GROUP BY defs.indicator_code, defs.frequency_year, defs.source_resolution, regional.region_code
), base AS (
  SELECT stats.version_id, stats.region_code, stats.payload
  FROM analysis.flood_region_indicator_stats stats
  WHERE stats.indicator_code = 'FH01'
)
INSERT INTO analysis.flood_region_indicator_stats (version_id, region_code, indicator_code, payload, updated_at)
SELECT base.version_id,
       values.region_code,
       values.indicator_code,
       base.payload
       || jsonb_build_object(
            'indicator', values.indicator_code,
            'referencePeriod', values.frequency_year || '-year frequency',
            'sourceResolution', values.source_resolution,
            'stats', (base.payload->'stats') || jsonb_build_object(
              'rawMin', 0,
              'rawMax', 5,
              'rawMean', round(coalesce(values.raw_mean, 0)::numeric, 6),
              'validCells', values.valid_cells,
              'mean', round((coalesce(values.raw_mean, 0) / 5)::numeric, 6),
              'normalizedMean', round((coalesce(values.raw_mean, 0) / 5)::numeric, 6)
            )
          ),
       now()
FROM region_values values
JOIN base ON base.region_code = values.region_code
ON CONFLICT (version_id, region_code, indicator_code) DO UPDATE
SET payload = EXCLUDED.payload,
    updated_at = now();

UPDATE analysis.flood_dataset_versions
SET source_metadata = jsonb_set(
      source_metadata,
      '{urban_flood_frequencies}',
      jsonb_build_object('30', 'FH01', '50', 'UF50', '80', 'UF80', '100', 'UF100'),
      true
    ),
    updated_at = now()
WHERE dataset_key = 'national-2024-v1';

ANALYZE analysis.flood_values_100m;
'@

Invoke-Psql @'
SELECT 'UF50' AS indicator, count(uf50) AS cells, min(uf50) AS min_depth, max(uf50) AS max_depth FROM analysis.flood_values_100m
UNION ALL
SELECT 'UF80', count(uf80), min(uf80), max(uf80) FROM analysis.flood_values_100m
UNION ALL
SELECT 'UF100', count(uf100), min(uf100), max(uf100) FROM analysis.flood_values_100m
ORDER BY indicator;
'@

Invoke-Psql 'DROP SCHEMA urban_flood_stage CASCADE;'
if (Test-Path -LiteralPath $extractRoot) { Remove-Item -LiteralPath $extractRoot -Recurse -Force }
Write-Host 'Urban flood frequency import completed.'
