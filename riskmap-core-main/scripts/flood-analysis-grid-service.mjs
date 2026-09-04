const FLOOD_COLUMNS = Object.freeze({
  FH01: 'fh01',
  FH02: 'fh02',
  FH03: 'fh03',
  FE01: 'fe01',
  FE02: 'fe02',
  FE03: 'fe03',
  UF50: 'uf50',
  UF80: 'uf80',
  UF100: 'uf100',
});

const ANALYSIS_INDICATORS = Object.freeze({
  'rain-max-1h': {
    table: 'analysis.kma_extreme_rainfall_grid_100m', column: 'max_1h_mm', label: '1시간 최대강우량',
    rawUnit: 'mm', sourceResolution: '기상청 ASOS 2016~2025년 4~10월 관측 극값 · 전국 100m 최근접 관측소 연결', normalization: 'linear',
  },
  'terrain-low-elevation': {
    rasterTable: 'analysis.terrain_elevation_100m', label: '저지대 지형', rawUnit: 'm',
    sourceResolution: '전국 DEM 표고 EPSG:5179 100m · 낮은 표고일수록 위험 증가', normalization: 'linear', invert: true,
  },
  'terrain-twi': {
    rasterTable: 'analysis.terrain_twi_100m', label: '지형습윤지수 TWI', rawUnit: 'index',
    sourceResolution: '전국 DEM 기반 지형습윤지수 · EPSG:5179 100m', normalization: 'linear',
  },
  'terrain-flow-accumulation': {
    rasterTable: 'analysis.terrain_flow_accumulation_100m', label: '유로 누적량', rawUnit: 'cells',
    sourceResolution: '전국 DEM 기반 유로 누적량 · EPSG:5179 100m', normalization: 'log1p',
  },
  'terrain-depression-depth': {
    rasterTable: 'analysis.terrain_depression_depth_100m', label: '지형 함몰 깊이', rawUnit: 'm',
    sourceResolution: '전국 DEM 기반 함몰 깊이 · EPSG:5179 100m', normalization: 'linear',
  },
  'building-basement-count': {
    table: 'analysis.flood_building_sensitivity_100m', column: 'basement_building_count', label: '지하층 보유 건축물 수',
    rawUnit: '동/100m 셀', sourceResolution: 'VWorld GIS 건물통합정보 전국 원자료 · EPSG:5179 100m 셀 집계', normalization: 'log1p', zeroFill: true,
  },
  'building-old-30y-ratio': {
    table: 'analysis.flood_building_sensitivity_100m', column: 'old_30y_ratio_known', label: '30년 이상 건축물 비율',
    rawUnit: '비율', sourceResolution: 'VWorld GIS 건물통합정보 사용승인일 기준 · EPSG:5179 100m 셀 집계', normalization: 'linear', zeroFill: true,
  },
  'facility-bus-stop': {
    table: 'analysis.national_facility_grid_100m', column: 'facility_count', sourceKey: 'national_bus_stop_20251031', label: '버스정류장 수',
    rawUnit: '개/100m 셀', sourceResolution: '국토교통부 전국 버스정류장 위치정보 2025-10-31 · EPSG:5179 100m 셀 집계', normalization: 'log1p', zeroFill: true,
  },
  'facility-rail-station': {
    table: 'analysis.national_facility_grid_100m', column: 'facility_count', sourceKey: 'urban_rail_station', label: '도시철도 역사 수',
    rawUnit: '개/100m 셀', sourceResolution: '전국 도시철도 역사 851개 · EPSG:5179 100m 셀 집계', normalization: 'log1p', zeroFill: true,
  },
  'facility-crosswalk': {
    table: 'analysis.national_facility_grid_100m', column: 'facility_count', sourceKey: 'national_crosswalk_standard', label: '횡단보도 수',
    rawUnit: '개/100m 셀', sourceResolution: '전국횡단보도 표준자료 · 일부 지자체 보완 필요 · EPSG:5179 100m 셀 집계', normalization: 'log1p', zeroFill: true,
  },
  'facility-shelter': {
    table: 'analysis.national_facility_grid_100m', column: 'facility_count', sourceKey: 'civil_defense_shelter', label: '민방위 대피시설 수',
    rawUnit: '개/100m 셀', sourceResolution: '민방위 대피시설 적재본 5,147개 · 지역별 커버리지 확인 필요 · EPSG:5179 100m 셀 집계', normalization: 'log1p', zeroFill: true,
  },
  'population-elderly': {
    table: 'population.grid_100m', column: 'elderly_count', label: '고령인구 수', rawUnit: '명/100m 셀',
    sourceResolution: '국토정보플랫폼 2024년 10월 전국 100m 고령인구', normalization: 'log1p', zeroFill: true,
  },
  'population-infant': {
    table: 'population.grid_100m', column: 'infant_count', label: '유아인구 수', rawUnit: '명/100m 셀',
    sourceResolution: '국토정보플랫폼 2024년 10월 전국 100m 유아인구', normalization: 'log1p', zeroFill: true,
  },
});

function regionCodeFrom(searchParams) {
  const regionCode = (searchParams.get('regionCode') || '').trim();
  if (!/^\d{5}$/.test(regionCode)) throw new Error('regionCode must be exactly 5 digits');
  return regionCode;
}

function percentile(sortedValues, ratio) {
  if (!sortedValues.length) return null;
  const position = Math.min(sortedValues.length - 1, Math.max(0, (sortedValues.length - 1) * ratio));
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower];
  const weight = position - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

export function createFloodAnalysisGridService({ pool }) {
  const cache = new Map();

  async function fetchRegionMeta(regionCode) {
    const result = await pool.query({
      text: `
        SELECT payload
        FROM (
          SELECT payload, updated_at FROM analysis.flood_region_indicator_stats
          WHERE region_code = $1 AND indicator_code = 'FH01'
        ) available
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      values: [regionCode],
    });
    const payload = result.rows[0]?.payload;
    const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
    if (!parsed) throw new Error(`region grid metadata is not available: ${regionCode}`);
    return parsed;
  }

  async function fetchFloodGrid(searchParams) {
    const regionCode = regionCodeFrom(searchParams);
    const indicator = (searchParams.get('indicator') || '').trim().toUpperCase();
    const column = FLOOD_COLUMNS[indicator];
    if (!column) throw new Error('indicator must be FH01 through FH03, FE01 through FE03, or UF50/UF80/UF100');

    const metaResult = await pool.query({
      text: `
        SELECT stats.payload, stats.version_id
        FROM analysis.flood_region_indicator_stats stats
        JOIN analysis.flood_dataset_versions versions
          ON versions.version_id = stats.version_id AND versions.active
        WHERE stats.region_code = $1 AND stats.indicator_code = $2
        ORDER BY stats.updated_at DESC
        LIMIT 1
      `,
      values: [regionCode, indicator],
    });
    const metaRow = metaResult.rows[0];
    if (!metaRow) throw new Error(`flood grid is not available: ${regionCode} ${indicator}`);
    const gridMeta = typeof metaRow.payload === 'string' ? JSON.parse(metaRow.payload) : metaRow.payload;
    const valueResult = await pool.query({
      text: `
        SELECT regional.cell_index, values.${column} AS value
        FROM analysis.region_grid_cells_100m regional
        JOIN analysis.flood_values_100m values
          ON values.version_id = $2 AND values.cell_id = regional.cell_id
        WHERE regional.region_code = $1 AND values.${column} IS NOT NULL
        ORDER BY regional.cell_index
      `,
      values: [regionCode, metaRow.version_id],
    });
    const lower = Number(gridMeta?.stats?.rawMin);
    const upper = Number(gridMeta?.stats?.rawMax);
    const range = Number.isFinite(lower) && Number.isFinite(upper) && upper > lower ? upper - lower : 1;
    const valueCount = Number(gridMeta.valueCount) || Number(gridMeta.rows) * Number(gridMeta.columns);
    const sparseValues = [];
    for (const row of valueResult.rows) {
      const index = Number(row.cell_index);
      const value = Number(row.value);
      if (!Number.isInteger(index) || index < 0 || index >= valueCount || !Number.isFinite(value)) continue;
      sparseValues.push(index, Number(Math.min(1, Math.max(0, (value - lower) / range)).toFixed(6)));
    }
    return { ...gridMeta, schemaVersion: 'livinglabs-flood-grid/v1', valueEncoding: 'sparse-index-value', valueCount, sparseValues };
  }

  async function fetchAnalysisGrid(searchParams) {
    const regionCode = regionCodeFrom(searchParams);
    const indicator = (searchParams.get('indicator') || '').trim().toLowerCase();
    const config = ANALYSIS_INDICATORS[indicator];
    if (!config) throw new Error('analysis indicator is not available');
    const cacheKey = `${regionCode}:${indicator}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const gridMeta = await fetchRegionMeta(regionCode);
    const columns = Number(gridMeta.columns);
    const rows = Number(gridMeta.rows);
    const valueCount = Number(gridMeta.valueCount) || columns * rows;
    let result;
    if (config.rasterTable) {
      result = await pool.query({
        text: `
          SELECT regional.cell_index,
                 ST_Value(source.rast, 1, ST_SetSRID(ST_MakePoint(cells.x, cells.y), 5179)) AS value
          FROM analysis.region_grid_cells_100m regional
          JOIN analysis.grid_cells_100m cells ON cells.cell_id = regional.cell_id
          JOIN ${config.rasterTable} source
            ON ST_ConvexHull(source.rast) && ST_SetSRID(ST_MakePoint(cells.x, cells.y), 5179)
           AND ST_Intersects(source.rast, ST_SetSRID(ST_MakePoint(cells.x, cells.y), 5179))
          WHERE regional.region_code = $1
          ORDER BY regional.cell_index
        `,
        values: [regionCode],
      });
    } else {
      const sourceFilter = config.sourceKey ? 'AND source.source_key = $2' : '';
      const valueExpression = config.zeroFill ? `COALESCE(source.${config.column}, 0)` : `source.${config.column}`;
      result = await pool.query({
        text: `
          SELECT regional.cell_index, ${valueExpression} AS value
          FROM analysis.region_grid_cells_100m regional
          LEFT JOIN ${config.table} source
            ON source.cell_id = regional.cell_id ${sourceFilter}
          WHERE regional.region_code = $1
          ORDER BY regional.cell_index
        `,
        values: config.sourceKey ? [regionCode, config.sourceKey] : [regionCode],
      });
    }

    const cells = result.rows
      .map((row) => ({ index: Number(row.cell_index), value: Number(row.value) }))
      .filter((row) => Number.isInteger(row.index) && row.index >= 0 && row.index < valueCount && Number.isFinite(row.value));
    if (!cells.length) throw new Error(`analysis grid is not available: ${regionCode} ${indicator}`);
    const transformed = cells.map((row) => config.normalization === 'log1p' ? Math.log1p(Math.max(0, row.value)) : row.value).sort((a, b) => a - b);
    const positive = config.zeroFill ? transformed.filter((value) => value > 0) : transformed;
    const lower = config.zeroFill ? 0 : (percentile(transformed, 0.02) ?? 0);
    const upper = percentile(positive, 0.98) ?? lower;
    const range = Math.max(upper - lower, Number.EPSILON);
    const sparseValues = [];
    let rawSum = 0;
    let normalizedSum = 0;
    let rawMin = Infinity;
    let rawMax = -Infinity;
    for (const cell of cells) {
      const transformedValue = config.normalization === 'log1p' ? Math.log1p(Math.max(0, cell.value)) : cell.value;
      const scaled = upper > lower ? Math.min(1, Math.max(0, (transformedValue - lower) / range)) : 0;
      const normalized = config.invert ? 1 - scaled : scaled;
      sparseValues.push(cell.index, Number(normalized.toFixed(6)));
      rawSum += cell.value;
      normalizedSum += normalized;
      rawMin = Math.min(rawMin, cell.value);
      rawMax = Math.max(rawMax, cell.value);
    }
    const payload = {
      schemaVersion: 'livinglabs-analysis-grid/v1', indicator, label: config.label, regionCode,
      gridUnit: '100m', crs: 'EPSG:5179', rows, columns, valueCount,
      valueEncoding: 'sparse-index-value', extent: gridMeta.extent, transform: gridMeta.transform,
      sparseValues, rawUnit: config.rawUnit, unit: '정규화 점수', sourceResolution: config.sourceResolution,
      stats: {
        regionCells: valueCount, validCells: cells.length, rawMin, rawMax,
        rawMean: Number((rawSum / cells.length).toFixed(4)),
        normalizedMean: Number((normalizedSum / cells.length).toFixed(6)),
        mean: Number((normalizedSum / cells.length).toFixed(6)),
      },
    };
    cache.set(cacheKey, payload);
    if (cache.size > 80) cache.delete(cache.keys().next().value);
    return payload;
  }

  async function health() {
    const result = await pool.query(`
      SELECT
        to_regclass('analysis.flood_values_100m') IS NOT NULL AS flood_ready,
        to_regclass('analysis.flood_region_indicator_stats') IS NOT NULL AS stats_ready,
        (SELECT count(*)::bigint FROM analysis.flood_values_100m) AS flood_cells,
        (SELECT count(DISTINCT region_code)::integer FROM analysis.flood_region_indicator_stats) AS regions
    `);
    return { ok: Boolean(result.rows[0]?.flood_ready && result.rows[0]?.stats_ready), ...result.rows[0] };
  }

  return { fetchFloodGrid, fetchAnalysisGrid, health };
}
