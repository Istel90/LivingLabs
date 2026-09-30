import test from 'node:test';
import assert from 'node:assert/strict';
import { parseParcelIds } from '../shared/map/cadastre.js';
import { loadReferencedParcels } from '../riskmap-core-main/src/lib/data/parcelReferences.js';

const pnu = (n) => String(n).padStart(19, '0');
test('PNU validation preserves strings, deduplicates and limits batches', () => {
  assert.deepEqual(parseParcelIds(`${pnu(1)},${pnu(1)}`), [pnu(1)]);
  for (const value of ['', '123', "x'); DROP TABLE parcels", Array(101).fill(pnu(1)).join(',')]) {
    assert.throws(() => parseParcelIds(value));
  }
});
test('shared parcels batch once, report missing through retained lists, reuse version cache', async () => {
  let calls = 0;
  const ids = Array.from({ length: 105 }, (_, n) => pnu(n + 1));
  const candidates = [{ pnuList: ids, parcelDatasetVersion: 'test-v1' }, { pnuList: [ids[0]], parcelDatasetVersion: 'test-v1' }];
  const fetchJson = async (url) => {
    calls++;
    assert.equal(url.pathname, '/cadastre/parcel');
    assert.equal(url.searchParams.has('bbox'), false);
    return { metadata: { datasetVersion: 'test-v1' }, features: url.searchParams.get('pnu').split(',')
      .filter((id) => id !== pnu(105)).map((id) => ({ id, properties: { pnu: id }, geometry: {} })) };
  };
  const result = await loadReferencedParcels(candidates, fetchJson, 'http://localhost');
  assert.equal(calls, 2);
  assert.equal(result[0].features.length, 104);
  assert.equal(result[0].pnuList.length, 105);
  assert.equal(result[1].features.length, 1);
  await loadReferencedParcels([candidates[1]], fetchJson, 'http://localhost');
  assert.equal(calls, 2);
});
test('legacy references work without bounds; mismatched versions and network errors fail explicitly', async () => {
  const legacy = [{ pnuList: [pnu(500)] }];
  const result = await loadReferencedParcels(legacy, async () => ({ features: [{ id: pnu(500) }] }), 'http://localhost');
  assert.equal(result[0].features.length, 1);
  assert.equal(result[0].parcelDatasetVersion, undefined);
  await assert.rejects(loadReferencedParcels([{ ...legacy[0], parcelDatasetVersion: 'old' }], async () => ({ metadata: { datasetVersion: 'new' } }), 'http://localhost'), /버전/);
  await assert.rejects(loadReferencedParcels(legacy, async () => { throw new Error('offline'); }, 'http://localhost'), /offline/);
});
