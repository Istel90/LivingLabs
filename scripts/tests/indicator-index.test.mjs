import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveIndicatorRequest } from '../../riskmap-core-main/scripts/indicator-index.mjs';
import { resolveIndexedRaster } from '../../riskmap-core-main/scripts/raster-index.mjs';

test('dataset ID fixes the endpoint and indicator; arbitrary routing fields are ignored', () => {
    const target = resolveIndicatorRequest(new URLSearchParams('dataset=flood.FH01&regionCode=41110&indicator=FE01&path=/secret'));
    assert.equal(target.path, '/flood-grid');
    assert.equal(target.query.get('indicator'), 'FH01');
    assert.equal(target.query.has('path'), false);
    assert.throws(() => resolveIndicatorRequest(new URLSearchParams('dataset=__proto__&regionCode=41110')), /Unknown/);
    assert.throws(() => resolveIndicatorRequest(new URLSearchParams('dataset=flood.FH01&regionCode=bad')), /regionCode/);
});

test('regional legacy files cannot be advertised as nationwide sources', () => {
    assert.throws(() => resolveIndicatorRequest(new URLSearchParams('dataset=static.E_population_floating_count_100m&regionCode=11680')), /not available/);
});

test('raster admission rejects changed and unregistered files', () => {
    const root = mkdtempSync(join(tmpdir(), 'livinglabs-index-'));
    try {
        const file = join(root, 'data.tif');
        writeFileSync(file, 'fixture');
        const metadataFile = join(root, 'data.metadata.json');
        writeFileSync(metadataFile, '{}');
        const metadata = statSync(metadataFile);
        const stat = statSync(file);
        const index = join(root, 'index.json');
        writeFileSync(index, JSON.stringify({ schemaVersion: 1, root, entries: { 'data.tif': { status: 'registered', size: stat.size, mtimeMs: stat.mtimeMs, metadataSize: metadata.size, metadataMtimeMs: metadata.mtimeMs } } }));
        assert.equal(resolveIndexedRaster(root, 'data.tif', index), file);
        assert.throws(() => resolveIndexedRaster(root, '../unknown.tif', index), /not registered/);
        writeFileSync(metadataFile, '{"test_only":true}');
        assert.throws(() => resolveIndexedRaster(root, 'data.tif', index), /metadata changed/);
        writeFileSync(file, 'changed content');
        assert.throws(() => resolveIndexedRaster(root, 'data.tif', index), /changed/);
    } finally { rmSync(root, { recursive: true, force: true }); }
});
