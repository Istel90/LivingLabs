import { readFileSync, statSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const indexFile = fileURLToPath(new URL('../../.runtime-logs/raster-index.json', import.meta.url));
let cache;
let cacheStamp;

export function resolveIndexedRaster(root, relativePath, indexPath = indexFile) {
    const stamp = statSync(indexPath).mtimeMs;
    if (!cache || cacheStamp !== `${indexPath}:${stamp}`) {
        cache = JSON.parse(readFileSync(indexPath, 'utf8'));
        cacheStamp = `${indexPath}:${stamp}`;
    }
    if (cache.schemaVersion !== 1 || resolve(cache.root) !== resolve(root)) throw new Error('Raster index root/schema mismatch');
    const key = relativePath.replaceAll('\\', '/');
    if (!Object.hasOwn(cache.entries, key) || cache.entries[key].status !== 'registered') throw new Error('Raster is not registered against the grid standard');
    const file = resolve(root, key);
    const rel = relative(root, file);
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Invalid raster index path');
    const record = cache.entries[key];
    const current = statSync(file);
    if (current.size !== record.size || Math.abs(current.mtimeMs - record.mtimeMs) > 1) throw new Error('Raster changed after registration; rebuild the index');
    const metadata = statSync(file.replace(/\.tif$/i, '.metadata.json'));
    if (metadata.size !== record.metadataSize || Math.abs(metadata.mtimeMs - record.metadataMtimeMs) > 1) throw new Error('Raster metadata changed after registration; rebuild the index');
    return file;
}
