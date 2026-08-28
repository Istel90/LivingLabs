CREATE INDEX IF NOT EXISTS parcels_pnu_idx
  ON cadastre.parcels (a1);

CREATE INDEX IF NOT EXISTS parcels_sigungu_idx
  ON cadastre.parcels (a7);

CREATE INDEX IF NOT EXISTS parcels_geom_gix
  ON cadastre.parcels USING gist (geom);

CREATE OR REPLACE VIEW cadastre.parcels_readable AS
SELECT
  gid,
  a0 AS source_object_id,
  a1 AS pnu,
  a2 AS legal_dong_code,
  a3 AS legal_dong_name,
  a4 AS lot_number,
  a5 AS lot_number_land_category,
  a6 AS reference_date,
  a7 AS sigungu_code,
  geom
FROM cadastre.parcels;

COMMENT ON TABLE cadastre.parcels IS
  'VWorld 연속지적도 2026-08-08 전국 SHP 원본 필드, EPSG:5186';

COMMENT ON VIEW cadastre.parcels_readable IS
  'VWorld 연속지적도 원본 A0-A7 필드에 읽기 쉬운 별칭을 적용한 조회용 뷰';

ANALYZE cadastre.parcels;
