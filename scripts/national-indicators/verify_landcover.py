"""Independently check written rasters/tables and a spatial sample against whole polygons."""
import argparse
import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
from shapely import STRtree, box, make_valid, union_all

from build_landcover import digest, write_json


def verify_region(directory, sample_source=None):
    report = json.loads((directory / 'region-report.json').read_text(encoding='utf-8'))
    for name, expected in report['outputSha256'].items():
        assert digest(directory / name) == expected, name + ': changed output'
    verified = []
    tables = []
    for key in ('impervious-area-ratio', 'forest-grass-area-component'):
        table = pd.read_csv(directory / (key + '.csv.gz'))
        tables.append(table)
        result = json.loads((directory / (key + '.json')).read_text(encoding='utf-8'))
        pairs = np.asarray(result['rawSparseValues'], dtype=float).reshape((-1, 2))
        valid = table.raw_value.notna()
        assert valid.equals(table.status.eq('valid'))
        assert table.loc[valid, 'raw_value'].between(0, 100).all()
        assert table.source_year.eq(result['sourceYear']).all()
        np.testing.assert_array_equal(pairs[:, 0], table.loc[valid, 'cell_index'])
        np.testing.assert_allclose(pairs[:, 1], table.loc[valid, 'raw_value'], rtol=0, atol=1e-12)
        with rasterio.open(directory / (key + '.tif')) as raster:
            assert raster.crs.to_epsg() == 5179 and raster.res == (100, 100)
            assert raster.shape == (result['rows'], result['columns'])
            assert raster.transform.c == result['extent']['xmin'] and raster.transform.f == result['extent']['ymax']
            assert raster.tags()['source_year'] == str(result['sourceYear'])
            data = raster.read(1).ravel()
            expected = np.full(data.shape, raster.nodata, dtype=np.float32)
            expected[table.loc[valid, 'cell_index'].to_numpy(dtype=int)] = table.loc[valid, 'raw_value'].to_numpy(dtype=np.float32)
            np.testing.assert_array_equal(data, expected)
        verified.append({'indicator': key, 'validCells': int(valid.sum()), 'targetCells': len(table)})
    spatial = None
    if sample_source:
        frame = gpd.read_file(sample_source, engine='pyogrio').to_crs(5179)
        geometries = np.array([g if g.is_valid else make_valid(g) for g in frame.geometry], dtype=object)
        # Independent null handling for the whole-polygon reference calculation.
        codes = np.array(['' if pd.isna(value) else str(value).strip() for value in frame.L3_CODE], dtype=object)
        tree = STRtree(geometries)
        classes = json.loads(Path(__file__).with_name('landcover-classes.json').read_text(encoding='utf-8'))
        indices = set(np.random.default_rng(20211001).choice(len(tables[0]), min(200, len(tables[0])), replace=False).tolist())
        indices.update(tables[0].index[tables[0].status.ne('valid')].tolist())
        max_delta = 0.0
        for index in sorted(indices):
            row = tables[0].iloc[index]
            cell = box(row.x - 50, row.y - 50, row.x + 50, row.y + 50)
            selected = tree.query(cell, predicate='intersects')
            clipped = [geometries[i].intersection(cell) for i in selected]
            cover = union_all(clipped).area
            unclassified_area = union_all([g for g, i in zip(clipped, selected) if codes[i] == '']).area
            if row.status == 'missing_source_classification':
                assert unclassified_area > 1e-6
                assert all(pd.isna(table.iloc[index].raw_value) for table in tables)
                continue
            if row.status == 'missing_source_coverage':
                assert 10000 - cover > 1e-6
                continue
            if row.status == 'geometry_review_required':
                continue
            assert 10000 - cover <= 1e-6
            assert unclassified_area <= 1e-6
            for column, allowed in enumerate((classes['impervious'], classes['forestGrassComponent'])):
                expected = union_all([g for g, i in zip(clipped, selected) if codes[i] in allowed]).area / 100
                actual = tables[column].iloc[index].raw_value
                max_delta = max(max_delta, abs(expected - actual))
                assert abs(expected - actual) < 1e-7, (index, expected, actual)
        spatial = {'sampledCells': len(indices), 'method': 'whole-polygon intersection without tile clipping',
                   'maxPercentagePointDifference': max_delta, 'seed': 20211001}
    return {'regionCode': report['regionCode'], 'status': 'passed', 'formats': ['csv', 'json', 'geotiff'],
            'indicators': verified, 'spatialSample': spatial, 'platformVerified': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build', type=Path, required=True)
    parser.add_argument('--region', default='41110')
    parser.add_argument('--sample-source', type=Path)
    args = parser.parse_args()
    report = verify_region(args.build / args.region, args.sample_source)
    write_json(args.build / ('verification-' + args.region + '.json'), report)
    print(json.dumps(report, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
