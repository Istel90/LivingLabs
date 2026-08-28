import assert from "node:assert/strict";
import {
  ANALYSIS_GRID_ROUTES,
  PRIORITY_ANALYSIS_CONTRACT_VERSION,
  configurePriorityIndicators,
  decodeGridValues,
  indicatorContractKey,
  indicatorGridPath,
  loadIndicatorGrid,
} from "../riskmap-core-main/src/lib/domain/priority-management/analysisGridContract.js";

assert.equal(PRIORITY_ANALYSIS_CONTRACT_VERSION, "priority-analysis-grid/v1");
assert.equal(ANALYSIS_GRID_ROUTES.flood, "/flood-grid");

const ufmax = {
  id: 220,
  floodIndicator: "UFMAX",
  enabled: true,
  dataStatus: "partial",
};
assert.equal(indicatorContractKey(ufmax), "UFMAX");
assert.equal(
  indicatorGridPath(ufmax, "28177"),
  "/flood-grid?regionCode=28177&indicator=UFMAX",
);
assert.equal(
  indicatorGridPath(ufmax, "28177", "http://127.0.0.1:4173/"),
  "http://127.0.0.1:4173/flood-grid?regionCode=28177&indicator=UFMAX",
);
assert.equal(
  indicatorGridPath(
    { indicatorCode: "FH01", supportedRegionPrefixes: ["4111"] },
    "41110",
  ),
  "/flood-grid?regionCode=41110&indicator=FH01",
);
assert.equal(
  indicatorGridPath(
    { indicatorCode: "FH01", supportedRegionPrefixes: ["4111"] },
    "28177",
  ),
  null,
);
assert.equal(
  indicatorGridPath({ indicatorCode: "H04" }, "41110"),
  "/hazard-grid?regionCode=41110&indicator=H04",
);

const configured = configurePriorityIndicators({
  sourceIndicators: [
    ufmax,
    {
      id: 214,
      analysisIndicator: "facility-bus-stop",
      enabled: false,
      dataStatus: "partial",
    },
  ],
  hazard: "flood",
  regionCode: "41110",
});
assert.equal(
  configured[0].dataPath,
  "/flood-grid?regionCode=41110&indicator=UFMAX",
);
assert.equal(
  configured[1].dataPath,
  "/analysis-grid?regionCode=41110&indicator=facility-bus-stop",
);

const unsupported = configurePriorityIndicators({
  sourceIndicators: [{ ...ufmax, coveragePrefix: "4111" }],
  hazard: "flood",
  regionCode: "28177",
});
assert.equal(unsupported[0].dataPath, null);
assert.equal(unsupported[0].dataStatus, "missing");
assert.equal(unsupported[0].enabled, false);

const sparse = decodeGridValues({
  valueEncoding: "sparse-index-value",
  valueCount: 5,
  sparseValues: [0, 0, 3, 0.75],
});
assert.deepEqual(sparse, [0, null, null, 0.75, null]);

let requestedUrl = "";
const loaded = await loadIndicatorGrid(
  { dataPath: "analysis-data/sample.json" },
  {
    assetPath: (path) => `/base/${path}`,
    fetchImpl: async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        json: async () => ({
          gridUnit: "100m",
          rows: 1,
          columns: 2,
          extent: [0, 0, 200, 100],
          transform: [100, 0, 0, 0, -100, 100],
          crs: "EPSG:5179",
          values: [0, 1],
          stats: { mean: 0.5, validCells: 2 },
        }),
      };
    },
  },
);
assert.equal(requestedUrl, "/base/analysis-data/sample.json");
assert.deepEqual(loaded.gridValues, [0, 1]);
assert.equal(loaded.loadedValue, 0.5);

console.log("UI analysis contract checks passed.");
