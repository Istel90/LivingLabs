"""Validate existing processed raster headers and register only compliant files.

Never resamples or changes input data. Content hashes in source sidecars are not
claimed as independently verified; size/mtime checks detect changed files at use.
"""
import argparse
import hashlib
import json
import math
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import rasterio

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = json.loads((ROOT / 'shared/data/priority/grid-contract.json').read_text(encoding='utf-8'))


def validate_header(header, contract=CONTRACT):
    errors = []
    for key in ('crs', 'bands', 'dtype', 'nodata'):
        if header.get(key) != contract[key]:
            errors.append(key)
    a, b, x, d, e, y = header['transform']
    if (a, b, d, e) != (contract['pixelWidth'], 0, 0, contract['pixelHeight']):
        errors.append('resolution-or-rotation')
    for offset in ((x-contract['originX'])/contract['pixelWidth'], (y-contract['originY'])/contract['pixelHeight']):
        if not math.isfinite(offset) or abs(offset-round(offset)) > 1e-7:
            errors.append('grid-alignment')
            break
    if header['width'] <= 0 or header['height'] <= 0:
        errors.append('dimensions')
    return errors


def inspect(path, root):
    relative = path.relative_to(root).as_posix()
    with rasterio.open(path) as ds:
        header = dict(crs=str(ds.crs), transform=list(ds.transform)[:6], width=ds.width,
                      height=ds.height, bands=ds.count, dtype=ds.dtypes[0], nodata=ds.nodata)
    errors = validate_header(header)
    sidecar = path.with_suffix('.metadata.json')
    metadata = json.loads(sidecar.read_text(encoding='utf-8-sig')) if sidecar.exists() else {}
    period = metadata.get('period') or metadata.get('period_label') or metadata.get('year')
    for key, value in [('unit', metadata.get('unit')), ('indicator', metadata.get('indicator_id')), ('period', period)]:
        if value is None or str(value).strip() == '':
            errors.append('missing-'+key)
    if metadata.get('grid_spec_id') != CONTRACT['id']:
        errors.append('grid-spec-id')
    if metadata.get('test_only'):
        errors.append('test-only')
    stat = path.stat()
    metadata_stat = sidecar.stat() if sidecar.exists() else None
    fingerprint = hashlib.sha256(json.dumps([relative, stat.st_size, stat.st_mtime_ns, header], sort_keys=True).encode()).hexdigest()
    return dict(path=relative, status='rejected' if errors else 'registered', errors=errors,
                indicator=metadata.get('indicator_id'), period=str(period) if period is not None else None,
                unit=metadata.get('unit'), scenario=metadata.get('scenario'), gridSpecId=CONTRACT['id'],
                header=header, size=stat.st_size, mtimeMs=stat.st_mtime_ns/1_000_000,
                metadataSize=metadata_stat.st_size if metadata_stat else None,
                metadataMtimeMs=metadata_stat.st_mtime_ns/1_000_000 if metadata_stat else None,
                version=fingerprint, versionKind='path-stat-header-fingerprint', contentHashVerified=False)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=ROOT/'riskmap-core-main/data/processed/hazard')
    parser.add_argument('--output', type=Path, default=ROOT/'.runtime-logs/raster-index.json')
    args = parser.parse_args()
    root = args.root.resolve()
    if not root.is_dir():
        raise SystemExit('Raster root does not exist; existing index preserved.')
    entries = {}
    for path in sorted(root.rglob('*.tif')):
        try:
            entries[path.relative_to(root).as_posix()] = inspect(path, root)
        except Exception as exc:
            entries[path.relative_to(root).as_posix()] = dict(status='rejected', errors=[str(exc)])
    if not entries:
        raise SystemExit('No rasters found; existing index preserved.')
    result = dict(schemaVersion=1, createdAt=datetime.now(timezone.utc).isoformat(), root=str(root),
                  contract=CONTRACT, entries=entries, counts=dict(Counter(e['status'] for e in entries.values())))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix('.tmp')
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')
    temporary.replace(args.output)
    print(json.dumps(result['counts']))


if __name__ == '__main__':
    main()
