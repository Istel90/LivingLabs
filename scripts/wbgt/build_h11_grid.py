"""Build the selectable experimental H11 raster from completed ASOS WBGT estimates."""
from pathlib import Path
import json, hashlib
from datetime import datetime, timezone
import numpy as np
import pandas as pd
import rasterio
from rasterio.windows import Window
from pyproj import Transformer
from scipy.spatial import cKDTree
ROOT=Path(__file__).resolve().parents[2]
DATA=ROOT/'output/wbgt_asos_national'
HAZARD=ROOT/'riskmap-core-main/data/processed/hazard'
REF=HAZARD/'H02/observed/2021-2025/h02_tamax_2021_2025_mean_100m_national.tif'
DEST=HAZARD/'H11/observed/2021-2025/h11_wbgt_dailymax_p90_2021_2025_mean_100m_national.tif'

def idw(points,values,queries,k=8):
    distances,indices=cKDTree(points).query(queries,k=min(k,len(points)))
    if distances.ndim==1: distances=distances[:,None]; indices=indices[:,None]
    weights=1/np.maximum(distances,0.001)**2
    result=np.sum(values[indices]*weights,axis=1)/weights.sum(axis=1)
    # Retain exact station values when querying at an observed point.
    exact=distances[:,0]<0.001
    result[exact]=values[indices[exact,0]]
    return result

def main():
    report=json.loads((DATA/'wbgt_summary.json').read_text(encoding='utf-8'))
    snapshots=json.loads((DATA/'station_metadata.json').read_text(encoding='utf-8'))
    projection=Transformer.from_crs('EPSG:4326','EPSG:5179',always_xy=True)
    stations=[];excluded=[]
    for record in report['baseline_candidates']:
        if not record['ready_for_spatial_review']: continue
        history=[x for x in snapshots if x['station_id']==record['station_id']]
        xy=np.array([projection.transform(x['longitude'],x['latitude']) for x in history])
        if np.max(np.linalg.norm(xy-xy[-1],axis=1))>1000:
            excluded.append({'station_id':record['station_id'],'reason':'location changed >1km within baseline'});continue
        stations.append({**history[-1],**record,'x':float(xy[-1,0]),'y':float(xy[-1,1])})
    if len(stations)<9: raise ValueError('Fewer than 9 eligible stable stations; no H11 raster generated')
    points=np.array([[x['x'],x['y']] for x in stations]);values=np.array([x['value_c'] for x in stations])
    loo=[]
    for i,st in enumerate(stations):
        keep=np.arange(len(stations))!=i
        estimate=float(idw(points[keep],values[keep],points[i:i+1])[0])
        loo.append(dict(station_id=st['station_id'],actual_station_estimate_c=float(values[i]),idw_leave_one_out_c=estimate,error_c=estimate-values[i]))
    pd.DataFrame(loo).to_csv(DATA/'spatial_cross_validation.csv',index=False,encoding='utf-8-sig')
    pd.DataFrame(stations).to_csv(DATA/'h11_station_baseline.csv',index=False,encoding='utf-8-sig')
    DEST.parent.mkdir(parents=True,exist_ok=True);tmp=DEST.with_suffix('.tmp.tif')
    minimum=float('inf');maximum=float('-inf');count=0;total=0
    with rasterio.open(REF) as ref:
        if ref.crs.to_epsg()!=5179 or ref.res!=(100.,100.): raise ValueError('Unexpected reference grid')
        profile=ref.profile.copy();profile.update(dtype='float32',count=1,nodata=-9999.,compress='deflate',predictor=3,tiled=True,blockxsize=256,blockysize=256)
        with rasterio.open(tmp,'w',**profile) as dst:
            for top in range(0,ref.height,128):
                window=Window(0,top,ref.width,min(128,ref.height-top))
                base=ref.read(1,window=window,masked=True)
                mask=~np.ma.getmaskarray(base)&np.isfinite(base.data)
                output=np.full(base.shape,-9999,dtype=np.float32)
                r,c=np.nonzero(mask)
                if len(r):
                    x,y=rasterio.transform.xy(ref.transform,r+top,c,offset='center')
                    v=idw(points,values,np.column_stack([x,y])).astype(np.float32)
                    output[r,c]=v;count+=len(v);total+=float(v.sum(dtype=np.float64))
                    minimum=min(minimum,float(v.min()));maximum=max(maximum,float(v.max()))
                dst.write(output,1,window=window)
            dst.update_tags(indicator='H11',model=report['model_version'],quality='EXPERIMENTAL_ASOS_WBGT_IDW',unit='degC')
        transform=list(ref.transform)[:6];width=ref.width;height=ref.height
    tmp.replace(DEST)
    metadata=dict(indicator_id='H11',indicator_name='고온기 일최대 추정 WBGT P90',observed_or_scenario='observed',period='2021-2025',
        period_start='2021-06-01',period_end='2025-09-30',season_months=[6,7,8,9],unit='℃',
        aggregation='mean of annual Jun-Sep P90 of complete 24-hour estimated daily maxima; >=90% days in each of 5 years',
        source_resolution='Point (ASOS; estimated WBGT)',analysis_resolution='100m',grid_spec_id='KOR_100M_EPSG5179_V1',
        spatial_model={'method':'IDW','power':2,'nearest_stations':8,'distance_limit':None,'note':'same interpolation family as existing ASOS H; sparse/remote coverage has higher uncertainty'},
        station_count=len(stations),station_ids=[x['station_id'] for x in stations],excluded_stations=excluded,
        spatial_cross_validation={'method':'leave-one-station-out on WBGT estimates, not sensor validation','mae_c':float(np.mean([abs(x['error_c']) for x in loo])),'rmse_c':float(np.sqrt(np.mean([x['error_c']**2 for x in loo])))},
        spatial_detail_note='100m is an analysis grid; no parcel-level shade, buildings, or local wind is resolved.',
        assumptions=report['assumptions'],source_qc=report['source_qc'],dependencies=report['dependencies'],
        quality_status='EXPERIMENTAL_ASOS_WBGT_IDW_V1',width=width,height=height,transform=transform,nodata=-9999.,
        valid_cell_count=count,min=minimum,max=maximum,mean=total/count,
        generated_at=datetime.now(timezone.utc).isoformat(),output_checksum_sha256=hashlib.sha256(DEST.read_bytes()).hexdigest())
    DEST.with_suffix('.metadata.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8')
    print(json.dumps({'stations':len(stations),'cells':count,'range':[minimum,maximum],'spatial_validation':metadata['spatial_cross_validation']},ensure_ascii=False))

if __name__=='__main__':main()
