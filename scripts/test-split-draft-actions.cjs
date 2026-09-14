const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try {
  for(const hazard of ['flood','heatwave']){
   const page=await browser.newPage();
   const responses=[];
   page.on('response',r=>{if(r.url().includes('/rest/v1/priority_area_sets')) responses.push(r.status());});
   await page.goto(`${process.env.PLATFORM_TEST_ORIGIN||'http://127.0.0.1:4173'}/internal-tools/priority-management-area/${hazard}?regionCode=41110`);
   await page.waitForTimeout(3500);
   await page.getByRole('button',{name:'불러오기',exact:true}).click();
   const load=page.getByRole('dialog',{name:'저장본 불러오기'});
   await load.waitFor();
   assert.equal(await load.getByRole('tab').count(),0);
   await page.getByRole('button',{name:'불러오기 닫기',exact:true}).click();
   await page.getByRole('button',{name:'대안 겹침 비교',exact:true}).click();
   const compare=page.getByRole('dialog',{name:'대안 겹침 비교',exact:true});
   await compare.waitFor();
   assert.equal(await compare.getByRole('tab').count(),0);
   await page.waitForTimeout(1500);
   assert.ok(responses.some(s=>s===200),'saved drafts read should succeed');
   await page.screenshot({path:`output/split-draft-actions-20260914/${hazard}.png`});
   await page.getByRole('button',{name:'대안 겹침 비교 닫기',exact:true}).click();
   await page.getByRole('button',{name:'불러오기',exact:true}).click();
   await load.waitFor();
   console.log(`PASS ${hazard}: independent load/compare entry, no nested tabs, load reopens correctly, saved drafts HTTP 200`);
   await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
