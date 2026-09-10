from precompute_asos_wbgt import *
out=ROOT/'output/wbgt_asos_pilot'; key=load_key(); manifest=[]
for name,endpoint,params in [
 ('daily_check','kma_sfcdd.php',dict(tm='20250801',stn=119,help=1)),
 ('national_availability','kma_sfctm2.php',dict(tm='202508011300',stn=0,help=1))]:
 txt=fetch_cached(out/'sources'/f'{name}.txt.gz',endpoint,params,key,manifest)
 if name=='national_availability':
  obs=parse_hourly(txt); print('national',len(obs),'SI available',int(obs.solar_mj_m2.notna().sum()))
  obs.to_csv(out/'national_availability_202508011300.csv',index_label='timestamp_kst')
 else:
  print(txt)
for year,month in [(2021,6),(2025,8)]:
 df=pd.read_csv(out/'hourly'/f'wbgt_119_{year}_{month:02d}.csv.gz')
 print('missing hours',year,month,df.loc[df.wbgt_c.isna(),['timestamp_kst','solar_mj_m2','solar_status']].head(12).to_string(index=False))
try:
 raw=urllib.request.urlopen('https://api.github.com/repos/ecmwf/thermofeel/contents/tests',timeout=30).read()
 print('tests',[(x['name'],x['download_url']) for x in json.loads(raw) if 'lil' in x['name'] or 'wbgt' in x['name']])
except Exception as e: print('test_listing',type(e).__name__)
