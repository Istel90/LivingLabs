const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try {
  for(const hazard of ['flood','heatwave']){
   const page=await browser.newPage({viewport:{width:1718,height:1272}});
   await page.goto(`${process.env.PLATFORM_TEST_ORIGIN||'http://127.0.0.1:4173'}/internal-tools/priority-management-area/${hazard}?regionCode=41110`);
   await page.waitForTimeout(3500);
   await page.getByRole('button',{name:'첫 대안 탭 만들기',exact:true}).click();
   const color=page.getByRole('button',{name:'지도 색상',exact:true});
   const list=page.getByRole('button',{name:/^사용된 지표 목록/});
   await color.waitFor();
   assert.equal(await color.getAttribute('aria-expanded'),'false');
   assert.equal(await list.getAttribute('aria-expanded'),'false');
   assert.equal(await page.getByRole('combobox',{name:'지도 색상 기준'}).count(),0);
   await page.getByRole('button',{name:'H',exact:true}).click();
   await list.click();
   assert.equal(await list.getAttribute('aria-expanded'),'true');
   await color.click();
   const select=page.getByRole('combobox',{name:'지도 색상 기준'});
   await select.selectOption('range');
   assert.equal(await select.inputValue(),'range');
   const left=await page.locator('.analysis-legend').boundingBox();
   const right=await page.locator('.map-color-panel').boundingBox();
   assert.ok(right.x>left.x+left.width,'color drawer must be separate on right');
   await page.screenshot({path:`output/map-controls-backup-20260914/${hazard}-expanded.png`});
   await page.getByRole('button',{name:'지도 색상 닫기',exact:true}).click();
   assert.equal(await list.getAttribute('aria-expanded'),'true');
   await list.click();
   await page.screenshot({path:`output/map-controls-backup-20260914/${hazard}-collapsed.png`});
   console.log(`PASS ${hazard}: both collapsed initially, independent toggles, color setting, right-edge placement`);
   await page.close();
  }
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
