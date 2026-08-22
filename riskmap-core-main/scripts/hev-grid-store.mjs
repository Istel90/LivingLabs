const DATASET_KEY = 'observed-2021-2025-v1';
const INDICATOR_COLUMNS = Object.freeze({
  H01: 'h01', H02: 'h02', H03: 'h03', H04: 'h04', H05: 'h05',
  H06: 'h06', H07: 'h07', H08: 'h08', H09: 'h09', H10: 'h10',
});

function assertLookup(regionCode, indicator) {
  if (!/^\d{5}$/.test(regionCode)) throw new Error('regionCode must be 5 digits');
  if (!INDICATOR_COLUMNS[indicator]) throw new Error('indicator must be H01 through H10');
}

function compactPayload(payload) {
  const { sparseValues: _sparseValues, storage: _storage, ...metadata } = payload;
  return metadata;
}

export function createHevGridStore({ pool, datasetKey = DATASET_KEY }) {
  async function versionId(queryable = pool) {
    const result = await queryable.query({
      text: 'SELECT version_id FROM analysis.hev_dataset_versions WHERE dataset_key = $1 AND active = true',
      values: [datasetKey],
    });
    return result.rows[0]?.version_id || null;
  }

  async function ready() {
    try {
      const result = await pool.query(`
        SELECT to_regclass('analysis.hev_values_100m') IS NOT NULL AS ready
      `);
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
        FROM analysis.region_indicator_stats s
        JOIN analysis.hev_dataset_versions v ON v.version_id = s.version_id
        WHERE v.dataset_key = $1 AND v.active = true
          AND s.region_code = $2 AND s.indicator_code = $3
      `,
      values: [datasetKey, regionCode, indicator],
    });
    if (!metadataResult.rows.length) return null;

    const valuesResult = await pool.query({
      text: `
        SELECT r.cell_index, h.${column} AS value
        FROM analysis.region_grid_cells_100m r
        JOIN analysis.hev_dataset_versions d
          ON d.dataset_key = $1 AND d.active = true
        JOIN analysis.hev_values_100m h
          ON h.version_id = d.version_id AND h.cell_id = r.cell_id
        WHERE r.region_code = $2 AND h.${column} IS NOT NULL
        ORDER BY r.cell_index
      `,
      values: [datasetKey, regionCode],
    });
    const metadata = metadataResult.rows[0].payload;
    const rawMin = Number(metadata.stats?.rawMin);
    const rawMax = Number(metadata.stats?.rawMax);
    const range = rawMax - rawMin;
    const sparseValues = [];
    for (const row of valuesResult.rows) {
      const rawValue = Number(row.value);
      const normalized = range > 0 ? Math.min(1, Math.max(0, (rawValue - rawMin) / range)) : 0.5;
      sparseValues.push(row.cell_index, Number(normalized.toFixed(6)));
    }
    return { ...metadata, sparseValues, storage: 'postgis' };
  }

  async function putMany(payloads) {
    if (!Array.isArray(payloads) || !payloads.length) throw new Error('At least one HEV payload is required');
    const regionCode = String(payloads[0]?.regionCode || '');
    const basePayload = payloads[0];
    const columns = Number(basePayload.columns);
    const { originX, originY, pixelWidth, pixelHeight } = basePayload.transform || {};
    const cells = new Map();
    const metadataByIndicator = new Map();

    for (const payload of payloads) {
      const indicator = String(payload?.indicator || '').toUpperCase();
      assertLookup(String(payload?.regionCode || ''), indicator);
      if (payload.regionCode !== regionCode) throw new Error('All HEV payloads must use the same regionCode');
      if (!Array.isArray(payload.sparseValues) || payload.sparseValues.length % 2 !== 0) {
        throw new Error('sparseValues must contain index/value pairs');
      }
      const column = INDICATOR_COLUMNS[indicator];
      const rawMin = Number(payload.stats?.rawMin);
      const rawMax = Number(payload.stats?.rawMax);
      const range = rawMax - rawMin;
      metadataByIndicator.set(indicator, compactPayload(payload));
      for (let offset = 0; offset < payload.sparseValues.length; offset += 2) {
        const cellIndex = Number(payload.sparseValues[offset]);
        const normalizedValue = Number(payload.sparseValues[offset + 1]);
        const row = Math.floor(cellIndex / columns);
        const columnIndex = cellIndex % columns;
        const cell = cells.get(cellIndex) || {
          cellIndex,
          x: Math.round(originX + ((columnIndex + 0.5) * pixelWidth)),
          y: Math.round(originY - ((row + 0.5) * pixelHeight)),
          values: {},
        };
        cell.values[column] = range > 0 ? rawMin + (normalizedValue * range) : rawMin;
        cells.set(cellIndex, cell);
      }
    }

    const orderedCells = [...cells.values()].sort((left, right) => left.cellIndex - right.cellIndex);
    const indices = orderedCells.map((cell) => cell.cellIndex);
    const xs = orderedCells.map((cell) => cell.x);
    const ys = orderedCells.map((cell) => cell.y);
    const indicatorArrays = Object.values(INDICATOR_COLUMNS).map((column) => orderedCells.map((cell) => cell.values[column] ?? null));

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL statement_timeout = '120s'");
      const activeVersionId = await versionId(client);
      if (!activeVersionId) throw new Error(`HEV dataset version is not initialized: ${datasetKey}`);

      await client.query({
        text: `
          WITH input AS (
            SELECT DISTINCT * FROM unnest($1::integer[], $2::integer[]) AS t(x, y)
          )
          INSERT INTO analysis.grid_cells_100m (x, y, geom)
          SELECT x, y, ST_SetSRID(ST_MakePoint(x, y), 5179) FROM input
          ON CONFLICT (x, y) DO NOTHING
        `,
        values: [xs, ys],
      });
      await client.query({
        text: `
          WITH input AS (
            SELECT * FROM unnest($2::integer[], $3::integer[], $4::integer[]) AS t(cell_index, x, y)
          )
          INSERT INTO analysis.region_grid_cells_100m (region_code, cell_index, cell_id)
          SELECT $1, i.cell_index, c.cell_id
          FROM input i
          JOIN analysis.grid_cells_100m c ON c.x = i.x AND c.y = i.y
          ON CONFLICT (region_code, cell_index) DO UPDATE SET cell_id = EXCLUDED.cell_id
          WHERE analysis.region_grid_cells_100m.cell_id IS DISTINCT FROM EXCLUDED.cell_id
        `,
        values: [regionCode, indices, xs, ys],
      });
      await client.query({
        text: `
          WITH input AS (
            SELECT * FROM unnest(
              $3::integer[], $4::real[], $5::real[], $6::real[], $7::real[], $8::real[],
              $9::real[], $10::real[], $11::real[], $12::real[], $13::real[]
            ) AS t(cell_index, h01, h02, h03, h04, h05, h06, h07, h08, h09, h10)
          )
          INSERT INTO analysis.hev_values_100m
            (version_id, cell_id, h01, h02, h03, h04, h05, h06, h07, h08, h09, h10)
          SELECT $1, r.cell_id, i.h01, i.h02, i.h03, i.h04, i.h05, i.h06, i.h07, i.h08, i.h09, i.h10
          FROM input i
          JOIN analysis.region_grid_cells_100m r
            ON r.region_code = $2 AND r.cell_index = i.cell_index
          ON CONFLICT (version_id, cell_id) DO UPDATE SET
            h01 = COALESCE(EXCLUDED.h01, analysis.hev_values_100m.h01),
            h02 = COALESCE(EXCLUDED.h02, analysis.hev_values_100m.h02),
            h03 = COALESCE(EXCLUDED.h03, analysis.hev_values_100m.h03),
            h04 = COALESCE(EXCLUDED.h04, analysis.hev_values_100m.h04),
            h05 = COALESCE(EXCLUDED.h05, analysis.hev_values_100m.h05),
            h06 = COALESCE(EXCLUDED.h06, analysis.hev_values_100m.h06),
            h07 = COALESCE(EXCLUDED.h07, analysis.hev_values_100m.h07),
            h08 = COALESCE(EXCLUDED.h08, analysis.hev_values_100m.h08),
            h09 = COALESCE(EXCLUDED.h09, analysis.hev_values_100m.h09),
            h10 = COALESCE(EXCLUDED.h10, analysis.hev_values_100m.h10),
            updated_at = now()
        `,
        values: [activeVersionId, regionCode, indices, ...indicatorArrays],
      });
      for (const [indicator, metadata] of metadataByIndicator) {
        await client.query({
          text: `
            INSERT INTO analysis.region_indicator_stats
              (version_id, region_code, indicator_code, payload, updated_at)
            VALUES ($1, $2, $3, $4::jsonb, now())
            ON CONFLICT (version_id, region_code, indicator_code) DO UPDATE SET
              payload = EXCLUDED.payload,
              updated_at = now()
          `,
          values: [activeVersionId, regionCode, indicator, JSON.stringify(metadata)],
        });
      }
      await client.query('COMMIT');
      return { regionCode, indicators: [...metadataByIndicator.keys()], cells: orderedCells.length, versionId: activeVersionId };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async function put(payload) {
    const result = await putMany([payload]);
    return { ...result, indicator: payload.indicator };
  }

  async function status() {
    const result = await pool.query({
      text: `
        SELECT d.dataset_key,
               (SELECT count(DISTINCT region_code)::integer FROM analysis.region_indicator_stats WHERE version_id = d.version_id) AS regions,
               (SELECT count(*)::integer FROM analysis.region_indicator_stats WHERE version_id = d.version_id) AS region_indicators,
               (SELECT count(*)::bigint FROM analysis.hev_values_100m WHERE version_id = d.version_id) AS cells
        FROM analysis.hev_dataset_versions d
        WHERE d.dataset_key = $1 AND d.active = true
      `,
      values: [datasetKey],
    });
    return result.rows[0] || { dataset_key: datasetKey, regions: 0, region_indicators: 0, cells: 0 };
  }

  return { ready, get, put, putMany, status };
}

export { DATASET_KEY as DEFAULT_HEV_DATASET_KEY };
