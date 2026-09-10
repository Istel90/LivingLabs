import sys, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from precompute_asos_wbgt import *
FIX=Path(__file__).parent/'fixtures'

class TestAsosWbgt(unittest.TestCase):
    def setUp(self):
        self.obs=parse_hourly((FIX/'asos_119_20250801.txt').read_text(encoding='utf-8'))
        self.station=parse_stations((FIX/'station_119.txt').read_text(encoding='utf-8'))[119]

    def test_official_daily_solar_total(self):
        self.assertAlmostEqual(float(self.obs.solar_mj_m2.sum()),20.14,places=6)
        self.assertAlmostEqual(float(self.obs.solar_mj_m2.max()),2.88,places=6)

    def test_metadata_indices(self):
        self.assertEqual(self.station['name'],'수원')
        self.assertAlmostEqual(self.station['elevation_m'],39.81)
        self.assertAlmostEqual(self.station['wind_height_m'],18.70)

    def test_solar_unit_and_hour_pairing(self):
        result=calculate(self.obs,self.station)
        row=result.loc[pd.Timestamp('2025-08-01 13:00',tz='Asia/Seoul')]
        self.assertAlmostEqual(row.solar_w_m2,800.0)
        self.assertEqual(row.temperature_c,33.5)
        self.assertEqual(row.humidity_pct,52)
        self.assertEqual(row.station_pressure_hpa,998.5)
        self.assertLess(row.wind_model_2m_ms,row.wind_speed_ms)

    def test_daytime_missing_not_zero(self):
        obs=self.obs.copy(); t=pd.Timestamp('2025-08-01 13:00',tz='Asia/Seoul')
        obs.loc[t,'solar_mj_m2']=np.nan
        result=calculate(obs,self.station)
        self.assertTrue(np.isnan(result.loc[t,'wbgt_c']))
        self.assertEqual(result.loc[t,'solar_status'],'missing')
        self.assertTrue(np.isnan(aggregate(result,2025,119).iloc[0].wbgt_hourly_max_c))

    def test_no_solar_station_never_filled(self):
        obs=self.obs.copy();obs['solar_mj_m2']=np.nan
        result=calculate(obs,self.station)
        self.assertTrue(result.wbgt_c.isna().all())
        self.assertTrue((result.solar_status=='missing').all())

    def test_zero_observation_preserved(self):
        obs=self.obs.copy();t=pd.Timestamp('2025-08-01 13:00',tz='Asia/Seoul')
        obs.loc[t,'solar_mj_m2']=0
        result=calculate(obs,self.station)
        self.assertEqual(result.loc[t,'solar_w_m2'],0)
        self.assertEqual(result.loc[t,'solar_status'],'observed')
        self.assertTrue(np.isfinite(result.loc[t,'wbgt_c']))

    def test_night_fill_explicit(self):
        result=calculate(self.obs,self.station)
        row=result.loc[pd.Timestamp('2025-08-01 02:00',tz='Asia/Seoul')]
        self.assertTrue(np.isnan(row.solar_mj_m2))
        self.assertEqual(row.solar_status,'night_zero_assumption')
        self.assertEqual(row.solar_w_m2,0)

    def test_missing_weather_not_computed(self):
        obs=self.obs.copy();obs.iloc[12,obs.columns.get_loc('humidity_pct')]=np.nan
        result=calculate(obs,self.station)
        self.assertTrue(np.isnan(result.iloc[12].wbgt_c))
        self.assertEqual(result.iloc[12].calculation_status,'missing_input')

    def test_duplicate_rejected(self):
        txt=(FIX/'asos_119_20250801.txt').read_text(encoding='utf-8')
        line=next(x for x in txt.splitlines() if x.startswith('20250801'))
        with self.assertRaisesRegex(ValueError,'Duplicate'): parse_hourly(txt+'\n'+line)

    def test_upstream_liljegren_reference(self):
        data=np.genfromtxt(FIX/'thermofeel_testcases.csv',delimiter=',',names=True)
        expected=np.loadtxt(FIX/'wbgt_liljegren.csv')
        result=thermofeel.calculate_wbgt_liljegren(data['t2m'],thermofeel.calculate_relative_humidity_percent(data['t2m'],data['td']),
            np.full_like(data['t2m'],1013.25),data['va'],data['ssrd']/3600,data['fdir']/data['ssrd'],data['cossza'])
        np.testing.assert_allclose(result,expected,atol=1e-6,rtol=0)

    def test_saturated_air_without_solar(self):
        wbgt=thermofeel.calculate_wbgt_liljegren(np.array([303.15]),np.array([100.]),np.array([1013.25]),
            np.array([3.]),np.array([0.]),np.array([0.]),np.array([-0.5]),wind_scaling='brode')[0]-273.15
        self.assertAlmostEqual(wbgt,30.,delta=.5)


    def test_idw_exact_and_constant(self):
        from build_h11_grid import idw
        points=np.array([[0.,0.],[1.,0.],[0.,1.]])
        values=np.array([30.,32.,34.])
        np.testing.assert_allclose(idw(points,values,points),values)
        np.testing.assert_allclose(idw(points,np.full(3,31.),np.array([[.2,.4],[4.,4.]])),[31.,31.])

if __name__=='__main__': unittest.main()
