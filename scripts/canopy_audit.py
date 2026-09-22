"""Check downloaded Suwon tiles against local administrative boundary at pixel centers."""
import json
import argparse
from pathlib import Path
import numpy as np
import rasterio
from rasterio.features import rasterize
from rasterio.warp import transform_geom

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--stage', choices=['suwon', 'incheon', 'national'], default='suwon')
stage = parser.parse_args().stage
state = json.loads((ROOT / '.runtime-logs/canopy-queue.json').read_text())
boundary_path = 'public/data/suwon-boundary.geojson' if stage == 'suwon' else 'public/data/climate/admin-boundaries.geojson'
boundary = json.loads((ROOT / boundary_path).read_text(encoding='utf-8-sig'))
if stage == 'incheon':
    boundary['features'] = [f for f in boundary['features'] if str(f['properties']['code']).startswith('28')]
if stage == 'national':
    boundary['features'] = [f for f in boundary['features'] if not str(f['properties']['code']).startswith(('28', '4111'))]
shapes = [(transform_geom('EPSG:4326', 'EPSG:5179', f['geometry']), 1) for f in boundary['features']]
results = []
for item in state['stages'][stage]:
    if item['status'] not in ('VERIFIED', 'EMPTY_SOURCE', 'EMPTY_BOUNDARY'):
        continue
    with rasterio.open(item['local']) as ds:
        inside = rasterize(shapes, out_shape=(ds.height, ds.width), transform=ds.transform, dtype='uint8').astype(bool)
        values = ds.read(1)
        valid = ds.read_masks(1).astype(bool)
        row = {'name': item['name'], 'boundaryPixels': int(inside.sum()),
               'missingInside': int((inside & ~valid).sum()),
               'validOutside': int((~inside & valid).sum()),
               'value255Inside': int((inside & valid & (values == 255)).sum()),
               'validPixels': int(valid.sum()), 'min': int(values[valid].min()) if valid.any() else None,
               'max': int(values[valid].max()) if valid.any() else None, 'bytes': item['bytes']}
        results.append(row)
report = {'region': stage, 'boundarySource': boundary_path,
          'method': 'Rasterize existing WGS84 boundary in EPSG:5179 at 1m pixel centers. Small edge disagreements may arise from EE geometry projection.',
          'plannedTiles': len(state['stages'][stage]), 'auditedTiles': len(results), 'tiles': results,
          'totals': {k: sum(r[k] for r in results) for k in ['boundaryPixels','missingInside','validOutside','value255Inside','validPixels','bytes']}}
(ROOT / f'.runtime-logs/canopy-{stage}-audit.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report))
