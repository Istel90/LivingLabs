"""Create boundary-masked city mosaics and a portable download bundle."""
import hashlib
import json
import math
import zipfile
from pathlib import Path

import numpy as np
import rasterio
from rasterio.features import rasterize
from rasterio.transform import from_origin
from rasterio.warp import transform_geom
from rasterio.windows import Window

ROOT = Path(__file__).resolve().parents[1]
OUT = Path('D:/LivingLabsData/canopy-height/city-bundle-20260916')
OUT.mkdir(parents=True, exist_ok=True)
state = json.loads((ROOT / '.runtime-logs/canopy-queue.json').read_text())
results = {}
for city in ('suwon', 'incheon'):
    assert city in state['qaApprovedStages']
    items = state['stages'][city]
    assert all(i['status'] in ('VERIFIED', 'EMPTY_BOUNDARY') for i in items)
    boundary_path = ROOT / ('public/data/suwon-boundary.geojson' if city == 'suwon' else 'public/data/climate/admin-boundaries.geojson')
    boundary = json.loads(boundary_path.read_text(encoding='utf-8-sig'))
    features = [f for f in boundary['features'] if city == 'suwon' or str(f['properties']['code']).startswith('28')]
    shapes = [(transform_geom('EPSG:4326', 'EPSG:5179', f['geometry']), 1) for f in features]
    bounds = []
    for i in items:
        with rasterio.open(i['local']) as src:
            bounds.append(src.bounds)
    left, top = min(b.left for b in bounds), max(b.top for b in bounds)
    right, bottom = max(b.right for b in bounds), min(b.bottom for b in bounds)
    dest = OUT / f'{city}_canopy_height_1m_EPSG5179.tif'
    if dest.exists():
        raise RuntimeError(f'Output already exists: {dest}')
    checks = []
    valid_total = 0
    with rasterio.open(dest, 'w', driver='GTiff', width=round(right-left), height=round(top-bottom), count=1,
                       dtype='int16', crs='EPSG:5179', transform=from_origin(left, top, 1, 1), nodata=-9999,
                       tiled=True, blockxsize=512, blockysize=512, compress='DEFLATE', predictor=2,
                       BIGTIFF='YES', SPARSE_OK='TRUE') as dst:
        dst.update_tags(SOURCE=state['source'], UNITS='METERS', BOUNDARY_SOURCE=str(boundary_path.relative_to(ROOT)),
                        NOTE='Meta/WRI v1 historical estimated canopy height. Outside supplied administrative boundary is NoData; not a 2026 observation.')
        for i in items:
            with rasterio.open(i['local']) as src:
                values = src.read(1)
                inside = rasterize(shapes, out_shape=values.shape, transform=src.transform, dtype='uint8').astype(bool)
                values[~inside] = -9999
                assert not np.any(inside & (values == -9999)), i['name']
                valid_total += int(inside.sum())
                window = Window(round(src.bounds.left-left), round(top-src.bounds.top), src.width, src.height)
                digest = hashlib.sha256(values.tobytes()).hexdigest()
                checks.append((window, digest))
                if inside.any():
                    dst.write(values, 1, window=window)
            print(f'{city}: merged {i["name"]}', flush=True)
    with rasterio.open(dest) as ds:
        assert ds.res == (1., 1.) and ds.crs.to_epsg() == 5179 and ds.nodata == -9999
        for window, digest in checks:
            assert hashlib.sha256(ds.read(1, window=window).tobytes()).hexdigest() == digest
    expected = json.loads((ROOT / f'.runtime-logs/canopy-{city}-audit.json').read_text())['totals']['boundaryPixels']
    assert valid_total == expected
    geojson = OUT / f'{city}_boundary.geojson'
    geojson.write_text(json.dumps({'type':'FeatureCollection','features':features}, ensure_ascii=False), encoding='utf-8')
    with dest.open('rb') as fh:
        sha = hashlib.file_digest(fh, 'sha256').hexdigest()
    results[city] = {'file': dest.name, 'bytes': dest.stat().st_size, 'sha256': sha, 'validPixels': valid_total,
                     'tileCount':len(items), 'crs':'EPSG:5179','pixelSizeMeters':1,'noData':-9999}

(OUT / 'manifest.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
(OUT / 'README.txt').write_text('수원시·인천시 1m 수관높이 행정경계 통합본\n\n각 도시별 GeoTIFF 1개입니다. QGIS/ArcGIS에서 열 수 있습니다.\n좌표계 EPSG:5179, 높이 단위 m, 경계 밖 NoData=-9999.\n행정경계 파일과 SHA-256 검증 기록을 함께 제공합니다.\nMeta/WRI v1 과거 위성영상 기반 추정값이며 2026년 실측 자료가 아닙니다.\n현재 작업에 사용한 경계 기준으로 잘랐으며 최신 지적경계를 보증하지 않습니다.\n인천은 도서 지역 간 바다가 넓어 영상 크기(가로·세로 픽셀 수)가 큽니다.\n압축된 sparse BigTIFF이며 바다·경계 밖 빈 블록은 NoData로 읽습니다.\n출처: Meta and WRI, High Resolution Canopy Height Maps; CC BY 4.0\nhttps://gee-community-catalog.org/projects/meta_trees/\n', encoding='utf-8-sig')
bundle = OUT / 'suwon_incheon_canopy_1m.zip'
with zipfile.ZipFile(bundle, 'w', compression=zipfile.ZIP_STORED, allowZip64=True) as z:
    for path in sorted(OUT.iterdir()):
        if path != bundle and path.is_file():
            z.write(path, path.name)
with zipfile.ZipFile(bundle) as z:
    assert z.testzip() is None
print(json.dumps({'files':results,'zip':str(bundle),'zipBytes':bundle.stat().st_size}), flush=True)
