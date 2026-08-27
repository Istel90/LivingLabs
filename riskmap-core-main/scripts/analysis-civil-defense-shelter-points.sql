CREATE TABLE IF NOT EXISTS analysis.civil_defense_shelter_points (
  shelter_id text PRIMARY KEY,
  source_key text NOT NULL DEFAULT 'civil_defense_shelter',
  name text NOT NULL,
  road_address text,
  parcel_address text,
  capacity integer,
  open_yn char(1) NOT NULL,
  reference_date date,
  longitude double precision NOT NULL,
  latitude double precision NOT NULL,
  geom geometry(Point, 5179) NOT NULL,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT civil_defense_shelter_open_yn_check CHECK (open_yn IN ('Y', 'N'))
);

CREATE INDEX IF NOT EXISTS civil_defense_shelter_points_open_geom_gix
  ON analysis.civil_defense_shelter_points
  USING gist (geom)
  WHERE open_yn = 'Y';

CREATE INDEX IF NOT EXISTS civil_defense_shelter_points_source_open_idx
  ON analysis.civil_defense_shelter_points (source_key, open_yn);

COMMENT ON TABLE analysis.civil_defense_shelter_points IS
  '공공데이터포털 민방위 대피시설 위치 원자료. 100m 분석격자에서 400m 커널밀도 접근성 proxy를 계산하는 점자료.';
