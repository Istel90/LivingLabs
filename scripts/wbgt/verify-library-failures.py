"""Failure injection only in an isolated browser; no remote DB writes or local registrations."""
import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright,expect
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/common-repositories-browser'
BASE='http://127.0.0.1:4173/internal-tools/priority-management-area'
report={'checks':[]}
async def main():
 source=json.loads((OUT/'report.json').read_text(encoding='utf8'))
 identity=source['registeredIds'][0];label=source['label'];errors=[]
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True)
  context=await browser.new_context(accept_downloads=True,viewport={'width':1543,'height':1244})
  await context.route('**/rest/v1/**',lambda r:r.fulfill(json=[]))
  page=await context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  async def exported():
   async with page.expect_download() as event:await page.get_by_role('button',name='설정 내보내기',exact=True).click()
   path=OUT/'failure-check-export.json';await (await event.value).save_as(path)
   return json.loads(path.read_text(encoding='utf8'))
  def linked_row():
   return page.get_by_role('dialog').locator('div').filter(has=page.get_by_text(label+' · 노출',exact=True)).filter(has=page.get_by_role('button',name='현재 대안에 연결',exact=True)).last
  try:
   await page.goto(BASE+'/flood?regionCode=41110',wait_until='networkidle')
   await page.get_by_role('button',name='첫 대안 탭 만들기',exact=True).click()
   pattern='**/user-indicators*'
   await context.route(pattern,lambda r:r.fulfill(status=503,json={'error':'검증용 보관소 연결 실패'}))
   await page.get_by_role('button',name='+ 사용자 지표',exact=True).click()
   await expect(page.locator('.indicator-modal-error')).to_contain_text('검증용 보관소 연결 실패')
   await context.unroute(pattern)
   await page.get_by_role('button',name='목록 새로고침',exact=True).click()
   await expect(linked_row()).to_be_visible()
   await page.get_by_label('지표 이름',exact=True).fill('QA 등록 실패 확인')
   await page.locator('.indicator-modal select').last.select_option('demo')
   await context.route(pattern,lambda r:r.fulfill(status=503,json={'error':'검증용 등록 실패'}))
   await page.get_by_role('button',name='보관 후 현재 대안에 연결',exact=True).click()
   await expect(page.locator('.indicator-modal-error')).to_contain_text('검증용 등록 실패')
   await expect(page.get_by_role('button',name='보관 후 현재 대안에 연결',exact=True)).to_be_enabled()
   await context.unroute(pattern)
   await page.get_by_role('button',name='닫기',exact=True).click()
   data=await exported();assert not any(i.get('label')=='QA 등록 실패 확인' for i in data['alternatives'][0]['settings']['indicators'])
   report['checks'].append('목록 실패 재시도 및 등록 실패 시 대안 연결 없음')
   await page.get_by_role('button',name='+ 사용자 지표',exact=True).click()
   read_pattern='**/user-indicators?id=*'
   await context.route(read_pattern,lambda r:r.fulfill(status=404,json={'error':'검증용 지표 누락'}))
   await linked_row().get_by_role('button',name='현재 대안에 연결',exact=True).click()
   await expect(page.locator('.indicator-modal-error')).to_contain_text('검증용 지표 누락')
   await context.unroute(read_pattern)
   await linked_row().get_by_role('button',name='현재 대안에 연결',exact=True).click()
   await expect(page.get_by_role('dialog')).to_have_count(0)
   await context.route('**/risk-analysis',lambda r:r.fulfill(status=503,json={'error':'검증용 분석 실패'}))
   await page.get_by_role('button',name='Risk 분석 실행',exact=True).click()
   await expect(page.locator('[data-analysis-message]')).to_contain_text('검증용 분석 실패')
   await context.unroute('**/risk-analysis')
   await page.get_by_role('button',name='Risk 분석 실행',exact=True).click()
   await expect(page.locator('[data-analysis-message]')).to_contain_text('분석 완료',timeout=90000)
   report['checks'].append('지표 누락 및 분석 오류 표시 후 재시도 성공')
   await page.get_by_role('button',name='+ 사용자 지표',exact=True).click()
   await expect(page.get_by_text('지표 목록을 불러오는 중입니다.',exact=True)).to_have_count(0)
   await page.screenshot(path=str(OUT/'user-indicator-library.png'))
   await page.get_by_role('button',name='닫기',exact=True).click()
   await page.goto(BASE+'/ecosystem?regionCode=41110',wait_until='networkidle')
   await page.get_by_role('button',name='첫 대안 탭 만들기',exact=True).click()
   data=await exported();assert data['alternatives'][0]['settings']['indicators']==[]
   await page.get_by_role('button',name='+ 사용자 지표',exact=True).click()
   await linked_row().get_by_role('button',name='현재 대안에 연결',exact=True).click()
   await expect(page.get_by_role('dialog')).to_have_count(0)
   data=await exported();assert len(data['alternatives'][0]['settings']['indicators'])==1
   assert data['alternatives'][0]['settings']['indicators'][0]['customDatasetId']==identity
   assert not data['analysisResult']
   await page.get_by_role('button',name='+ 사용자 지표',exact=True).click()
   await page.locator('.indicator-modal select').last.select_option('demo')
   await expect(page.get_by_role('button',name='보관 후 현재 대안에 연결',exact=True)).to_be_enabled()
   report['checks'].append('생태계 기본 목록 비어 있음·사용자 지표 명시 연결·기준 격자 준비')
   assert not errors,errors
   report['ok']=True
  except Exception as e:
   report.update(ok=False,error=str(e));await page.screenshot(path=str(OUT/'failure-injection.png'))
  finally:
   report['pageErrors']=errors;(OUT/'failure-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
   await context.close();await browser.close()
 print(json.dumps(report,ensure_ascii=False),flush=True)
 if not report.get('ok'):raise SystemExit(1)
asyncio.run(main())
