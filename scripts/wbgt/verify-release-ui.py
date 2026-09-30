"""Read-only public release smoke test. Risk requests calculate results but do not save drafts."""
import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright,expect

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/release-20260930'
ORIGIN=os.environ.get('PLATFORM_TEST_ORIGIN','http://127.0.0.1:4173').rstrip('/')
BASE=ORIGIN+'/internal-tools/priority-management-area'

async def main():
 OUT.mkdir(parents=True,exist_ok=True)
 report={'origin':ORIGIN,'checks':[]};errors=[];requests=[]
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True)
  context=await browser.new_context(viewport={'width':1543,'height':1244})
  async def readonly(route):
   if route.request.method in ['GET','HEAD','OPTIONS']:return await route.continue_()
   return await route.fulfill(status=403,json={'error':'Read-only release verification'})
  await context.route('**/rest/v1/**',readonly)
  page=await context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('request',lambda r:requests.append(r.url))
  try:
   for hazard in ['flood','heatwave','ecosystem']:
    response=await page.goto(BASE+'/'+hazard+'?regionCode=41110',wait_until='networkidle',timeout=90000)
    assert response.status==200
    await expect(page.get_by_role('link',name='부문선택으로 돌아가기')).to_be_visible()
    await page.get_by_role('button',name='첫 대안 탭 만들기',exact=True).click()
    await expect(page.locator('.indicator-group')).to_have_count(4)
    for group in await page.locator('.group-label').all():
     if await group.get_attribute('aria-expanded')!='true':await group.click()
    count=await page.locator('.indicator-item').count()
    assert count=={'flood':26,'heatwave':27,'ecosystem':0}[hazard],(hazard,count)
    if hazard!='ecosystem':
     labels=await page.locator('.display-toggle-label').all_text_contents()
     assert labels==['행정경계','분석지역 경계','흑백 지도'],labels
    if ORIGIN.startswith('https:'):
     await page.get_by_role('button',name='+ 사용자 지표',exact=True).click()
     await expect(page.get_by_role('dialog')).to_contain_text('개발 사이트에서 이용')
     await expect(page.get_by_role('dialog').locator('input[type=file]')).to_have_count(0)
     await page.get_by_role('dialog').get_by_role('button',name='닫기',exact=True).last.click()
    if hazard=='heatwave':
     for row in await page.locator('.indicator-item[data-dimension="H"]').all():
      text=await row.inner_text();box=row.locator('input[type=checkbox]')
      if 'H11' in text:await box.check()
      elif await box.is_checked():await box.uncheck()
     async with page.expect_response(lambda r:'/risk-analysis' in r.url,timeout=120000) as event:
      await page.get_by_role('button',name='Risk 분석 실행',exact=True).click()
     result=await event.value;payload=await result.json()
     assert result.status==200,payload
     assert result.request.post_data_json['schemaVersion']==2
     assert any(i.get('indicatorCode')=='H11' for i in payload['loadedIndicators']),payload.keys()
     await expect(page.locator('[data-analysis-message]')).to_contain_text('분석 완료',timeout=60000)
     report['wbgtValidCells']=payload['result']['gridResult']['stats']['validCells']
    report['checks'].append({'hazard':hazard,'indicatorCount':count,'ok':True})
    await page.screenshot(path=str(OUT/f'release-{hazard}.png'))
   assert not any('/user-indicators' in u for u in requests) if ORIGIN.startswith('https:') else True
   assert not errors,errors
   report['build']=await page.evaluate("async()=> (await fetch('/internal-tools/_app/version.json')).json()")
   report['ok']=True
  except Exception as e:
   report.update(ok=False,error=str(e));await page.screenshot(path=str(OUT/'release-ui-failure.png'))
  finally:
   report['pageErrors']=errors;(OUT/'release-ui-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
   await context.close();await browser.close()
 print(json.dumps(report,ensure_ascii=False),flush=True)
 if not report.get('ok'):raise SystemExit(1)
asyncio.run(main())
