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

