CREATE SCHEMA IF NOT EXISTS analysis;

CREATE TABLE IF NOT EXISTS analysis.flood_dataset_versions (
  version_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dataset_key text NOT NULL UNIQUE,
  label text NOT NULL,
  reference_period text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analysis.flood_values_100m (
  version_id bigint NOT NULL REFERENCES analysis.flood_dataset_versions(version_id) ON DELETE CASCADE,
  cell_id bigint NOT NULL REFERENCES analysis.grid_cells_100m(cell_id) ON DELETE CASCADE,
  fh01 real,
  fh02 real,
  fh03 real,
  fe01 real,
  fe02 real,
  fe03 real,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (version_id, cell_id)
);

ALTER TABLE analysis.flood_values_100m ADD COLUMN IF NOT EXISTS fe03 real;

CREATE TABLE IF NOT EXISTS analysis.flood_region_indicator_stats (
  version_id bigint NOT NULL REFERENCES analysis.flood_dataset_versions(version_id) ON DELETE CASCADE,
  region_code text NOT NULL CHECK (region_code ~ '^[0-9]{5}$'),
  indicator_code text NOT NULL CHECK (indicator_code IN ('FH01', 'FH02', 'FH03', 'FE01', 'FE02', 'FE03')),
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (version_id, region_code, indicator_code)
);

ALTER TABLE analysis.flood_region_indicator_stats
  DROP CONSTRAINT IF EXISTS flood_region_indicator_stats_indicator_code_check;
ALTER TABLE analysis.flood_region_indicator_stats
  ADD CONSTRAINT flood_region_indicator_stats_indicator_code_check
  CHECK (indicator_code IN ('FH01', 'FH02', 'FH03', 'FE01', 'FE02', 'FE03'));

CREATE INDEX IF NOT EXISTS flood_values_100m_cell_idx
  ON analysis.flood_values_100m (cell_id, version_id);
CREATE INDEX IF NOT EXISTS flood_region_indicator_stats_lookup_idx
  ON analysis.flood_region_indicator_stats (region_code, indicator_code, version_id);

INSERT INTO analysis.flood_dataset_versions
  (dataset_key, label, reference_period, active, source_metadata)
VALUES (
  'national-2024-v1',
  '전국 홍수 H/E 100m 서비스 격자',
  '2024 / 공개 홍수위험지도 기준',
  true,
  '{"grid":"EPSG:5179 100m","indicators":["FH01","FH02","FH03","FE01","FE02","FE03"],"hazard_depth_midpoints_m":{"1":0.25,"2":0.75,"3":1.5,"4":3.5,"5":5.0}}'::jsonb
)
ON CONFLICT (dataset_key) DO UPDATE SET
  label = EXCLUDED.label,
  reference_period = EXCLUDED.reference_period,
  active = EXCLUDED.active,
  source_metadata = EXCLUDED.source_metadata,
  updated_at = now();

COMMENT ON TABLE analysis.flood_values_100m IS '전국 홍수 H/E 서비스 원값. 기존 공통 100m 셀을 재사용하며 0값은 희소 저장에서 생략';
COMMENT ON TABLE analysis.flood_region_indicator_stats IS '지역·홍수지표별 정규화 통계와 격자 응답 메타데이터';

ANALYZE analysis.flood_dataset_versions;
ANALYZE analysis.flood_values_100m;
ANALYZE analysis.flood_region_indicator_stats;
