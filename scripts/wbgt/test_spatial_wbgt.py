"""Numerical and spatial regression checks independent of national observations."""

import unittest
import numpy as np
from build_national_spatial_wbgt import shade_fraction, interpolated_weather, PAD, TO_XY


class SpatialTests(unittest.TestCase):
    def canvas(self):
        return np.zeros((10 + 2 * PAD, 10 + 2 * PAD), dtype="float32")

    def test_open_ground_has_no_building_shade(self):
        h = self.canvas()
        s, b, u = shade_fraction(h, h.astype(bool), 45, 180, 1, 1)
        self.assertEqual((float(s[0, 0]), float(b[0, 0]), float(u[0, 0])), (0, 0, 0))

    def test_southern_building_casts_shadow_north_across_tile_boundary(self):
        h = self.canvas()
        h[PAD + 10, PAD : PAD + 10] = 50
        north, _, _ = shade_fraction(h, h.astype(bool) & False, 45, 180, 1, 1)
        south, _, _ = shade_fraction(h, h.astype(bool) & False, 45, 0, 1, 1)
        self.assertGreater(north[0, 0], 0.3)
        self.assertEqual(south[0, 0], 0)

    def test_higher_building_does_not_reduce_shadow(self):
        h = self.canvas()
        h[PAD + 10, PAD : PAD + 10] = 20
        low, _, _ = shade_fraction(h, h.astype(bool) & False, 45, 180, 1, 1)
        high, _, _ = shade_fraction(h * 2, h.astype(bool) & False, 45, 180, 1, 1)
        self.assertGreater(high[0, 0], low[0, 0])

    def test_unknown_height_is_not_invented_and_roofs_are_excluded(self):
        h = self.canvas()
        u = h.astype(bool)
        u[PAD : PAD + 10, PAD : PAD + 10] = True
        s, b, unknown = shade_fraction(h, u, 45, 180, 1, 1)
        self.assertTrue(np.isnan(s[0, 0]))
        self.assertEqual(b[0, 0], 1)
        self.assertEqual(unknown[0, 0], 1)

    def test_weather_interpolation_respects_dem_lapse_and_stays_finite(self):
        condition = {
            "temperature_c": 30.0,
            "humidity_pct": 60.0,
            "station_pressure_hpa": 1000.0,
            "wind_equivalent_10m_ms": 2.0,
        }
        stations = [
            {
                "longitude": 127 + i * 0.01,
                "latitude": 37.0,
                "elevation_m": 100.0,
                "conditions": {"12": condition},
            }
            for i in range(6)
        ]
        x, y = TO_XY.transform(127.0, 37.0)
        a = interpolated_weather(
            stations,
            np.array([[x, x]]),
            np.array([[y, y]]),
            np.array([[100.0, 200.0]]),
            12,
        )
        np.testing.assert_allclose(a[0], [30.0, 29.35], atol=1e-8)
        self.assertGreater(a[1][1], a[1][0])
        self.assertLess(a[2][1], a[2][0])
        np.testing.assert_allclose(a[3], 2.0)


if __name__ == "__main__":
    unittest.main()
