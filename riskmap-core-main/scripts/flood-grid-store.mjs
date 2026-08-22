const DATASET_KEY = 'national-2024-v1';
const INDICATOR_COLUMNS = Object.freeze({
  FH01: 'fh01',
  FH02: 'fh02',
  FH03: 'fh03',
  FE01: 'fe01',
  FE02: 'fe02',
});

function assertLookup(regionCode, indicator) {
  if (!/^\d{5}$/.test(regionCode)) throw new Error('regionCode must be 5 digits');
  if (!INDICATOR_COLUMNS[indicator]) throw new Error('indicator must be FH01, FH02, FH03, FE01, or FE02');
}

export function createFloodGridStore({ pool, datasetKey = DATASET_KEY }) {
  async function ready() {
    try {
      const result = await pool.query(`SELECT to_regclass('analysis.flood_values_100m') IS NOT NULL AS ready`);
      return Boolean(result.rows[0]?.ready);
    } catch {
      return false;
    }
  }

  async function get(regionCode, indicator) {
    assertLookup(regionCode, indicator);
    const column = INDICATOR_COLUMNS[indicator];
    const metadataResult = await pool.query({
      text: `
        SELECT s.payload
        FROM analysis.flood_region_indicator_stats s
        JOIN analysis.flood_dataset_versions d ON d.version_id = s.version_id
        WHERE d.dataset_key = $1 AND d.active = true
          AND s.region_code = $2 AND s.indicator_code = $3
      `,
      values: [datasetKey, regionCode, indicator],
    });
    if (!metadataResult.rows.length) return null;

    const valuesResult = await pool.query({
      text: `
        SELECT r.cell_index, f.${column} AS value
        FROM analysis.region_grid_cells_100m r
        JOIN analysis.flood_dataset_versions d
          ON d.dataset_key = $1 AND d.active = true
        JOIN analysis.flood_values_100m f
          ON f.version_id = d.version_id AND f.cell_id = r.cell_id
        WHERE r.region_code = $2 AND f.${column} IS NOT NULL
        ORDER BY r.cell_index
      `,
      values: [datasetKey, regionCode],
    });
    const metadata = metadataResult.rows[0].payload;
    const rawMax = Number(metadata.stats?.rawMax) || 0;
    const sparseValues = [];
    for (const row of valuesResult.rows) {
      const rawValue = Number(row.value);
      const normalized = rawMax > 0 ? Math.min(1, Math.max(0, rawValue / rawMax)) : 0;
      sparseValues.push(row.cell_index, Number(normalized.toFixed(6)));
    }
    return { ...metadata, sparseValues, storage: 'postgis' };
  }

  async function status() {
    const result = await pool.query({
      text: `
        SELECT d.dataset_key,
               (SELECT count(DISTINCT region_code)::integer
                  FROM analysis.flood_region_indicator_stats WHERE version_id = d.version_id) AS regions,
               (SELECT count(*)::integer
                  FROM analysis.flood_region_indicator_stats WHERE version_id = d.version_id) AS region_indicators,
               (SELECT count(*)::bigint
                  FROM analysis.flood_values_100m WHERE version_id = d.version_id) AS cells
        FROM analysis.flood_dataset_versions d
        WHERE d.dataset_key = $1 AND d.active = true
      `,
      values: [datasetKey],
    });
    return result.rows[0] || { dataset_key: datasetKey, regions: 0, region_indicators: 0, cells: 0 };
  }

  return { ready, get, status };
}

export { DATASET_KEY as DEFAULT_FLOOD_DATASET_KEY, INDICATOR_COLUMNS as FLOOD_INDICATOR_COLUMNS };
