import json
import unittest
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely import box, Polygon

from build_landcover import cell_values, repair_shapes, validate_grid, normalize_class_codes, imagery_date_counts


class LandcoverContractTests(unittest.TestCase):
    def setUp(self):
        self.classes = json.loads(Path(__file__).with_name('landcover-classes.json').read_text(encoding='utf-8'))
        self.cell = np.array([box(0, 0, 100, 100)], dtype=object)

    def values(self, shapes, codes, blocked=None):
        return cell_values(self.cell, np.array(shapes, dtype=object), np.array(codes),
                           np.zeros(len(shapes), dtype=bool) if blocked is None else np.array(blocked), self.classes)

    def test_overlap_union_not_sum_and_percent_denominator(self):
        data, coverage, status = self.values([box(0, 0, 60, 100), box(40, 0, 80, 100), box(80, 0, 100, 100)], ['154', '154', '311'])
        np.testing.assert_allclose(data, [[80, 20]])
        np.testing.assert_allclose(coverage, [10000])
        self.assertEqual(status.tolist(), ['valid'])

    def test_missing_coverage_is_not_zero(self):
        data, _, status = self.values([box(0, 0, 99, 100)], ['311'])
        self.assertTrue(np.isnan(data).all())
        self.assertEqual(status.tolist(), ['missing_source_coverage'])

    def test_known_water_is_valid_zero_for_both(self):
        data, _, status = self.values([self.cell[0]], ['711'])
        np.testing.assert_equal(data, [[0, 0]])
        self.assertEqual(status.tolist(), ['valid'])

    def test_official_railway_and_greenhouse_are_distinct(self):
        data, _, _ = self.values([box(0, 0, 40, 100), box(40, 0, 100, 100)], ['153', '231'])
        np.testing.assert_allclose(data, [[60, 0]])

    def test_material_repair_is_not_silently_admitted(self):
        bowtie = Polygon([(0, 0), (100, 100), (100, 0), (0, 100), (0, 0)])
        frame = gpd.GeoDataFrame(geometry=[bowtie], crs=5179)
        shapes, blocked, audit = repair_shapes(frame)
        self.assertTrue(shapes[0].is_valid)
        self.assertTrue(blocked[0])
        self.assertEqual(audit[0]['status'], 'review_required')
        data, _, status = self.values([self.cell[0], shapes[0]], ['311', '154'], [False, True])
        self.assertTrue(np.isnan(data).all())
        self.assertEqual(status.tolist(), ['geometry_review_required'])

    def test_boundary_touch_to_review_polygon_does_not_block(self):
        data, _, status = self.values([self.cell[0], box(100, 0, 200, 100)], ['311', '154'], [False, True])
        np.testing.assert_equal(data, [[0, 100]])
        self.assertEqual(status.tolist(), ['valid'])

    def test_missing_classification_blocks_only_cells_with_area_intersection(self):
        cells = np.array([box(0, 0, 100, 100), box(100, 0, 200, 100)], dtype=object)
        codes = normalize_class_codes(pd.Series(['311', None, '154']), self.classes)
        values, coverage, status = cell_values(cells,
            np.array([box(0, 0, 50, 100), box(50, 0, 100, 100), box(100, 0, 200, 100)], dtype=object),
            codes, np.zeros(3, dtype=bool), self.classes)
        self.assertTrue(np.isnan(values[0]).all())
        np.testing.assert_equal(values[1], [100, 0])
        np.testing.assert_allclose(coverage, [10000, 10000])
        self.assertEqual(status.tolist(), ['missing_source_classification', 'valid'])

    def test_nullable_class_codes_do_not_raise_type_error_or_become_valid_zero(self):
        values = pd.Series([None, np.nan, pd.NA, '', '  ', '311'], dtype='object')
        codes = normalize_class_codes(values, self.classes)
        self.assertEqual(codes.tolist(), ['', '', '', '', '', '311'])
        with self.assertRaisesRegex(ValueError, 'Unreviewed land-cover classes: 999'):
            normalize_class_codes(pd.Series([None, '999']), self.classes)
        with self.assertRaisesRegex(ValueError, 'Unreviewed land-cover classes: nan'):
            normalize_class_codes(['nan'], self.classes)

    def test_missing_imagery_dates_are_counted_without_inventing_a_date(self):
        counts = imagery_date_counts(pd.Series(['2020-12-31', None, np.nan, '']))
        self.assertEqual(counts, {'2020-12-31': 1, '(missing)': 3})

    def test_reference_index_must_match_current_platform(self):
        grid = pd.DataFrame([['41110', 0, 1, 50, 150]], columns=['region_code', 'cell_index', 'cell_id', 'x', 'y'])
        meta = {'crs': 'EPSG:5179', 'gridUnit': '100m', 'rows': 2, 'columns': 2,
                'extent': {'xmin': 0, 'ymin': 0, 'xmax': 200, 'ymax': 200}}
        validate_grid(grid, meta)
        grid['cell_index'] = 2
        with self.assertRaisesRegex(ValueError, 'cell_index mismatch'):
            validate_grid(grid, meta)


if __name__ == '__main__':
    unittest.main()
