"""Isolated Chrome regression using the project's prescribed Playwright workflow.
Only test-browser IndexedDB is written; remote saved drafts are never mutated.
"""
import asyncio, json, os
from pathlib import Path
from playwright.async_api import async_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
ORIGIN = os.environ.get('PLATFORM_TEST_ORIGIN', 'http://127.0.0.1:4173').rstrip('/')
OUT = Path(os.environ.get('PLATFORM_TEST_OUTPUT', str(ROOT / ('output/release-20260930/result-identity' if ORIGIN.startswith('https:') else 'output/result-identity-browser'))))
BASE = ORIGIN + '/internal-tools/priority-management-area'

async def export(page, hazard, label):
    async with page.expect_download() as pending:
        await page.get_by_role('button', name='설정 내보내기', exact=True).click()
    file = OUT / f'{hazard}-{label}.json'
    await (await pending.value).save_as(file)
    return json.loads(file.read_text(encoding='utf8'))

def ids(payload):
    a = payload['alternatives'][0]
    r = a['analysisResult']
    cs = r.get('parcelCandidates', [])
    assert r['alternativeId'] == a['alternativeId']
    assert all(c['sourceRiskResultId'] == r['riskResultId'] and c['districtResultId'] == r['districtResultId'] for c in cs)
    assert len(set(c['districtId'] for c in cs)) == len(cs)
    assert payload['resultIndex']['alternatives'][0]['riskResultId'] == r['riskResultId']
    return [a['alternativeId'], r['riskResultId'], r.get('districtResultId'), [c['districtId'] for c in cs]]

async def analyze(page):
    await page.get_by_role('tab', name='01 분석 지표 선택').click()
    async with page.expect_response(lambda r:'/risk-analysis' in r.url, timeout=120000) as response:
        await page.get_by_role('button', name='Risk 분석 실행', exact=True).click()
    result = await response.value
    assert result.status == 200, await result.text()
    assert result.request.post_data_json['schemaVersion'] == 2
    await expect(page.locator('[data-analysis-message]')).to_contain_text('분석 완료', timeout=180000)

async def derive(page):
    button = page.get_by_role('button', name='실천권역도출하기', exact=True)
    calls = []
    def record(request): calls.append(request.url)
    page.on('request', record)
    try:
        async with page.expect_response(lambda r:'/practice-areas' in r.url, timeout=120000) as pending:
            await button.click()
        response = await pending.value
        assert response.status == 200, await response.text()
        request = response.request.post_data_json
        result = await response.json()
        assert request['sourceRiskResultId'] == result['sourceRiskResultId']
        assert request['candidateContextKey'] == result['candidateContextKey']
        assert result['metadata']['partialBoxes'] == 0, result['metadata']
        assert not any('/cadastre/bbox?' in url or '/vworld-data?' in url for url in calls), calls
        for name, value in [('request', request), ('response', result)]:
            (OUT / f"{request['hazard']}-server-{name}.json").write_text(json.dumps(value, ensure_ascii=False), encoding='utf8')
    finally:
        page.remove_listener('request', record)
    await expect(page.get_by_role('tab', name='03 실천권역 구성')).to_have_attribute('aria-selected', 'true', timeout=120000)
    await expect(button).to_be_enabled(timeout=120000)

async def check(browser, hazard):
    context = await browser.new_context(accept_downloads=True, viewport={'width':1543,'height':1244})
    async def read_only_database(route):
        if route.request.method in ['GET', 'HEAD', 'OPTIONS']: return await route.continue_()
        return await route.fulfill(status=403, json={'error':'Release verification never writes production drafts'})
    await context.route('**/rest/v1/**', read_only_database)
    page = await context.new_page()
    errors, requests = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('request', lambda r: requests.append(r.url))
    try:
        # Existing product behavior opts into local draft restoration via this flag.
        await page.goto(f'{BASE}/{hazard}?regionCode=41110&resumeDraft=1', wait_until='networkidle', timeout=90000)
        await page.get_by_role('button', name='첫 대안 탭 만들기', exact=True).click()
        await analyze(page)
        print(hazard + ': analysis complete', flush=True)
        await derive(page)
        first = await export(page, hazard, 'derived')
        before = ids(first)
        assert len(before[3]) > 0
        # A server failure must keep the last completed result and permit retry.
        async def unavailable(route):
            await route.fulfill(status=503, json={'error':'검증용 서버 응답 실패'})
        await page.route('**/practice-areas', unavailable)
        await page.get_by_role('tab', name='01 분석 지표 선택').click()
        await page.get_by_role('button', name='실천권역도출하기', exact=True).click()
        await expect(page.get_by_text('검증용 서버 응답 실패', exact=False).first).to_be_visible(timeout=10000)
        failed = await export(page, hazard, 'failure-preserved')
        assert ids(failed) == before
        assert failed['alternatives'][0]['analysisResult']['parcelCandidates'] == first['alternatives'][0]['analysisResult']['parcelCandidates']
        await page.unroute('**/practice-areas', unavailable)
        await page.wait_for_timeout(1000)
        await page.reload(wait_until='networkidle', timeout=90000)
        await expect(page.get_by_role('button', name='실천권역도출하기', exact=True)).to_be_enabled(timeout=90000)
        restored = await export(page, hazard, 'reloaded')
        assert ids(restored) == before
        print(hazard + ': reload IDs preserved', flush=True)
        # Simulate the geometry-free saved payload only inside this disposable profile.
        await page.wait_for_timeout(1000)
        await page.evaluate('''hazard => new Promise((resolve,reject)=>{
          const req=indexedDB.open('livinglabs-priority-management',1);
          req.onerror=()=>reject(req.error);
          req.onsuccess=()=>{
            const db=req.result, tx=db.transaction('priority-management-sessions','readwrite'), store=tx.objectStore('priority-management-sessions');
            const get=store.get('priority-management-draft/v2:'+hazard+':41110');
            get.onsuccess=()=>{const d=get.result; if(!d){reject(new Error('missing test draft'));return;}
              for(const r of [d.analysisResult,...d.alternatives.map(a=>a.analysisResult)]) {
                if(r) for(const c of r.parcelCandidates||[]) c.features=[];
              } store.put(d);
            }; tx.oncomplete=()=>{db.close();resolve(true)}; tx.onerror=()=>reject(tx.error);
          } })''', hazard)
        requests.clear()
        await page.reload(wait_until='networkidle', timeout=90000)
        await expect(page.get_by_text('저장된 필지 도형', exact=False)).to_be_visible(timeout=90000)
        compact = await export(page, hazard, 'geometry-restored')
        assert ids(compact) == before
        assert any('/cadastre/parcel?' in u for u in requests)
        assert not any('/cadastre/bbox?' in u for u in requests)
        assert all(c.get('features') for c in compact['alternatives'][0]['analysisResult']['parcelCandidates'])
        await page.wait_for_function("[...document.querySelectorAll('img.leaflet-tile')].some(i=>i.complete && i.naturalWidth>0)", timeout=20000)
        loaded_tiles = await page.locator('img.leaflet-tile').evaluate_all('(images)=>images.filter(i=>i.complete && i.naturalWidth>0).length')
        await page.screenshot(path=str(OUT / f'{hazard}.png'))
        await page.get_by_role('tab', name='01 분석 지표 선택').click()
        await derive(page)
        redone = ids(await export(page, hazard, 'rederived'))
        assert redone[:2] == before[:2] and redone[2] != before[2]
        await analyze(page)
        recalculated = ids(await export(page, hazard, 'recalculated'))
        assert recalculated[0] == before[0] and recalculated[1] != before[1]
        assert recalculated[2] is None and not recalculated[3]
        assert not errors, errors
        return {'hazard':hazard,'ok':True,'districts':len(before[3]),'serverDerivation':True,'failurePreservesResults':True,'reload':True,'pnuRestore':True,'rederive':True,'recalculate':True,'loadedBackgroundTiles':loaded_tiles}
    except Exception as e:
        await page.screenshot(path=str(OUT / f'{hazard}-failure.png'))
        return {'hazard':hazard,'ok':False,'error':str(e),'pageErrors':errors}
    finally:
        await context.close()

async def main():
    OUT.mkdir(parents=True,exist_ok=True)
    results=[]
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True)
        baseline=await browser.new_page(viewport={'width':1543,'height':1244})
        initial=await baseline.goto(f'{BASE}/flood?regionCode=41110',wait_until='networkidle',timeout=90000)
        assert initial.status == 200
        await expect(baseline.get_by_role('link',name='부문선택으로 돌아가기',exact=False)).to_be_visible()
        await baseline.screenshot(path=str(OUT/'baseline.png'))
        version=await baseline.evaluate("async()=> (await fetch('/internal-tools/_app/version.json')).json()")
        (OUT/'baseline.json').write_text(json.dumps({'url':baseline.url,'status':initial.status,'title':await baseline.title(),'build':version},ensure_ascii=False,indent=2),encoding='utf8')
        await baseline.close()
        for hazard in ['flood','heatwave']:
            result=await check(browser,hazard)
            results.append(result)
            print(json.dumps(result,ensure_ascii=False),flush=True)
            (OUT/'report.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
        await browser.close()
    if not all(r['ok'] for r in results): raise SystemExit(1)

asyncio.run(main())
