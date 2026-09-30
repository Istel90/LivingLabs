"""Shared UI/storage regression. Remote draft writes are intercepted; only labeled local QA indicators are registered."""
import asyncio, json, re, time, hashlib, gzip, base64
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright, expect
import numpy as np
import rasterio
from rasterio.transform import from_origin

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/common-repositories-browser'
BASE='http://127.0.0.1:4173/internal-tools/priority-management-area'
LABEL='QA 공통 지표 '+str(int(time.time()))
report={'label':LABEL,'registeredIds':[],'checks':[]}
def record(check):
    report['checks'].append(check);print(check,flush=True)
    (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')

async def export(page,name):
    async with page.expect_download() as d: await page.get_by_role('button',name='설정 내보내기',exact=True).click()
    target=OUT/(name+'.json');await (await d.value).save_as(target)
    return json.loads(target.read_text(encoding='utf8'))

async def analyze(page):
    await page.get_by_role('tab',name='01 분석 지표 선택').click()
    async with page.expect_response(lambda r:'/risk-analysis' in r.url,timeout=180000) as response:
        await page.get_by_role('button',name='Risk 분석 실행',exact=True).click()
    r=await response.value; payload=await r.json()
    assert r.status==200,payload
    await expect(page.locator('[data-analysis-message]')).to_contain_text('분석 완료',timeout=30000)
    return r.request.post_data_json

def fingerprint(data):
    r=data['alternatives'][data['activeAlternative'] if 'activeAlternative' in data else 0]['analysisResult']
    return hashlib.sha256(json.dumps(r['gridResult']['values'],sort_keys=True).encode()).hexdigest()

async def main():
 OUT.mkdir(parents=True,exist_ok=True)
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True)
  context=await browser.new_context(accept_downloads=True,viewport={'width':1543,'height':1244})
  saved=[];errors=[];page=await context.new_page()
  page.on('pageerror',lambda e:errors.append(str(e)))
  async def mock(route):
    req=route.request;params=parse_qs(urlparse(req.url).query)
    if '/regions' in req.url:return await route.fulfill(status=201,json=[])
    if '/priority_area_sets' not in req.url:return await route.fulfill(json=[])
    if req.method=='POST':
      row=req.post_data_json
      row.update(created_at='2026-09-29T00:00:00Z',analysis_version=f'draft/{len(saved)+1}',set_name='검증 저장본',management_version=1,deleted_at=None)
      saved.append(row);return await route.fulfill(status=201,json=[])
    result=saved
    if 'id' in params:result=[r for r in result if r['id']==params['id'][0].removeprefix('eq.')]
    if 'hazard_type' in params:result=[r for r in result if r['hazard_type']==params['hazard_type'][0].removeprefix('eq.')]
    return await route.fulfill(json=result)
  await context.route('**/rest/v1/**',mock)
  try:
    await page.goto(BASE+'/flood?regionCode=41110&resumeDraft=1',wait_until='networkidle')
    await page.get_by_role('button',name='첫 대안 탭 만들기',exact=True).click()
    await analyze(page);base=await export(page,'flood-base');record('홍수 기준 분석 완료')
    await page.get_by_role('button',name='+ 사용자 지표',exact=True).click()
    await page.get_by_label('지표 이름',exact=True).fill(LABEL)
    await page.locator('.indicator-modal select').last.select_option('json')
    count=int(re.search(r'같은 ([\d,]+)개',await page.get_by_role('dialog').inner_text()).group(1).replace(',',''))
    bad=OUT/'bad.json';bad.write_text('[null]',encoding='utf8')
    await page.locator('input[type=file]').set_input_files(bad)
    await expect(page.locator('.indicator-modal-error')).to_contain_text('값 개수')
    good=OUT/'grid.json';good.write_text(json.dumps([(i%20)/20 for i in range(count)]),encoding='utf8')
    await page.locator('input[type=file]').set_input_files(good)
    async with page.expect_response(lambda r:'/user-indicators' in r.url and r.request.method=='POST') as response:
      await page.get_by_role('button',name='보관 후 현재 대안에 연결',exact=True).click()
    r=await response.value;data=await r.json();assert r.status==201,data
    identity=data['id'];report['registeredIds'].append(identity);record('JSON 형식 검증 및 보관소 선등록 완료')
    await expect(page.get_by_role('dialog')).to_have_count(0)
    request=await analyze(page)
    assert request['schemaVersion']==2 and any(i.get('customDatasetId')==identity for i in request['indicators'])
    assert all('entries' not in i for i in request['indicators'])
    original=await export(page,'flood-custom');first=original['alternatives'][0]
    assert any(i.get('customDatasetId')==identity for i in first['analysisResult']['indicators'])
    assert all('gridValues' not in i for i in first['settings']['indicators'] if i.get('customDatasetId'))
    record('사용자 지표 ID 서버 계산 및 대안 설정 참조 저장 완료')
    await page.get_by_role('button',name='대안 추가',exact=True).click()
    empty=await export(page,'second-empty')
    assert not any(i.get('customDatasetId') for i in empty['alternatives'][1]['settings']['indicators'])
    await page.get_by_role('button',name='+ 사용자 지표',exact=True).click()
    row=page.get_by_role('dialog').locator('div').filter(has=page.get_by_text(LABEL+' · 노출',exact=True)).filter(has=page.get_by_role('button',name='현재 대안에 연결',exact=True)).last
    await row.get_by_role('button',name='현재 대안에 연결',exact=True).click()
    await expect(page.get_by_role('dialog')).to_have_count(0)
    await analyze(page);second=await export(page,'second-linked')
    assert second['alternatives'][1]['alternativeId']!=first['alternativeId']
    assert any(i.get('customDatasetId')==identity for i in second['alternatives'][1]['analysisResult']['indicators'])
    record('새 대안 자동 전파 없음 및 같은 지표 재연결 완료')
    await page.get_by_role('textbox',name='저장 기록에 남을 작업자 이름').fill('구조 검증')
    await page.get_by_role('button',name='저장',exact=True).click()
    await expect(page.get_by_role('heading',name='대안 저장 완료',exact=True)).to_be_visible(timeout=90000)
    assert saved
    stored_payload=saved[0]['analysis_conditions']['draftPayload']
    if stored_payload.get('__priorityDraftEncoding'):stored_payload=json.loads(gzip.decompress(base64.b64decode(stored_payload['data'])))
    assert stored_payload['resultIndex']
    await page.get_by_role('button',name='확인',exact=True).click()
    await page.get_by_role('button',name='대안 추가',exact=True).click()
    await page.get_by_role('button',name='불러오기',exact=True).click()
    await page.locator('.saved-draft-row').first.click()
    await expect(page.locator('[data-analysis-message]')).to_contain_text('분석 완료',timeout=90000)
    restored=await export(page,'saved-restored')
    assert restored['alternatives'][1]['analysisResult']['riskResultId']==second['alternatives'][1]['analysisResult']['riskResultId']
    assert restored['alternatives'][1]['analysisResult']['gridResult']['values']==second['alternatives'][1]['analysisResult']['gridResult']['values']
    record('공통 저장 서비스 왕복·사용자 지표·Risk ID와 값 복원 완료 (원격 쓰기 격리)')
    await page.get_by_role('button',name=re.compile('^노출 \\(Exposure\\)')).click()
    await page.get_by_role('button',name=LABEL+' 연결 해제',exact=True).click()
    after=await export(page,'detached')
    assert not any(i.get('customDatasetId')==identity for i in after['alternatives'][1]['settings']['indicators'])
    assert any(i.get('customDatasetId')==identity for i in after['alternatives'][0]['settings']['indicators'])
    record('연결 해제는 현재 대안에만 적용')
    await page.goto(BASE+'/heatwave?regionCode=41110&resumeDraft=1',wait_until='networkidle')
    await page.get_by_role('button',name='첫 대안 탭 만들기',exact=True).click()
    await page.get_by_role('button',name='+ 사용자 지표',exact=True).click()
    row=page.get_by_role('dialog').locator('div').filter(has=page.get_by_text(LABEL+' · 노출',exact=True)).filter(has=page.get_by_role('button',name='현재 대안에 연결',exact=True)).last
    await row.get_by_role('button',name='현재 대안에 연결',exact=True).click()
    await expect(page.get_by_role('dialog')).to_have_count(0)
    await analyze(page);heat=await export(page,'heatwave-custom')
    assert any(i.get('customDatasetId')==identity for i in heat['alternatives'][0]['analysisResult']['indicators'])
    await page.wait_for_timeout(1000);await page.reload(wait_until='networkidle')
    await expect(page.locator('[data-analysis-message]')).to_contain_text('분석 완료',timeout=60000)
    again=await export(page,'heatwave-reloaded')
    assert again['alternatives'][0]['analysisResult']['riskResultId']==heat['alternatives'][0]['analysisResult']['riskResultId']
    record('폭염 부문 재사용·분석·새로고침 복원 완료')
    # A properly preprocessed GeoTIFF, and a rejected incompatible file.
    meta=heat['analysisResult']['gridResult'];t=meta['transform']
    tif=OUT/'aligned.tif';invalid=OUT/'wrong-crs.tif'
    for file,crs in [(tif,'EPSG:5179'),(invalid,'EPSG:5186')]:
      with rasterio.open(file,'w',driver='GTiff',height=meta['rows'],width=meta['columns'],count=1,dtype='float32',crs=crs,transform=from_origin(t['originX'],t['originY'],100,100),nodata=-9999) as dst:dst.write(np.full((meta['rows'],meta['columns']),0.4,dtype='float32'),1)
    await page.get_by_role('button',name='+ 사용자 지표',exact=True).click()
    await page.get_by_label('지표 이름',exact=True).fill(LABEL+' TIF')
    await page.locator('input[type=file]').set_input_files(invalid)
    await expect(page.locator('.indicator-modal-error')).to_contain_text('전처리',timeout=30000)
    await page.locator('input[type=file]').set_input_files(tif)
    await expect(page.get_by_role('button',name='보관 후 현재 대안에 연결',exact=True)).to_be_enabled(timeout=30000)
    async with page.expect_response(lambda r:'/user-indicators' in r.url and r.request.method=='POST') as response:
      await page.get_by_role('button',name='보관 후 현재 대안에 연결',exact=True).click()
    r=await response.value;data=await r.json();assert r.status==201,data
    report['registeredIds'].append(data['id']);record('GeoTIFF 기준 검사·선등록 완료')
    await expect(page.get_by_role('dialog')).to_have_count(0)
    await analyze(page)
    await page.screenshot(path=str(OUT/'heatwave-user-indicators.png'))
    assert not errors,errors
    record('GeoTIFF 포함 Risk 분석 완료·페이지 오류 0건')
    report['ok']=True
  except Exception as e:
    report.update(ok=False,error=str(e),pageErrors=errors)
    await page.screenshot(path=str(OUT/'failure.png'))
    print(str(e),flush=True)
  finally:
    (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    await context.close();await browser.close()
 if not report.get('ok'):raise SystemExit(1)

asyncio.run(main())
