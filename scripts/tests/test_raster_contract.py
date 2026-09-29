import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('raster_index_builder', Path(__file__).parents[1]/'build-raster-index.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class GridContractTests(unittest.TestCase):
    def header(self):
        return dict(crs='EPSG:5179', bands=1, dtype='float32', nodata=-9999,
                    transform=[100, 0, 745900, 0, -100, 2068600], width=5569, height=6107)

    def test_aligned_subset_is_valid(self):
        header = self.header()
        header.update(transform=[100, 0, 935000, 0, -100, 1950000], width=300, height=300)
        self.assertEqual(module.validate_header(header), [])

    def test_half_pixel_offset_rejected(self):
        header = self.header()
        header['transform'][2] += 50
        self.assertIn('grid-alignment', module.validate_header(header))

    def test_crs_resolution_rotation_nodata_rejected(self):
        header = self.header()
        header.update(crs='EPSG:4326', nodata=None, transform=[30, 1, 745900, 0, -30, 2068600])
        errors = module.validate_header(header)
        self.assertTrue({'crs', 'nodata', 'resolution-or-rotation'}.issubset(errors))


if __name__ == '__main__':
    unittest.main()
