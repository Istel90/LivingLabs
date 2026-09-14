const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    for (const hazard of ['flood','heatwave']) {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:4173/internal-tools/priority-management-area/${hazard}?regionCode=41110`);
      const arrow = page.getByRole('button',{name:'첫 대안 탭 만들기',exact:true});
      await arrow.waitFor();
      assert.equal(await page.locator('.browser-tab:not(.overlap-result-tab)').count(),0);
      assert.equal(await page.getByRole('button',{name:'저장',exact:true}).isDisabled(),true);
      await arrow.click();
      await page.getByRole('button',{name:'대안 1 삭제',exact:true}).waitFor();
      assert.equal(await page.locator('.browser-tab:not(.overlap-result-tab)').count(),1);
      await page.getByRole('button',{name:'대안 1 삭제',exact:true}).click();
      await page.getByRole('dialog',{name:'대안 삭제 확인'}).getByRole('button',{name:'삭제',exact:true}).click();
      await arrow.waitFor();
      await page.reload();
      await arrow.waitFor();
      console.log(`PASS ${hazard}: empty entry, create first, delete last, reload`);
      await page.screenshot({path:`output/empty-start-backup-20260914/${hazard}-after.png`});
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
