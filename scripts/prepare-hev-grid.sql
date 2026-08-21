CREATE SCHEMA IF NOT EXISTS analysis;

CREATE TABLE IF NOT EXISTS analysis.hev_dataset_versions (
  version_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dataset_key text NOT NULL UNIQUE,
  label text NOT NULL,
  observed_period text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analysis.grid_cells_100m (
  cell_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  x integer NOT NULL,
  y integer NOT NULL,
  geom geometry(Point, 5179) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (x, y)
);

CREATE TABLE IF NOT EXISTS analysis.region_grid_cells_100m (
  region_code text NOT NULL CHECK (region_code ~ '^[0-9]{5}$'),
  cell_index integer NOT NULL CHECK (cell_index >= 0),
  cell_id bigint NOT NULL REFERENCES analysis.grid_cells_100m(cell_id) ON DELETE CASCADE,
  PRIMARY KEY (region_code, cell_index),
  UNIQUE (region_code, cell_id)
);

CREATE TABLE IF NOT EXISTS analysis.hev_values_100m (
  version_id bigint NOT NULL REFERENCES analysis.hev_dataset_versions(version_id) ON DELETE CASCADE,
  cell_id bigint NOT NULL REFERENCES analysis.grid_cells_100m(cell_id) ON DELETE CASCADE,
  h01 real, h02 real, h03 real, h04 real, h05 real,
  h06 real, h07 real, h08 real, h09 real, h10 real,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (version_id, cell_id)

);

DO $$
DECLARE constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'analysis.hev_values_100m'::regclass
    AND contype = 'c'
    AND conname = 'hev_values_100m_check';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE analysis.hev_values_100m DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS analysis.region_indicator_stats (
  version_id bigint NOT NULL REFERENCES analysis.hev_dataset_versions(version_id) ON DELETE CASCADE,
  region_code text NOT NULL CHECK (region_code ~ '^[0-9]{5}$'),
  indicator_code text NOT NULL CHECK (indicator_code ~ '^H(0[1-9]|10)$'),
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (version_id, region_code, indicator_code)
);

CREATE INDEX IF NOT EXISTS grid_cells_100m_geom_gix
  ON analysis.grid_cells_100m USING gist (geom);
CREATE INDEX IF NOT EXISTS region_grid_cells_100m_cell_idx
  ON analysis.region_grid_cells_100m (cell_id, region_code);
CREATE INDEX IF NOT EXISTS region_indicator_stats_lookup_idx
  ON analysis.region_indicator_stats (region_code, indicator_code, version_id);

INSERT INTO analysis.hev_dataset_versions (dataset_key, label, observed_period, active, source_metadata)
VALUES (
  'observed-2021-2025-v1',
  'HEV 관측기반 100m 서비스 격자 2021~2025',
  '2021-01-01/2025-12-31',
  true,
  '{"grid":"EPSG:5179 100m","hazards":"H01-H10"}'::jsonb
)
ON CONFLICT (dataset_key) DO UPDATE SET
  label = EXCLUDED.label,
  observed_period = EXCLUDED.observed_period,
  active = EXCLUDED.active,
  source_metadata = EXCLUDED.source_metadata,
  updated_at = now();

COMMENT ON TABLE analysis.grid_cells_100m IS '전국 HEV 분석에서 공유하는 EPSG:5179 100m 셀 중심점';
COMMENT ON TABLE analysis.hev_values_100m IS '서비스용 HEV 원값. 셀당 한 행에 지표를 열로 저장하고 지역 조회 시 정규화';
COMMENT ON TABLE analysis.region_indicator_stats IS '지역·지표별 원값 통계와 격자 응답 메타데이터';

ANALYZE analysis.hev_dataset_versions;
ANALYZE analysis.grid_cells_100m;
ANALYZE analysis.region_grid_cells_100m;
ANALYZE analysis.hev_values_100m;
ANALYZE analysis.region_indicator_stats;
