param(
  [string]$SourceRoot = 'D:\90_Data\LivingLabs\imports\2026-08-25_home\flood_admin\urban\max',
  [string]$WorkRoot = 'D:\90_Data\LivingLabs\work\urban-flood-max-import',
  [string]$PgBin = 'D:\90_Data\VWORLD\tools\pgsql-17.11\pgsql\bin',
  [string]$Database = 'livinglabs_postgis',
  [string]$HostName = '127.0.0.1',
  [int]$Port = 55432,
  [string]$UserName = 'postgres'
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

Invoke-Psql @'
DROP SCHEMA IF EXISTS urban_flood_max_stage CASCADE;
CREATE SCHEMA urban_flood_max_stage;
CREATE TABLE urban_flood_max_stage.source_polygons (
  seg_code text,
  fldlv_freq text,
  sgg_cd text,
  geom geometry(MultiPolygon, 5186)
);
'@

$archives = @(Get-ChildItem -LiteralPath $SourceRoot -File -Filter '*.zip' | Sort-Object Name)
if ($archives.Count -eq 0) { throw "No ZIP archives found in $SourceRoot" }

$processed = 0
foreach ($archive in $archives) {
  if (Test-Path -LiteralPath $extractRoot) {
    $resolvedExtract = (Resolve-Path -LiteralPath $extractRoot).Path
    if (-not $resolvedExtract.StartsWith($resolvedWork, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Unsafe extract path: $resolvedExtract"
    }
    Remove-Item -LiteralPath $resolvedExtract -Recurse -Force
  }
  New-Item -ItemType Directory -Path $extractRoot | Out-Null
  Expand-Archive -LiteralPath $archive.FullName -DestinationPath $extractRoot
  $shape = Get-ChildItem -LiteralPath $extractRoot -File -Filter '*.shp' | Select-Object -First 1
  if (-not $shape) { throw "Shapefile not found in $($archive.FullName)" }
  if ($shape.BaseName -notmatch '^CFM_SGG_(\d{5})_MAX$') {
    throw "Unexpected shapefile name: $($shape.Name)"
  }

  $nativeCommand = '"{0}" -a -D -s 5186 -W CP949 "{1}" urban_flood_max_stage.source_polygons | "{2}" -h {3} -p {4} -U {5} -d {6} -v ON_ERROR_STOP=1' -f $shp2pgsql, $shape.FullName, $psql, $HostName, $Port, $UserName, $Database
  & $env:ComSpec /d /s /c $nativeCommand | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Import failed: $($archive.FullName)" }

  $processed += 1
  if (($processed % 10) -eq 0 -or $processed -eq $archives.Count) {
    Write-Host "Imported $processed / $($archives.Count) archives"
  }
}

Invoke-Psql @'
DELETE FROM urban_flood_max_stage.source_polygons
WHERE upper(fldlv_freq) <> 'MAX'
   OR seg_code !~ '^N33[0-4]$'
   OR geom IS NULL;

CREATE TABLE urban_flood_max_stage.parts AS
SELECT CASE right(seg_code, 1)
         WHEN '0' THEN 0.25::real
         WHEN '1' THEN 0.75::real
         WHEN '2' THEN 1.50::real
         WHEN '3' THEN 3.50::real
         WHEN '4' THEN 5.00::real
       END AS depth_m,
       subdivided.geom::geometry(Polygon, 5186) AS geom
FROM urban_flood_max_stage.source_polygons source
CROSS JOIN LATERAL ST_Dump(source.geom) input_part
CROSS JOIN LATERAL ST_Dump(
  CASE WHEN ST_IsValid(input_part.geom)
    THEN input_part.geom
    ELSE ST_CollectionExtract(ST_MakeValid(input_part.geom), 3)
  END
) valid_part
CROSS JOIN LATERAL ST_Subdivide(valid_part.geom, 256) AS subdivided(geom);

CREATE INDEX urban_flood_max_stage_parts_geom_gix ON urban_flood_max_stage.parts USING gist (geom);
ANALYZE urban_flood_max_stage.parts;

ALTER TABLE analysis.flood_values_100m
  ADD COLUMN IF NOT EXISTS ufmax real;

CREATE UNLOGGED TABLE urban_flood_max_stage.grid_cells_5186 AS
SELECT cell_id,
       ST_Transform(geom, 5186)::geometry(Point, 5186) AS geom
FROM analysis.grid_cells_100m;
CREATE UNIQUE INDEX urban_flood_max_stage_grid_cells_5186_pk ON urban_flood_max_stage.grid_cells_5186 (cell_id);
CREATE INDEX urban_flood_max_stage_grid_cells_5186_geom_gix ON urban_flood_max_stage.grid_cells_5186 USING gist (geom);
ANALYZE urban_flood_max_stage.grid_cells_5186;

CREATE UNLOGGED TABLE urban_flood_max_stage.mapped_cells AS
SELECT cells.cell_id,
       max(parts.depth_m) AS ufmax
FROM urban_flood_max_stage.parts parts
JOIN urban_flood_max_stage.grid_cells_5186 cells
  ON cells.geom && parts.geom
 AND ST_Covers(parts.geom, cells.geom)
GROUP BY cells.cell_id;

CREATE UNIQUE INDEX urban_flood_max_stage_mapped_cells_pk ON urban_flood_max_stage.mapped_cells (cell_id);
ANALYZE urban_flood_max_stage.mapped_cells;

INSERT INTO analysis.flood_values_100m (version_id, cell_id, ufmax)
SELECT versions.version_id, mapped.cell_id, mapped.ufmax
FROM urban_flood_max_stage.mapped_cells mapped
CROSS JOIN LATERAL (
  SELECT version_id
  FROM analysis.flood_dataset_versions
  WHERE dataset_key = 'national-2024-v1'
  LIMIT 1
) versions
ON CONFLICT (version_id, cell_id) DO UPDATE
SET ufmax = EXCLUDED.ufmax,
    updated_at = now();

ALTER TABLE analysis.flood_region_indicator_stats
  DROP CONSTRAINT IF EXISTS flood_region_indicator_stats_indicator_code_check;
ALTER TABLE analysis.flood_region_indicator_stats
  ADD CONSTRAINT flood_region_indicator_stats_indicator_code_check
  CHECK (indicator_code IN ('FH01','FH02','FH03','UF50','UF80','UF100','UFMAX','FE01','FE02','FE03'));

WITH region_values AS (
  SELECT regional.region_code,
         count(flood.ufmax) AS valid_cells,
         avg(flood.ufmax) AS raw_mean
  FROM analysis.region_grid_cells_100m regional
  LEFT JOIN analysis.flood_values_100m flood
    ON flood.cell_id = regional.cell_id
   AND flood.version_id = (SELECT version_id FROM analysis.flood_dataset_versions WHERE dataset_key = 'national-2024-v1')
  GROUP BY regional.region_code
  HAVING count(flood.ufmax) > 0
), base AS (
  SELECT stats.version_id, stats.region_code, stats.payload
  FROM analysis.flood_region_indicator_stats stats
  WHERE stats.indicator_code = 'FH01'
)
INSERT INTO analysis.flood_region_indicator_stats (version_id, region_code, indicator_code, payload, updated_at)
SELECT base.version_id,
       values.region_code,
       'UFMAX',
       base.payload
       || jsonb_build_object(
            'indicator', 'UFMAX',
            'referencePeriod', 'historical maximum',
            'sourceResolution', 'Official administrative-area historical-maximum urban flood polygons in EPSG:5186 aligned to EPSG:5179 national 100m cell centers; class depth midpoints',
            'stats', (base.payload->'stats') || jsonb_build_object(
              'rawMin', 0,
              'rawMax', 5,
              'rawMean', round(values.raw_mean::numeric, 6),
              'validCells', values.valid_cells,
              'mean', round((values.raw_mean / 5)::numeric, 6),
              'normalizedMean', round((values.raw_mean / 5)::numeric, 6)
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
      coalesce(source_metadata->'urban_flood_frequencies', '{}'::jsonb)
        || jsonb_build_object('MAX', 'UFMAX'),
      true
    ),
    updated_at = now()
WHERE dataset_key = 'national-2024-v1';

ANALYZE analysis.flood_values_100m;
'@

Invoke-Psql @'
SELECT 'UFMAX' AS indicator,
       count(ufmax) AS cells,
       min(ufmax) AS min_depth,
       max(ufmax) AS max_depth
FROM analysis.flood_values_100m;

SELECT count(*) AS served_grid_regions
FROM analysis.flood_region_indicator_stats
WHERE indicator_code = 'UFMAX';
'@

Invoke-Psql 'DROP SCHEMA urban_flood_max_stage CASCADE;'
if (Test-Path -LiteralPath $extractRoot) { Remove-Item -LiteralPath $extractRoot -Recurse -Force }
Write-Host 'Historical-maximum urban flood import completed.'
