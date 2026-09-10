import assert from 'node:assert/strict';
const base='http://127.0.0.1:4173';
for (const regionCode of ['41110','11230','50110']) {
 const get=async(indicator)=>{const r=await fetch(`${base}/hazard-grid?regionCode=${regionCode}&indicator=${indicator}`);assert.ok(r.ok);return r.json()};
 const grid=await get('H11'); const common=await get('H01');
 assert.equal(grid.indicatorCode,'H11');assert.ok(grid.stats.validCells>0);
 assert.equal(grid.qualityStatus,'EXPERIMENTAL_SPATIAL_REFERENCE_WBGT_V2_NATIONAL');
 assert.equal(grid.normalizationMethod,'national-minmax');
 assert.ok(grid.method.buildings.includes('3.3m'));assert.ok(grid.assumptions.terrain_double_counting);
 assert.deepEqual(grid.transform,common.transform);assert.equal(grid.columns,common.columns);assert.equal(grid.rows,common.rows);
 for(let i=1;i<grid.sparseValues.length;i+=2)assert.ok(Number.isFinite(grid.sparseValues[i])&&grid.sparseValues[i]>=0&&grid.sparseValues[i]<=1);
 console.log(JSON.stringify({regionCode,quality:grid.qualityStatus,stats:grid.stats}));
}
const future=await fetch(`${base}/hazard-grid?regionCode=41110&mode=future&indicator=H11&period=2050`);
assert.ok(!future.ok);assert.match(await future.text(),/미래 자료/);
console.log('Current served national H11 and future exclusion passed');
