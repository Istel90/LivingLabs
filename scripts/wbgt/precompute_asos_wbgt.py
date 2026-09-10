"""ASOS hourly -> precomputed outdoor WBGT. No database/UI mutations."""
from __future__ import annotations
import argparse, calendar, gzip, hashlib, json, os, re, time, urllib.parse, urllib.request
from pathlib import Path
from datetime import datetime, timezone
import truststore
truststore.inject_into_ssl()
import numpy as np
import pandas as pd
import pvlib
import thermofeel
from importlib.metadata import version

ROOT = Path(__file__).resolve().parents[2]
BASE_URL = 'https://apihub.kma.go.kr/api/typ01/url/'
MODEL_VERSION = 'asos-hourly-wbgt-v1'
COLS = 'TM STN WD WS GST_WD GST_WS GST_TM PA PS PT PR TA TD HM PV RN RN_DAY RN_JUN RN_INT SD_HR3 SD_DAY SD_TOT WC WP WW CA_TOT CA_MID CH_MIN CT CT_TOP CT_MID CT_LOW VS SS SI ST_GD TS TE_005 TE_01 TE_02 TE_03 ST_SEA WH BF IR IX'.split()
INPUTS = {'TA': 'temperature_c', 'HM': 'humidity_pct', 'WS': 'wind_speed_ms', 'PA': 'station_pressure_hpa', 'SI': 'solar_mj_m2'}

def load_key():
    key = os.environ.get('KMA_API_KEY')
    if key: return key
    for p in [ROOT/'riskmap-core-main/.env.local', ROOT/'.env.local']:
        if p.exists():
            m = re.search(r'^KMA_API_KEY=(.*)$', p.read_text(encoding='utf-8-sig'), re.M)
            if m: return m.group(1).strip().strip('\"\'')
    raise RuntimeError('KMA_API_KEY missing')

def decode(raw):
    try: return raw.decode('utf-8')
    except UnicodeDecodeError: return raw.decode('cp949')

def fetch_cached(path, endpoint, params, key, manifest):
    if path.exists():
        raw = gzip.decompress(path.read_bytes())
    else:
        url = BASE_URL + endpoint + '?' + urllib.parse.urlencode({**params, 'authKey': key})
        for attempt in range(3):
            try:
                raw = urllib.request.urlopen(url, timeout=60).read()
                txt = decode(raw)
                if key in txt or '#7777END' not in txt:
                    raise ValueError('Invalid KMA response')
                break
            except Exception:
                if attempt == 2: raise RuntimeError(f'KMA request failed: {endpoint}, {params}') from None
                time.sleep(attempt + 1)
        path.parent.mkdir(parents=True, exist_ok=True)
        temp = path.with_suffix('.tmp')
        temp.write_bytes(gzip.compress(raw, mtime=0)); temp.replace(path)
    txt = decode(raw)
    if '#7777END' not in txt: raise ValueError(f'Incomplete cache: {path.name}')
    manifest.append(dict(endpoint=BASE_URL+endpoint, params=params, file=str(path), sha256=hashlib.sha256(raw).hexdigest()))
    return txt

def parse_hourly(txt):
    rows=[]; seen=set()
    for line in txt.splitlines():
        if not re.match(r'^\d{12}\s', line): continue
        parts=line.split()
        if len(parts)!=len(COLS): raise ValueError(f'ASOS columns changed: {len(parts)}')
        r=dict(zip(COLS, parts)); ident=(r['TM'],r['STN'])
        if ident in seen: raise ValueError('Duplicate station-hour')
        seen.add(ident)
        row={'timestamp':pd.Timestamp(datetime.strptime(r['TM'],'%Y%m%d%H%M'),tz='Asia/Seoul'),'station_id':int(r['STN'])}
        for field, name in INPUTS.items():
            val=float(r[field])
            # ASOS -9/-99 missing codes differ from the AWS collector convention.
            # Treat -9 as missing in this warm-season-only parser; do not reuse for winter.
            if field=='TA': valid=(-80<=val<=60 and val not in (-9,-99,-99.9,-999))
            elif field=='HM': valid=0<val<=100
            elif field=='WS': valid=0<=val<=100
            elif field=='PA': valid=500<=val<=1100
            else: valid=0<=val<=6
            row[name]=val if valid else np.nan
        rows.append(row)
    if not rows: raise ValueError('No ASOS observations')
    return pd.DataFrame(rows).set_index('timestamp').sort_index()

def parse_stations(txt):
    stations={}
    for line in txt.splitlines():
        if not re.match(r'^\s*\d+\s+\d+\.',line): continue
        a=line.split()
        if len(a)<12: raise ValueError('Invalid station metadata')
        stations[int(a[0])] = dict(station_id=int(a[0]),longitude=float(a[1]),latitude=float(a[2]),
            elevation_m=float(a[4]),temperature_height_m=float(a[6]),wind_height_m=float(a[7]),name=a[10],name_en=a[11])
    if not stations: raise ValueError('No station metadata')
    return stations

def solar_geometry(index, station):
    # The preceding hourly SI integral is represented by its midpoint solar angle.
    middle=index-pd.Timedelta(minutes=30)
    angles=pvlib.solarposition.get_solarposition(middle,station['latitude'],station['longitude'],altitude=station['elevation_m'])
    # Assume missing shortwave is zero only for fully sun-below-horizon intervals; twilight diffuse is neglected.
    elevations=[]
    for offset in (0,15,30,45,60):
        pos=pvlib.solarposition.get_solarposition(index-pd.Timedelta(minutes=offset),station['latitude'],station['longitude'],altitude=station['elevation_m'])
        elevations.append(pos['elevation'].to_numpy())
    return middle,angles['zenith'].to_numpy(),np.max(elevations,axis=0)<0

def calculate(df, station):
    df=df.copy()
    middle,zenith,dark=solar_geometry(df.index,station)
    observed=df['solar_mj_m2'].notna().to_numpy()
    has_solar_sensor=bool(np.any(observed & (zenith<80)))
    fill=(~observed)&dark&has_solar_sensor
    ghi=df['solar_mj_m2'].to_numpy()*1e6/3600
    ghi[fill]=0
    df['solar_w_m2']=ghi
    df['solar_status']=np.where(observed,'observed',np.where(fill,'night_zero_assumption','missing'))
    split=pvlib.irradiance.erbs(ghi,zenith,middle)
    frac=np.divide(ghi-np.asarray(split['dhi']),ghi,out=np.zeros_like(ghi),where=ghi>0)
    df['direct_fraction_estimated']=np.clip(frac,0,0.9)
    df['cos_solar_zenith']=np.cos(np.deg2rad(zenith))
    height=station['wind_height_m']
    if not np.isfinite(height) or height<=0.01: raise ValueError('Invalid wind sensor height')
    # Use one consistent neutral log profile for measured height -> 10m -> 2m.
    df['wind_equivalent_10m_ms']=df['wind_speed_ms']*np.log(10/0.01)/np.log(height/0.01)
    df['wind_model_2m_ms']=thermofeel.scale_windspeed(np.maximum(df['wind_equivalent_10m_ms'].to_numpy(),0.62),2.0)
    valid=np.isfinite(df[['temperature_c','humidity_pct','station_pressure_hpa','wind_equivalent_10m_ms','solar_w_m2']]).all(axis=1).to_numpy()
    wbgt=np.full(len(df),np.nan)
    if valid.any():
        x=df.iloc[np.flatnonzero(valid)]
        wbgt[valid]=thermofeel.calculate_wbgt_liljegren(
            x['temperature_c'].to_numpy()+273.15,x['humidity_pct'].to_numpy(),x['station_pressure_hpa'].to_numpy(),
            x['wind_equivalent_10m_ms'].to_numpy(),x['solar_w_m2'].to_numpy(),x['direct_fraction_estimated'].to_numpy(),
            x['cos_solar_zenith'].to_numpy(),wind_scaling='brode')-273.15
    df['wbgt_c']=wbgt
    df['calculation_status']=np.where(~valid,'missing_input',np.where(np.isfinite(wbgt),'estimated','nonconverged'))
    df['source_qc']='not_provided'
    df['station_name']=station['name']; df['latitude']=station['latitude']; df['longitude']=station['longitude']
    df['wind_sensor_height_m']=height
    return df

def aggregate(df, year, station_id):
    rows=[]
    # Reindex missing hours before this function: a missing day must remain visible.
    for day, group in df.groupby(df.index.date):
        valid=int(group.wbgt_c.notna().sum())
        rows.append(dict(station_id=station_id,date=str(day),year=year,expected_hours=24,valid_hours=valid,
            night_zero_hours=int((group.solar_status=='night_zero_assumption').sum()),
            wbgt_hourly_max_c=float(group.wbgt_c.max()) if valid==24 else np.nan,
            wbgt_hourly_mean_c=float(group.wbgt_c.mean()) if valid==24 else np.nan,
            status='complete_estimated' if valid==24 else 'incomplete'))
    return pd.DataFrame(rows)

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--station',type=int,default=119,help='0 = all ASOS stations')
    ap.add_argument('--years',default='2021,2022,2023,2024,2025')
    ap.add_argument('--months',default='6,7,8,9')
    ap.add_argument('--output',type=Path,default=ROOT/'output/wbgt_asos_pilot')
    args=ap.parse_args(); years=sorted(set(map(int,args.years.split(',')))); months=sorted(set(map(int,args.months.split(','))))
    if not years or not months or any(m not in (6,7,8,9) for m in months): ap.error('Only June-September supported in this version')
    out=args.output.resolve(); out.mkdir(parents=True,exist_ok=True)
    key=load_key(); manifest=[]; daily=[]; metadata=[]; hourly_files=[]
    for year in years:
        for month in months:
            start=f'{year}{month:02d}010000'; end=f'{year}{month:02d}{calendar.monthrange(year,month)[1]:02d}2300'
            tag=f'{args.station}_{year}_{month:02d}'
            txt=fetch_cached(out/'sources'/f'hourly_{tag}.txt.gz','kma_sfctm3.php',dict(tm1=start,tm2=end,stn=args.station,help=1),key,manifest)
            obs=parse_hourly(txt)
            cat=fetch_cached(out/'sources'/f'stations_{tag}.txt.gz','stn_inf.php',dict(inf='SFC',stn=args.station,tm=start,help=1),key,manifest)
            stations=parse_stations(cat)
            expected=pd.date_range(pd.Timestamp(datetime.strptime(start,'%Y%m%d%H%M'),tz='Asia/Seoul'),pd.Timestamp(datetime.strptime(end,'%Y%m%d%H%M'),tz='Asia/Seoul'),freq='h')
            if not obs.index.isin(expected).all(): raise ValueError('API returned unexpected time range')
            ids=[args.station] if args.station else sorted(set(obs.station_id))
            chunks=[]
            for stn in ids:
                if stn not in stations: raise ValueError(f'Station metadata missing: {stn}')
                subset=obs[obs.station_id==stn].reindex(expected); subset['station_id']=stn
                result=calculate(subset,stations[stn]); chunks.append(result)
                daily.append(aggregate(result,year,stn)); metadata.append(dict(period=f'{year}-{month:02d}',**stations[stn]))
            combined=pd.concat(chunks)
            dest=out/'hourly'/f'wbgt_{tag}.csv.gz'; dest.parent.mkdir(exist_ok=True)
            combined.to_csv(dest,index_label='timestamp_kst',float_format='%.6f',compression='gzip')
            hourly_files.append(str(dest))
            print(f'{tag}: {len(combined)} hours, {combined.wbgt_c.notna().sum()} estimated',flush=True)
            (out/'source_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    daydf=pd.concat(daily,ignore_index=True).sort_values(['station_id','date'])
    daydf.to_csv(out/'wbgt_daily.csv',index=False,float_format='%.6f',encoding='utf-8-sig')
    stats=[]
    for (stn,year),g in daydf.groupby(['station_id','year']):
        vals=g.wbgt_hourly_max_c.dropna(); coverage=len(vals)/len(g)
        # 90% coverage is an explicit pilot rule; publish raw counts alongside it.
        ready=months==[6,7,8,9] and coverage>=0.9
        stats.append(dict(station_id=int(stn),year=int(year),expected_days=len(g),valid_days=len(vals),coverage=coverage,
            candidate_season_p90_c=float(vals.quantile(.9)) if ready else None,eligible=ready))
    baseline=[]
    for stn in sorted({r['station_id'] for r in stats}):
        records=[r for r in stats if r['station_id']==stn]
        ready=years==list(range(2021,2026)) and all(r['eligible'] for r in records) and len(records)==5
        baseline.append(dict(station_id=stn,indicator_code_candidate='H11',unit='degC',
            definition='2021-2025 mean of annual Jun-Sep P90 of complete-day hourly estimated WBGT maxima',
            value_c=float(np.mean([r['candidate_season_p90_c'] for r in records])) if ready else None,
            ready_for_spatial_review=ready,production_ready=False))
    report=dict(model_version=MODEL_VERSION,years=years,months=months,station_selector=args.station,
        created_at_utc=datetime.now(timezone.utc).isoformat(),source_qc='not_provided',
        dependencies={p:version(p) for p in ['thermofeel','pvlib','numpy','pandas','truststore']},
        assumptions=dict(condition='outdoor solar exposed; observation-derived estimate',
            solar_interval='preceding hour SI integral / 3600, midpoint solar geometry; endpoint meteorology represents interval',
            direct_fraction='pvlib Erbs estimate, not observed; capped at 0.9 by thermofeel',
            night_missing='zero only if all 15-minute samples within interval have geometric sun elevation below 0 degrees; twilight diffuse radiation neglected and station-month has daylight SI',
            wind='neutral log profile z0=0.01m, observed sensor height -> equivalent10m -> 2m; thermofeel 0.62m/s equivalent10m floor',
            temperature='measured sensor height treated as near-surface model temperature without lapse correction',
            metadata='monthly snapshots, within-month station changes not audited',
            model_constants='thermofeel 2.3.0: globe diameter .0508m, surface albedo .45, convergence .02K; retained model defaults',
            daily='all 24 hourly estimates required; partly sun-above-horizon/daytime missing values not filled',
            seasonal='candidate only: >=90% complete days each Jun-Sep season, 5/5 years for baseline'),
        annual=stats,baseline_candidates=baseline,hourly_files=hourly_files,
        limitations=['No direct WBGT sensor validation','No observation QC flags in this API','Station values are not parcel-level estimates','Future scenarios not calculated','No production H registration'])
    (out/'wbgt_summary.json').write_text(json.dumps(report,ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8')
    (out/'station_metadata.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'days':len(daydf),'complete_days':int((daydf.status=='complete_estimated').sum()),'baseline':baseline},ensure_ascii=False),flush=True)

if __name__=='__main__': main()

