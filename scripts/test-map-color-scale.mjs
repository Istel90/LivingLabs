import assert from 'node:assert/strict';
import { displayScale, displayColor } from '../riskmap-core-main/src/lib/data/mapColorScale.js';
const values = Array.from({length:101}, (_,i)=>0.7+i/1000);
const original = [...values];
const detail = displayScale(values);
assert.equal(detail.low, values[5]); assert.equal(detail.high, values[95]);
assert.notEqual(displayColor(values[30], detail), displayColor(values[70], detail));
assert.equal(displayColor(values[0], detail), displayColor(values[5], detail));
assert.deepEqual(values,original);
assert.equal(displayScale([0,0,0]).constant,true);
assert.equal(displayScale([null,NaN]),null);
assert.deepEqual(displayScale([0.1,0.2],'range'),{min:0.1,max:0.2,low:0.1,high:0.2,constant:false,clipped:false});
assert.equal(displayScale([0.7,0.8],'common').low,0);
assert.equal(displayScale([0.7,0.8],'common').high,1);
assert.notDeepEqual(displayScale([0.1,0.2]),displayScale([0.7,0.8]));
assert.equal(displayColor(0.3,displayScale([0.3,0.3])),'rgb(255,255,191)');
console.log('PASS: regional ranges, common scale, continuous colors, clipping, constant/missing values, immutability');

