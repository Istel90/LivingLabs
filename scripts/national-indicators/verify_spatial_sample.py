"""Read-only whole-polygon sample verification of a regional land-cover build."""
import argparse
import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import pyogrio
from pyproj import Transformer
from shapely import STRtree, box, make_valid, union_all

from build_landcover import write_json
from verify_landcover import verify_region


def verify(build, region, source):
    directory = build / region
    files = verify_region(directory)
    keys = ('impervious-area-ratio', 'forest-grass-area-component')
    tables = [pd.read_csv(directory / (key + '.csv.gz')) for key in keys]
    data = json.loads((directory / (keys[0] + '.json')).read_text(encoding='utf8'))
    info = pyogrio.read_info(source)
    extent = data['extent']
    bounds = Transformer.from_crs(5179, info['crs'], always_xy=True).transform_bounds(
        *[extent[key] for key in ('xmin', 'ymin', 'xmax', 'ymax')], densify_pts=21)
    frame = gpd.read_file(source, bbox=bounds, columns=['L3_CODE'], engine='pyogrio', fid_as_index=True).to_crs(5179)
    original = frame.geometry.to_numpy()
    shapes = np.array([g if g.is_valid else make_valid(g) for g in original], dtype=object)
    materially_changed = np.array([abs(new.area-old.area) > max(.01, abs(old.area)*1e-6) for old,new in zip(original,shapes)])
    codes = np.array(['' if pd.isna(value) else str(value).strip() for value in frame.L3_CODE], dtype=object)
    tree = STRtree(shapes)
    classes = json.loads(Path(__file__).with_name('landcover-classes.json').read_text(encoding='utf8'))
    rng = np.random.default_rng(20211001)
    sample = set()
    for status in tables[0].status.unique():
        indices = tables[0].index[tables[0].status.eq(status)].to_numpy()
        limit = 200 if status == 'valid' else (len(indices) if status == 'missing_source_classification' else 100)
        sample.update(rng.choice(indices, min(limit, len(indices)), replace=False).tolist())
    max_delta, tested, unclassified = 0.0, {}, []
    for index in sorted(sample):
        row = tables[0].iloc[index]
        cell = box(row.x-50,row.y-50,row.x+50,row.y+50)
        selected = tree.query(cell, predicate='intersects')
        fragments = [shapes[i].intersection(cell) for i in selected]
        coverage = union_all(fragments).area
        missing_area = union_all([g for g,i in zip(fragments,selected) if codes[i] == '']).area
        blocked = any(materially_changed[i] and g.area > 1e-6 for g,i in zip(fragments,selected))
        expected_status = ('geometry_review_required' if blocked else 'missing_source_classification' if missing_area > 1e-6
                           else 'missing_source_coverage' if 10000-coverage > 1e-6 else 'valid')
        assert row.status == expected_status, (int(row.cell_index),row.status,expected_status)
        tested[row.status] = tested.get(row.status,0)+1
        if row.status != 'valid':
            assert all(pd.isna(table.iloc[index].raw_value) for table in tables)
            if row.status == 'missing_source_classification':
                unclassified.append({'cellIndex':int(row.cell_index),'cellId':int(row.cell_id),'unclassifiedAreaM2':missing_area})
            continue
        for column, allowed in enumerate((classes['impervious'], classes['forestGrassComponent'])):
            expected = union_all([g for g,i in zip(fragments,selected) if codes[i] in allowed]).area/100
            actual = tables[column].iloc[index].raw_value
            max_delta = max(max_delta,abs(expected-actual))
            assert abs(expected-actual) < 1e-7,(int(row.cell_index),column,expected,actual)
    result = {**files, 'spatialSample':{'status':'passed','source':str(source),'method':'whole-polygon intersections without tile clipping',
              'seed':20211001,'sampledCells':len(sample),'byStatus':tested,'maxPercentagePointDifference':max_delta,
              'unclassifiedCells':unclassified}}
    write_json(build / ('spatial-verification-'+region+'.json'),result)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build',type=Path,required=True)
    parser.add_argument('--region',required=True)
    parser.add_argument('--source',type=Path,required=True)
    args = parser.parse_args()
    print(json.dumps(verify(args.build,args.region,args.source),ensure_ascii=False),flush=True)
