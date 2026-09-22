"""Resumable GEE exports; no Drive deletion. Run with .venv-gee Python."""
import argparse
import hashlib
import json
import shutil
from collections import Counter
from datetime import datetime, timezone, timedelta
from pathlib import Path

import ee
import rasterio
from rasterio.features import bounds as geometry_bounds
from rasterio.warp import transform_bounds
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

ROOT = Path(__file__).resolve().parents[1]
OUT = Path('D:/LivingLabsData/canopy-height')
STATE = ROOT / '.runtime-logs/canopy-queue.json'
SOURCE = 'projects/sat-io/open-datasets/facebook/meta-canopy-height'
FOLDER = 'LivingLabs_Canopy_1m'


def save(s):
    s['updated'] = datetime.now(timezone.utc).isoformat()
    tmp = STATE.with_suffix('.tmp')
    tmp.write_text(json.dumps(s, ensure_ascii=False, indent=2), encoding='utf-8')
    tmp.replace(STATE)


def boundary(stage, tile_geometry=None):
    path = ROOT / ('public/data/suwon-boundary.geojson' if stage == 'suwon'
                   else 'public/data/climate/admin-boundaries.geojson')
    data = json.loads(path.read_text(encoding='utf-8-sig'))
    features = data['features']
    if stage == 'incheon':
        features = [f for f in features if str(f['properties']['code']).startswith('28')]
    if stage == 'national':
        features = [f for f in features if not str(f['properties']['code']).startswith(('28', '4111'))]
    if tile_geometry is not None:
        # Keep whole intersecting district geometries, including every island;
        # only omit distant districts. Padding also covers projection edge effects.
        west, south, east, north = transform_bounds('EPSG:5179', 'EPSG:4326', *geometry_bounds(tile_geometry), densify_pts=101)
        pad = 0.02
        features = [f for f in features
                    if geometry_bounds(f['geometry'])[0] <= east + pad
                    and geometry_bounds(f['geometry'])[2] >= west - pad
                    and geometry_bounds(f['geometry'])[1] <= north + pad
                    and geometry_bounds(f['geometry'])[3] >= south - pad]
    if not features:
        raise RuntimeError('No boundary features')
    cleaned = []
    removed = []
    for f in features:
        g = f['geometry']
        polygons = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        kept = []
        for pi, rings in enumerate(polygons):
            good = []
            for ri, ring in enumerate(rings):
                if len(set(tuple(p) for p in ring)) < 3:
                    removed.append({'properties': f['properties'], 'polygon': pi, 'ring': ri, 'coordinates': ring, 'reason': 'Fewer than 3 distinct vertices; zero-area degenerate ring'})
                    if ri == 0:
                        good = []
                        break
                    continue
                good.append(ring if ring[0] == ring[-1] else ring + [ring[0]])
            if good:
                kept.append(good)
        if kept:
            cleaned.append(ee.Feature(ee.Geometry({'type': 'MultiPolygon', 'coordinates': kept})))
    if tile_geometry is None:
        (ROOT / f'.runtime-logs/canopy-{stage}-boundary-cleaning.json').write_text(json.dumps({'removedZeroAreaRings': removed}, ensure_ascii=False, indent=2), encoding='utf-8')
    return ee.FeatureCollection(cleaned).geometry()


def verify(path):
    with rasterio.open(path) as ds:
        if ds.crs.to_epsg() != 5179 or ds.res != (1.0, 1.0) or ds.count != 1 or ds.nodata != -9999:
            raise RuntimeError('Unexpected raster grid')
        valid = 0
        for _, window in ds.block_windows(1):
            valid += int(ds.read_masks(1, window=window).astype(bool).sum())
        return {'validPixels': valid, 'width': ds.width, 'height': ds.height}


def run(limit):
    OUT.mkdir(parents=True, exist_ok=True)
    ee.Initialize(project='livinglabprojects')
    drive = build('drive', 'v3', credentials=Credentials(token=None, **ee.oauth.get_credentials_arguments()), cache_discovery=False)
    s = json.loads(STATE.read_text(encoding='utf-8')) if STATE.exists() else {
        'source': SOURCE, 'output': str(OUT), 'stages': {},
        'encoding': 'Original cover_code values preserved as Int16; EE mask exported as -9999. Source 255 is NOT silently reclassified. Semantic QA pending.',
        'boundaryNote': 'Existing local administrative boundaries; island completeness must be audited before declaring nationwide complete.'}
    tasks = {t.id: t for t in ee.batch.Task.list()}
    for entries in s['stages'].values():
        for item in entries:
            if item['status'] in ('VERIFIED', 'EMPTY_SOURCE', 'EMPTY_BOUNDARY') or not item.get('taskId'):
                continue
            matches = [t for t in tasks.values() if t.config and t.config.get('description') == item['name']]
            if len(matches) == 1:
                item['taskId'] = matches[0].id
            elif len(matches) > 1:
                raise RuntimeError('Duplicate remote tasks require review: ' + item['name'])
            status = ee.data.getTaskStatus(item['taskId'])[0]
            item['status'] = status['state']
            item['remoteTiming'] = {k: status[k] for k in ('creation_timestamp_ms', 'start_timestamp_ms', 'update_timestamp_ms') if k in status}
            if status.get('error_message'):
                item['error'] = status['error_message']
            if item['status'] != 'COMPLETED':
                continue
            files = drive.files().list(q=f"name='{item['name']}.tif' and trashed=false", fields='files(id,name,size,md5Checksum)').execute()['files']
            if len(files) != 1:
                raise RuntimeError('Expected exactly one output file: ' + item['name'])
            remote = files[0]
            if shutil.disk_usage(OUT).free < int(remote['size']) + 10 * 1024**3:
                raise RuntimeError('D drive reserve reached')
            dest = OUT / (item['name'] + '.tif')
            part = dest.with_suffix('.part')
            with part.open('wb') as fh:
                downloader = MediaIoBaseDownload(fh, drive.files().get_media(fileId=remote['id']), chunksize=8*1024**2)
                done = False
                while not done:
                    _, done = downloader.next_chunk(num_retries=3)
            with part.open('rb') as fh:
                digest = hashlib.file_digest(fh, 'md5').hexdigest()
            if part.stat().st_size != int(remote['size']) or digest != remote['md5Checksum']:
                raise RuntimeError('Download checksum mismatch')
            item['raster'] = verify(part)
            part.replace(dest)
            item.update(status='VERIFIED' if item['raster']['validPixels'] else 'EMPTY_SOURCE', md5=digest, bytes=int(remote['size']), local=str(dest), verifiedAt=datetime.now(timezone.utc).isoformat())
            save(s)
    stage = next((k for k in ['suwon', 'incheon', 'national'] if k not in s['stages'] or any(i['status'] not in ('VERIFIED', 'EMPTY_BOUNDARY') for i in s['stages'][k])), None)
    if stage is None:
        print('All planned files verified; boundary/semantic coverage audit still required.')
        return
    preceding = {'incheon': 'suwon', 'national': 'incheon'}.get(stage)
    if preceding and preceding not in s.get('qaApprovedStages', []):
        save(s)
        print(f'{preceding}: downloads verified; boundary and source-value QA required before {stage}.')
        return
    geom = boundary(stage)
    if stage not in s['stages']:
        grid = geom.coveringGrid(ee.Projection('EPSG:5179'), 10000).getInfo()['features']
        s['stages'][stage] = [{'name': f'chm_v1_{stage}_{i:04d}', 'geometry': f['geometry'], 'status': 'PENDING'} for i, f in enumerate(grid)]
        save(s)
    quota = drive.about().get(fields='storageQuota').execute()['storageQuota']
    free = int(quota['limit']) - int(quota['usage'])
    s['storage'] = {'driveFreeBytes': free, 'localFreeBytes': shutil.disk_usage(OUT).free}
    # Account for all active tasks conservatively; reserve 1 GiB per outstanding task.
    active = sum(t.state in ('READY', 'RUNNING') for t in tasks.values())
    available = max(0, free // 1024**3 - active - 5)
    korea_tz = timezone(timedelta(hours=9))
    today = datetime.now(korea_tz).date()
    submitted_today = sum(
        bool(i.get('submittedAt')) and datetime.fromisoformat(i['submittedAt']).astimezone(korea_tz).date() == today
        for entries in s['stages'].values() for i in entries)
    capacity = min(limit, available, max(0, 50-active), max(0, 50-submitted_today))
    for item in s['stages'][stage]:
        if capacity <= 0:
            break
        if item['status'] != 'PENDING':
            continue
        tile = ee.Geometry(item['geometry'])
        tile_boundary = boundary(stage, item['geometry'])
        image = ee.ImageCollection(SOURCE).filterBounds(tile).sort('system:index').mosaic().select('cover_code').clip(tile_boundary).toInt16().unmask(-9999, sameFootprint=False)
        task = ee.batch.Export.image.toDrive(image=image, description=item['name'], folder=FOLDER,
            fileNamePrefix=item['name'], region=tile, crs='EPSG:5179', crsTransform=[1,0,0,0,-1,0],
            maxPixels=2e8, fileFormat='GeoTIFF', formatOptions={'cloudOptimized': True, 'noData': -9999})
        # Persist the allocated task id before submitting, so an uncertain response is recoverable.
        task.id = task._request_id = ee.data.newTaskId()[0]
        item.update(taskId=task.id, status='SUBMITTING', submittedAt=datetime.now(timezone.utc).isoformat())
        save(s)
        task.start()
        item['status'] = 'READY'
        save(s)
        capacity -= 1
    save(s)
    print(json.dumps({k: dict(Counter(i['status'] for i in v)) for k,v in s['stages'].items()}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int, default=0, choices=range(51))
    args = parser.parse_args()
    # Windows releases this advisory lock on process exit, including crashes.
    import msvcrt
    STATE.parent.mkdir(exist_ok=True)
    with STATE.with_suffix('.lock').open('a+b') as lock:
        lock.seek(0)
        msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        run(args.limit)
