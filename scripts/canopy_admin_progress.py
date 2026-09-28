"""Report saved canopy queue against administrative polygons; read-only data audit."""
import csv
import json
from collections import Counter
from datetime import datetime
from pathlib import Path

from rasterio.warp import transform_geom

ROOT = Path(__file__).resolve().parents[1]
state_path = ROOT / '.runtime-logs/canopy-queue.json'
state = json.loads(state_path.read_text())
features = json.loads((ROOT / 'public/data/climate/admin-boundaries.geojson').read_text(encoding='utf-8-sig'))['features']
provinces = dict(zip(['11','26','27','28','29','30','31','36','41','42','43','44','45','46','47','48','50','51','52'], ['서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주','강원','전북']))

def clip(ring, axis, edge, lower):
    out = []
    if not ring:
        return out
    p = ring[-1]
    pi = p[axis] >= edge if lower else p[axis] <= edge
    for q in ring:
        qi = q[axis] >= edge if lower else q[axis] <= edge
        if qi != pi:
            t = (edge - p[axis]) / (q[axis] - p[axis])
            out.append([p[0] + t*(q[0]-p[0]), p[1] + t*(q[1]-p[1])])
        if qi:
            out.append(q)
        p, pi = q, qi
    return out

def area(ring, bounds):
    for axis, edge, lower in [(0,bounds[0],True),(0,bounds[2],False),(1,bounds[1],True),(1,bounds[3],False)]:
        ring = clip(ring,axis,edge,lower)
    if len(ring) < 3:
        return 0
    x,y = ring[0]
    return abs(sum((p[0]-x)*(q[1]-y)-(q[0]-x)*(p[1]-y) for p,q in zip(ring,ring[1:]+ring[:1])))/2

tiles = {}
for stage, entries in state['stages'].items():
    tiles[stage] = []
    for item in entries:
        pts=item['geometry']['coordinates'][0]
        bounds=(min(p[0] for p in pts),min(p[1] for p in pts),max(p[0] for p in pts),max(p[1] for p in pts))
        tiles[stage].append((item,bounds))
rows=[]
for f in features:
    code=str(f['properties']['code'])
    stage='incheon' if code.startswith('28') else 'suwon' if code.startswith('4111') else 'national'
    g=transform_geom('EPSG:4326','EPSG:5179',f['geometry'])
    polys=g['coordinates'] if g['type']=='MultiPolygon' else [g['coordinates']]
    pts=[p for poly in polys for ring in poly for p in ring]
    bbox=(min(p[0] for p in pts),min(p[1] for p in pts),max(p[0] for p in pts),max(p[1] for p in pts))
    hits=[]
    for item,b in tiles[stage]:
        if bbox[0]>=b[2] or bbox[2]<=b[0] or bbox[1]>=b[3] or bbox[3]<=b[1]:
            continue
        overlap=sum(max(0,area(poly[0],b)-sum(area(r,b) for r in poly[1:])) for poly in polys)
        if overlap > 0.000001:
            hits.append(item)
    counts=Counter(i['status'] for i in hits)
    done=counts['VERIFIED']+counts['EMPTY_BOUNDARY']
    submitted=sum(counts[k] for k in ['READY','RUNNING','COMPLETED','SUBMITTING'])
    status='완료' if stage in state.get('qaApprovedStages',[]) else '수신 완료·경계 QA 필요' if hits and done==len(hits) else '일부 수신·진행 중' if done else '제출·대기 중' if submitted else '예정'
    rows.append({'시도':provinces.get(code[:2],code[:2]),'행정구역':f['properties']['name'],'코드':code,'상태':status,'교차타일':len(hits),'파일검증':counts['VERIFIED'],'빈경계':counts['EMPTY_BOUNDARY'],'실행중':counts['RUNNING'],'대기':counts['READY'],'미제출':counts['PENDING'],'참고':'결측 조사 타일 0058과 교차' if any(i['name']=='chm_v1_national_0058' for i in hits) else '', '타일':','.join(i['name'] for i in hits)})
for row in rows:
    row['우선순위'] = '완료' if row['상태']=='완료' else '1 서울' if row['코드'].startswith('11') else '2 경기' if row['코드'].startswith('41') else '3 그 외 전국'
rows.sort(key=lambda r: (0 if r['우선순위']=='완료' else int(r['우선순위'][0]),r['코드']))
out=ROOT/'output/canopy-admin-progress'
out.mkdir(parents=True,exist_ok=True)
with (out/'administrative-progress.csv').open('w',encoding='utf-8-sig',newline='') as fh:
    w=csv.DictWriter(fh,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
lines=['# 수관높이 행정구역별 진행 현황','',f'큐 기록 기준: {datetime.fromtimestamp(state_path.stat().st_mtime).isoformat(timespec="seconds")} (로컬 시간). 실시간 GEE 재조회 아님.','', '타일과 EPSG:5179 행정경계의 면적 교차로 집계. 공유 타일은 여러 행에 중복되므로 행별 수를 합산하지 않습니다. 파일검증은 행정구역 전체 결측 검증과 다릅니다. 빈경계는 해당 타일에 1m 대상 픽셀 중심이 없는 경우입니다. 행정구역 명칭과 구분은 저장된 경계 자료 기준입니다.','', '| 시도 | 행정구역 | 상태 | 교차타일 | 파일검증 | 빈경계 | 실행중 | 대기 | 미제출 | 참고 |','|---|---|---|---:|---:|---:|---:|---:|---:|---|']
lines[4] += ' 신규 제출 순서: 서울 → 수원 제외 경기 → 그 외 전국. 기존 제출 작업은 유지합니다.'
lines[-2] = '| 우선순위 | 시도 | 행정구역 | 상태 | 교차타일 | 파일검증 | 빈경계 | 실행중 | 대기 | 미제출 | 참고 |'
lines[-1] = '|---|---|---|---|---:|---:|---:|---:|---:|---:|---|'
keys=['우선순위','시도','행정구역','상태','교차타일','파일검증','빈경계','실행중','대기','미제출','참고']
lines.extend('| '+' | '.join(str(r[k]) for k in keys)+' |' for r in rows)
(out/'administrative-progress.md').write_text('\n'.join(lines),encoding='utf-8')
(out/'administrative-progress.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'rows':len(rows),'statusCounts':dict(Counter(r['상태'] for r in rows)),'output':str(out)},ensure_ascii=True))
