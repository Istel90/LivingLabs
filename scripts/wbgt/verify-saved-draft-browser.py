"""Use raw snapshots read from the two QA DB rows. All browser DB requests are isolated fixtures."""
import asyncio,base64,gzip,json,os
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.async_api import async_playwright,expect
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/common-repositories-browser'
ORIGIN=os.environ.get('PLATFORM_TEST_ORIGIN','http://127.0.0.1:4173').rstrip('/')
BASE=ORIGIN+'/internal-tools/priority-management-area'
RESULTS=ROOT/'output/release-20260930' if ORIGIN.startswith('https:') else OUT
PREFIX='public' if ORIGIN.startswith('https:') else 'database'
async def main():
 RESULTS.mkdir(parents=True,exist_ok=True)
 report={'origin':ORIGIN,'checks':[]};errors=[]
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True)
  context=await browser.new_context(accept_downloads=True,viewport={'width':1543,'height':1244})
  rows=[json.loads((OUT/f'database-wire-{h}.json').read_text(encoding='utf8')) for h in ['flood','heatwave']]
  for row in rows:row['deleted_at']=None  # Fixture only; never sent to the real database.
  async def mock(route):
   if route.request.method!='GET':return await route.fulfill(status=403,json={'error':'This browser check is read-only'})
   query=parse_qs(urlparse(route.request.url).query);matching=rows
   if 'hazard_type' in query:matching=[r for r in matching if r['hazard_type']==query['hazard_type'][0].removeprefix('eq.')]
   if 'id' in query:matching=[r for r in matching if r['id']==query['id'][0].removeprefix('eq.')]
   return await route.fulfill(json=matching)
  await context.route('**/rest/v1/**',mock)
  page=await context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  try:
   for hazard in ['flood','heatwave']:
    row=next(r for r in rows if r['hazard_type']==hazard);expected=row['analysis_conditions']['draftPayload']
    compressed=bool(expected.get('__priorityDraftEncoding'))
    if compressed:expected=json.loads(gzip.decompress(base64.b64decode(expected['data'])))
    await page.goto(BASE+'/'+hazard+'?regionCode=41110',wait_until='networkidle',timeout=90000)
    await page.get_by_role('button',name='불러오기',exact=True).click()
    async with page.expect_response(lambda r:'/risk-analysis' in r.url,timeout=90000) as response:
     await page.locator('.saved-draft-row').first.click()
    result=await response.value;assert result.status==200
    assert result.request.post_data_json['schemaVersion']==1
    await expect(page.locator('[data-analysis-message]')).to_contain_text('분석 완료',timeout=60000)
    async with page.expect_download() as event:await page.get_by_role('button',name='설정 내보내기',exact=True).click()
    target=RESULTS/f'{PREFIX}-browser-{hazard}.json';await (await event.value).save_as(target)
    actual=json.loads(target.read_text(encoding='utf8'))
    assert len(actual['alternatives'])==len(expected['alternatives'])
    for a,b in zip(actual['alternatives'],expected['alternatives']):
     assert a['alternativeId']==b['alternativeId']
     assert a['analysisResult']['riskResultId']==b['analysisResult']['riskResultId']
     assert a['analysisResult']['gridResult']['values']==b['analysisResult']['gridResult']['values']
     assert [i.get('customDatasetId') for i in a['settings']['indicators']]==[i.get('customDatasetId') for i in b['settings']['indicators']]
    await page.screenshot(path=str(RESULTS/f'{PREFIX}-browser-{hazard}.png'))
    report['checks'].append({'hazard':hazard,'compressed':compressed,'restored':True,'riskValuesAndIdsMatch':True,'serverHevRestored':True})
    if ORIGIN.startswith('https:'):
     await page.get_by_role('button',name='+ 사용자 지표',exact=True).click()
     await expect(page.get_by_role('dialog')).to_contain_text('개발 사이트에서 이용')
     await page.get_by_role('dialog').get_by_role('button',name='닫기',exact=True).last.click()
     await page.get_by_role('tab',name='01 분석 지표 선택').click()
     async with page.expect_response(lambda r:'/risk-analysis' in r.url,timeout=120000) as recalculation:
      await page.get_by_role('button',name='Risk 분석 실행',exact=True).click()
     recalculated=await recalculation.value
     assert recalculated.status==200,await recalculated.text()
     assert recalculated.request.post_data_json['schemaVersion']==1
     sent_labels={i['label'] for i in recalculated.request.post_data_json['indicators']}
     custom_labels={i['label'] for i in actual['analysisResult']['indicators'] if i.get('customDatasetId')}
     assert custom_labels and custom_labels.issubset(sent_labels)
     await expect(page.locator('[data-analysis-message]')).to_contain_text('분석 완료',timeout=60000)
     async with page.expect_download() as repeated:await page.get_by_role('button',name='설정 내보내기',exact=True).click()
     repeated_file=RESULTS/f'{PREFIX}-recalculated-{hazard}.json';await (await repeated.value).save_as(repeated_file)
     repeated_data=json.loads(repeated_file.read_text(encoding='utf8'))
     assert repeated_data['analysisResult']['gridResult']['values']==actual['analysisResult']['gridResult']['values']
     report['checks'][-1]['savedUserInputReanalysis']=True
     report['checks'][-1]['recalculatedValuesMatch']=True
   assert not errors,errors
   report['ok']=True
  except Exception as error:
   report.update(ok=False,error=str(error));await page.screenshot(path=str(RESULTS/f'{PREFIX}-browser-failure.png'))
  finally:
   report['pageErrors']=errors;(RESULTS/f'{PREFIX}-browser-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
   await context.close();await browser.close()
 print(json.dumps(report,ensure_ascii=False),flush=True)
 if not report.get('ok'):raise SystemExit(1)
asyncio.run(main())
