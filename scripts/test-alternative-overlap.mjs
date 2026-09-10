import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareAlternatives, comparisonAlternatives, latestComparisonRows } from '../riskmap-core-main/src/lib/data/alternativeOverlap.js';

function item(key, values, pnus = [], changes = {}) {
    return { key, name: key, regionCode: '41110', hazard: 'heatwave', alternative: { analysisResult: {
        gridResult: { columns: 2, rows: 2, crs: 'EPSG:5179', transform: { originX: 950000, originY: 1920000, pixelWidth: 100, pixelHeight: -100 },
            values, validIndices: [0, 1, 2, 3], stats: { topThreshold: .5 }, ...changes },
        parcelCandidates: pnus.map(pnuList => ({ pnuList })) } } };
}
const a = item('A', [.9,.7,null,.1], [['p1','p1'],['p2','p1']]);
const b = item('B', { __analysisGrid: 'sparse-v1', entries: [[0,.8],[2,.9],[3,0]] }, [['p1','p3']]);
const original = JSON.stringify([a,b]);
const r = compareAlternatives([a,b]);
assert.deepEqual(r.cells.map(c => [c.index,c.count,c.coverage]), [[0,2,2],[1,1,1],[2,1,1]]);
assert.equal(r.commonCoverage,2);
assert.equal(r.unionCoverage,4);
assert.deepEqual(r.parcels.map(p => [p.pnu,p.count]), [['p1',2],['p2',1],['p3',1]]);
assert.equal(JSON.stringify([a,b]),original, 'Input must remain unchanged');
assert.throws(() => compareAlternatives([a]), /2개/);
assert.throws(() => compareAlternatives([a,{...b,hazard:'flood'}]), /지역/);
assert.throws(() => compareAlternatives([a,item('C',[1,2,3,4],[],{transform:{originX:950100,originY:1920000,pixelWidth:100,pixelHeight:100}})]), /격자 위치/);
assert.throws(() => compareAlternatives([a,item('C',[null,null,null,null])]), /Risk 값/);
assert.throws(() => compareAlternatives([a,item('C',[1,2,3,4],[],{stats:{}})]), /Hotspot 기준/);
assert.equal(compareAlternatives([item('A',[1,1,1,1]),item('B',[1,1,1,1])],'percent',10).cells.length,4,'Include cutoff ties');
const sparse = item('D', {__analysisGrid:'dense-sparse-v1',length:4,entries:[[0,.9],[3,0]],storage:'float32'});
assert.equal(compareAlternatives([a,sparse]).cells.find(c => c.index===0).count,2);
assert.equal(compareAlternatives([item('Z',[0,null,null,null],[],{stats:{topThreshold:0}}),item('Y',[0,null,null,null],[],{stats:{topThreshold:0}})]).cells.length,1,'Zero is valid, null is missing');
assert.equal(latestComparisonRows([{rowId:'1',author:'a',project:'p',date:'2026-01-01'},{rowId:'2',author:'a',project:'p',date:'2026-02-01'}])[0].rowId,'2');
if (process.argv[2]) {
    const rows = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    const items = comparisonAlternatives(rows,'41110','heatwave').filter(i => i.available);
    const actual = compareAlternatives(items.filter(i => ['draft/5','draft/6'].includes(i.version)));
    assert.equal(actual.cells.filter(c => c.count===2).length,1077);
    assert.equal(actual.cells.length,1421);
    console.log(`Actual stored results: ${items.length} usable Suwon heatwave alternatives; 1077/1421 shared/union hotspot cells.`);
}
console.log('PASS: overlap counts, missing vs zero, parcel deduplication, sparse formats, ties, incompatible grids, immutability, revision filter.');
