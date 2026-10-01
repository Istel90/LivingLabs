"""Build audited raw area fractions from land-cover polygons; never write the platform/DB.

All intersections use actual polygons and the authoritative 100 m reference cells.
Resume only accepts identical source, reference and implementation fingerprints.
"""
import argparse
import hashlib
import json
import math
import time
from datetime import datetime, timezone
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import pyogrio
import rasterio
from pyproj import Transformer
from rasterio.transform import from_origin
from shapely import STRtree, box, intersection, make_valid, union_all

CLASSES_PATH = Path(__file__).with_name('landcover-classes.json')
NODATA = -9999.0
COVERAGE_TOLERANCE_M2 = 1e-6


def write_json(path, value):
    path = Path(path)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')
    temp.replace(path)


def digest(path):
    result = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


def fingerprint(path, full=True):
    path = Path(path).resolve()
    stat = path.stat()
    result = {'path': str(path), 'bytes': stat.st_size, 'mtimeNs': stat.st_mtime_ns}
    if full:
        result['sha256'] = digest(path)
    return result


def validate_grid(frame, meta):
    required = ['region_code', 'cell_index', 'cell_id', 'x', 'y']
    if not set(required).issubset(frame) or frame[required].isna().any().any():
        raise ValueError('Missing reference keys/coordinates')
    if frame.region_code.nunique() != 1:
        raise ValueError('Expected one reference region')
    for keys in (['cell_index'], ['cell_id'], ['x', 'y']):
        if frame.duplicated(keys).any():
            raise ValueError(f'Duplicate reference key: {keys}')
    if meta['crs'] != 'EPSG:5179' or meta['gridUnit'] != '100m':
        raise ValueError('Reference CRS/grid mismatch')
    e = meta['extent']
    if e['xmax'] - e['xmin'] != meta['columns'] * 100 or e['ymax'] - e['ymin'] != meta['rows'] * 100:
        raise ValueError('Reference extent mismatch')
    xy = frame[['x', 'y']].to_numpy(dtype=float)
    if not np.isfinite(xy).all() or not np.all(np.abs((xy - 50) % 100) < 1e-8):
        raise ValueError('Reference centers must be on the 100m + 50m lattice')
    col = (frame.x.to_numpy() - e['xmin'] - 50) / 100
    row = (e['ymax'] - frame.y.to_numpy() - 50) / 100
    if not ((col >= 0) & (col < meta['columns']) & (row >= 0) & (row < meta['rows'])).all():
        raise ValueError('Reference cell outside authoritative extent')
    if not np.array_equal(row * meta['columns'] + col, frame.cell_index.to_numpy()):
        raise ValueError('Reference cell_index mismatch; never reindex silently')


def iter_regions(csv):
    pending = None
    seen = set()
    for chunk in pd.read_csv(csv, dtype={'region_code': str}, chunksize=200000):
        frame = pd.concat([pending, chunk], ignore_index=True) if pending is not None else chunk
        last = frame.iloc[-1].region_code
        for code, region in frame[frame.region_code != last].groupby('region_code', sort=False):
            if code in seen:
                raise ValueError('Reference is not grouped by region')
            seen.add(code)
            yield code, region.reset_index(drop=True)
        pending = frame[frame.region_code == last].copy()
    if pending is not None and len(pending):
        code = pending.iloc[0].region_code
        if code in seen:
            raise ValueError('Reference is not grouped by region')
        yield code, pending.reset_index(drop=True)


def polygon_parts(geometry):
    if geometry.geom_type in ('Polygon', 'MultiPolygon'):
        return geometry
    if geometry.geom_type == 'GeometryCollection':
        return union_all([polygon_parts(part) for part in geometry.geoms])
    return union_all([])


def repair_shapes(frame):
    if frame.geometry.isna().any() or frame.geometry.is_empty.any():
        raise ValueError('Empty source geometry requires source review')
    shapes = frame.geometry.to_numpy().copy()
    repairs = []
    blocked = np.zeros(len(frame), dtype=bool)
    for index in np.flatnonzero(~frame.geometry.is_valid.to_numpy()):
        old = shapes[index]
        new = polygon_parts(make_valid(old))
        if new.is_empty or not new.is_valid:
            raise ValueError('Repair did not produce a valid polygon')
        change = abs(new.area - old.area)
        # Material repair differences are never admitted automatically.
        blocked[index] = change > max(0.01, abs(old.area) * 1e-6)
        repairs.append({'featureId': str(frame.index[index]), 'areaBeforeM2': old.area,
                        'areaAfterM2': new.area, 'absoluteChangeM2': change,
                        'status': 'review_required' if blocked[index] else 'accepted_small_area_change'})
        shapes[index] = new
    if any(shape.geom_type not in ('Polygon', 'MultiPolygon') for shape in shapes):
        raise ValueError('Non-polygon land cover')
    return shapes, blocked, repairs


def normalize_class_codes(values, classes):
    # pandas 3 preserves missing values as float NaN even after astype(str).
    # Keep missing classification explicit; never infer a pervious/impervious code.
    codes = np.array(['' if pd.isna(value) else str(value).strip() for value in values], dtype=object)
    known = set(classes['impervious']) | set(classes['pervious'])
    unknown = set(codes) - known - {''}
    if unknown:
        raise ValueError('Unreviewed land-cover classes: ' + ','.join(sorted(unknown)))
    return codes


def imagery_date_counts(values):
    counts = {}
    for value in values:
        key = '(missing)' if pd.isna(value) or not str(value).strip() else str(value).strip()
        counts[key] = counts.get(key, 0) + 1
    return counts


def cell_values(cells, shapes, codes, blocked, classes):
    """Clip complex national polygons to 1 km tiles before exact cell intersections."""
    tree = STRtree(shapes)
    values = np.full((len(cells), 2), np.nan)
    coverage = np.zeros(len(cells))
    status = np.full(len(cells), 'missing_source_coverage', dtype=object)
    tiles = {}
    for index, cell in enumerate(cells):
        xmin, ymin, _, _ = cell.bounds
        tiles.setdefault((math.floor(xmin / 1000), math.floor(ymin / 1000)), []).append(index)
    for (tx, ty), ids in tiles.items():
        tile = box(tx * 1000, ty * 1000, (tx + 1) * 1000, (ty + 1) * 1000)
        selected = tree.query(tile, predicate='intersects')
        if not len(selected):
            continue
        clipped = intersection(shapes[selected], tile)
        # Boundary-only contacts do not contribute to area or coverage.
        keep = np.array([g.area > 0 for g in clipped])
        selected = selected[keep]
        clipped = clipped[keep]
        result = tile_values(cells[ids], clipped, codes[selected], blocked[selected], classes)
        values[ids], coverage[ids], status[ids] = result
    return values, coverage, status


def tile_values(cells, shapes, codes, blocked, classes):
    """Union all clipped fragments; a partial source never becomes a low/zero score."""
    tree = STRtree(shapes)
    wanted = [set(classes['impervious']), set(classes['forestGrassComponent'])]
    values = np.full((len(cells), 2), np.nan)
    coverage = np.zeros(len(cells))
    status = np.full(len(cells), 'missing_source_coverage', dtype=object)
    for offset in range(0, len(cells), 512):
        batch = cells[offset:offset + 512]
        pairs = tree.query(batch, predicate='intersects')
        if pairs.shape[1] == 0:
            continue
        order = np.argsort(pairs[0], kind='stable')
        local, source = pairs[:, order]
        fragments = intersection(batch[local], shapes[source])
        boundaries = np.r_[0, np.flatnonzero(np.diff(local)) + 1, len(local)]
        for start, stop in zip(boundaries[:-1], boundaries[1:]):
            idx = offset + int(local[start])
            pieces = fragments[start:stop]
            ids = source[start:stop]
            areas = np.array([p.area for p in pieces])
            coverage[idx] = union_all(pieces).area
            if blocked[ids[areas > COVERAGE_TOLERANCE_M2]].any():
                status[idx] = 'geometry_review_required'
                continue
            missing_class = [piece for piece, code in zip(pieces, codes[ids]) if code == '']
            if missing_class and union_all(missing_class).area > COVERAGE_TOLERANCE_M2:
                status[idx] = 'missing_source_classification'
                continue
            if 10000 - coverage[idx] > COVERAGE_TOLERANCE_M2:
                continue
            status[idx] = 'valid'
            for column, selected in enumerate(wanted):
                selected_pieces = [piece for piece, code in zip(pieces, codes[ids]) if code in selected]
                area = union_all(selected_pieces).area if selected_pieces else 0.0
                if not math.isfinite(area) or area < -1e-6 or area > 10000.000001:
                    raise ValueError('Area outside full-cell bounds')
                values[idx, column] = min(100.0, max(0.0, area / 100))
    return values, coverage, status


def convert_region(code, grid, meta, args, classes, run_key):
    started = time.monotonic()
    destination = args.output / code
    complete = destination / 'region-report.json'
    if complete.exists():
        report = json.loads(complete.read_text(encoding='utf-8'))
        if report['runKey'] != run_key:
            raise ValueError('Cannot resume region produced by another run')
        for name, sha in report['outputSha256'].items():
            if digest(destination / name) != sha:
                raise ValueError('Completed output changed: ' + name)
        return report
    destination.mkdir(exist_ok=True)
    e = meta['extent']
    bounds = tuple(e[k] for k in ('xmin', 'ymin', 'xmax', 'ymax'))
    info = pyogrio.read_info(args.source)
    if info['crs'] is None:
        raise ValueError('Source CRS missing')
    bbox = Transformer.from_crs(5179, info['crs'], always_xy=True).transform_bounds(*bounds, densify_pts=21)
    frame = gpd.read_file(args.source, bbox=bbox, columns=['L3_CODE', 'IMG_DATE'],
                          engine='pyogrio', fid_as_index=True).to_crs(5179)
    codes = normalize_class_codes(frame.L3_CODE, classes)
    missing_class_ids = [str(frame.index[i]) for i in np.flatnonzero(codes == '')]
    dates = imagery_date_counts(frame.IMG_DATE)
    shapes, blocked, repairs = repair_shapes(frame)
    cells = box(grid.x.to_numpy() - 50, grid.y.to_numpy() - 50,
                grid.x.to_numpy() + 50, grid.y.to_numpy() + 50)
    values, coverage, status = cell_values(cells, shapes, codes, blocked, classes)
    quality = grid.copy()
    quality['source_coverage_m2'] = coverage
    quality['status'] = status
    quality.to_csv(destination / 'cell-quality.csv.gz', index=False, compression='gzip')
    write_json(destination / 'geometry-repairs.json', repairs)
    indicators = []
    for column, key in enumerate(('impervious-area-ratio', 'forest-grass-area-component')):
        data = values[:, column]
        valid = np.isfinite(data)
        table = grid.copy()
        table['raw_value'] = data
        table['unit'] = 'percent'
        table['source_year'] = args.source_year
        table['status'] = status
        table.to_csv(destination / (key + '.csv.gz'), index=False, compression='gzip')
        sparse = np.column_stack((grid.cell_index.to_numpy()[valid], data[valid])).ravel().tolist()
        for i in range(0, len(sparse), 2):
            sparse[i] = int(sparse[i])
        result = {'schemaVersion': 'livinglabs-preintegration-raw-grid/v1', 'indicator': key,
                  'regionCode': code, 'crs': 'EPSG:5179', 'gridUnit': '100m',
                  'rows': meta['rows'], 'columns': meta['columns'], 'extent': e,
                  'transform': {'originX': e['xmin'], 'originY': e['ymax'], 'pixelWidth': 100, 'pixelHeight': 100},
                  'referencePeriod': str(args.source_year), 'sourceYear': args.source_year,
                  'imageryDateCounts': dates,
                  'missingClassificationFeatures': len(missing_class_ids),
                  'missingClassificationPolicy': 'NoData for cells with positive-area unclassified source coverage',
                  'rawUnit': 'percent', 'valueEncoding': 'sparse-index-value', 'rawSparseValues': sparse,
                  'stats': {'targetCells': len(grid), 'validCells': int(valid.sum()),
                            'rawMin': float(data[valid].min()) if valid.any() else None,
                            'rawMax': float(data[valid].max()) if valid.any() else None},
                  'sourceCrs': str(info['crs']), 'areaDenominatorM2': 10000,
                  'coverageToleranceM2': COVERAGE_TOLERANCE_M2, 'runKey': run_key,
                  'classificationSource': classes['classificationSource'],
                  'method': classes['method'] if column == 0 else classes['forestGrassNote'],
                  'readyForPlatform': False,
                  'integrationNote': 'Raw percent, not normalized risk input. Admission and served platform integration remain separate.',
                  'componentOnly': column == 1}
        write_json(destination / (key + '.json'), result)
        raster = np.full((meta['rows'], meta['columns']), NODATA, dtype=np.float32)
        raster.flat[grid.cell_index.to_numpy()[valid].astype(int)] = data[valid]
        with rasterio.open(destination / (key + '.tif'), 'w', driver='GTiff',
                           height=meta['rows'], width=meta['columns'], count=1, dtype='float32',
                           crs=5179, transform=from_origin(e['xmin'], e['ymax'], 100, 100),
                           nodata=NODATA, compress='deflate', tiled=True) as dst:
            dst.write(raster, 1)
            dst.update_tags(source_year=str(args.source_year), raw_unit='percent', run_key=run_key,
                            component_only=str(column == 1).lower(), method=result['method'])
        indicators.append({'indicator': key, **result['stats']})
    report = {'regionCode': code, 'runKey': run_key, 'targetCells': len(grid), 'sourceFeatures': len(frame),
              'sourceYear': args.source_year, 'imageryDateCounts': dates,
              'missingClassificationFeatures': len(missing_class_ids),
              'missingClassificationFeatureIds': missing_class_ids,
              'repairedFeatures': len(repairs), 'materialRepairFeatures': int(blocked.sum()),
              'maxRepairAreaChangeM2': max((r['absoluteChangeM2'] for r in repairs), default=0),
              'cellStatus': pd.Series(status).value_counts().to_dict(), 'indicators': indicators,
              'elapsedSeconds': round(time.monotonic() - started, 3),
              'outputSha256': {p.name: digest(p) for p in sorted(destination.iterdir()) if p.is_file()}}
    write_json(complete, report)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--source-year', type=int, required=True)
    parser.add_argument('--reference-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--regions', nargs='*')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    classes = json.loads(CLASSES_PATH.read_text(encoding='utf-8'))
    if set(classes['impervious']) & set(classes['pervious']):
        raise ValueError('Class overlap')
    csv = args.reference_dir / 'grid-reference.csv.gz'
    metadata_path = args.reference_dir / 'grid-metadata.json'
    metadata = json.loads(metadata_path.read_text(encoding='utf-8-sig'))
    identity = {'builder': digest(__file__), 'classes': digest(CLASSES_PATH),
                'source': fingerprint(args.source, full=False), 'sourceYear': args.source_year,
                'reference': fingerprint(csv), 'metadata': fingerprint(metadata_path)}
    run_key = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
    manifest = args.output / 'build-manifest.json'
    if manifest.exists():
        if json.loads(manifest.read_text(encoding='utf-8'))['runKey'] != run_key:
            raise ValueError('Changed inputs or implementation: use a new output directory')
    else:
        write_json(manifest, {'runKey': run_key, 'identity': identity,
                             'startedAt': datetime.now(timezone.utc).isoformat(), 'platformModified': False})
    validation = []
    refs = args.output / 'reference-regions'
    refs.mkdir(exist_ok=True)
    for code, grid in iter_regions(csv):
        validate_grid(grid, metadata[code])
        validation.append({'regionCode': code, 'cells': len(grid)})
        path = refs / (code + '.csv.gz')
        grid.to_csv(path, index=False, compression='gzip')
    if set(r['regionCode'] for r in validation) != set(metadata):
        raise ValueError('Reference metadata and region sets differ')
    write_json(args.output / 'grid-validation.json', {'status': 'passed', 'regions': len(validation),
               'cells': sum(r['cells'] for r in validation), 'details': validation})
    requested = args.regions or [r['regionCode'] for r in validation]
    if set(requested) - set(metadata):
        raise ValueError('Unknown requested regions')
    reports = []
    failures = []
    progress_path = args.output / 'build-progress.json'
    write_json(progress_path, {'runKey': run_key, 'status': 'running', 'requestedRegions': len(requested),
                              'completedRegions': 0, 'failedRegions': 0, 'platformModified': False})
    for code in requested:
        grid = pd.read_csv(refs / (code + '.csv.gz'), dtype={'region_code': str})
        validate_grid(grid, metadata[code])
        try:
            report = convert_region(code, grid, metadata[code], args, classes, run_key)
            from verify_landcover import verify_region
            verification = verify_region(args.output / code)
            write_json(args.output / ('verification-' + code + '.json'), verification)
            report['fileVerification'] = verification['status']
            reports.append(report)
            print(json.dumps({k: report[k] for k in ('regionCode', 'targetCells', 'cellStatus', 'elapsedSeconds')}, ensure_ascii=False), flush=True)
        except Exception as error:
            failure = {'regionCode': code, 'errorType': type(error).__name__, 'error': str(error)}
            failures.append(failure)
            print(json.dumps(failure, ensure_ascii=False), flush=True)
        finished = len(reports) + len(failures) == len(requested)
        progress = {'runKey': run_key, 'status': ('complete_with_failures' if failures else 'complete') if finished else 'running',
                    'requestedRegions': len(requested), 'completedRegions': len(reports), 'failedRegions': len(failures),
                    'targetCells': sum(r['targetCells'] for r in reports),
                    'validCells': sum(r['cellStatus'].get('valid', 0) for r in reports),
                    'platformModified': False, 'regions': reports, 'failures': failures}
        write_json(progress_path, progress)
    if fingerprint(args.source, full=False) != identity['source']:
        raise ValueError('Source changed during build; outputs require source review')
    return 1 if failures else 0


if __name__ == '__main__':
    raise SystemExit(main())
