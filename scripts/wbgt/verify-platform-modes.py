"""Check WBGT availability, raw-value legend and future/current mode isolation."""

import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path(__file__).resolve().parents[2] / "output/national-platform-audit"


async def main():
    results = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path="C:/Program Files/Google/Chrome/Application/chrome.exe",
            headless=True,
        )
        for code in ["41110", "11230", "31170", "50110"]:
            context = await browser.new_context(
                viewport={"width": 1600, "height": 1050}
            )
            page = await context.new_page()
            result = {"code": code}
            try:
                await page.goto(
                    f"http://127.0.0.1:4173/internal-tools/priority-management-area/heatwave?regionCode={code}",
                    wait_until="domcontentloaded",
                )
                row = page.locator(".indicator-item").filter(
                    has=page.get_by_text("H11 · 추정 WBGT (시험)", exact=True)
                )
                await row.locator("input[type=checkbox]").check()
                h01 = page.locator(".indicator-item").filter(
                    has=page.get_by_text("H01 · 평균기온", exact=True)
                )
                await h01.locator("input[type=checkbox]").uncheck()
                await page.locator("[data-wbgt-range]").wait_for()
                result["wbgt_range"] = await page.locator(
                    "[data-wbgt-range]"
                ).inner_text()
                select = page.locator("select").filter(
                    has=page.locator('option[value="future"]')
                )
                await select.select_option("future")
                await page.wait_for_function(
                    "() => document.querySelector('[data-analysis-message]')?.textContent.includes('미래')"
                )
                assert await row.locator("input[type=checkbox]").is_disabled()
                assert not await row.locator("input[type=checkbox]").is_checked()
                assert await page.locator("[data-wbgt-range]").count() == 0
                await page.get_by_role(
                    "button", name="Risk 분석 실행", exact=True
                ).click()
                await page.wait_for_function(
                    "() => {const t=document.querySelector('[data-analysis-message]')?.textContent||'';return t.includes('분석 완료')||t.includes('못했습니다')}",
                    timeout=120000,
                )
                message = await page.locator("[data-analysis-message]").inner_text()
                assert "분석 완료" in message, message
                result["future_result"] = message
                await select.select_option("observed")
                await page.wait_for_function(
                    "() => document.querySelector('[data-analysis-message]')?.textContent.includes('최근 5년')"
                )
                assert not await row.locator("input[type=checkbox]").is_disabled()
                result["ok"] = True
            except Exception as exc:
                result.update(ok=False, error=str(exc))
            finally:
                await context.close()
            results.append(result)
            print(json.dumps(result, ensure_ascii=False), flush=True)
        await browser.close()
    (OUT / "mode-results.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2), encoding="utf8"
    )
    if not all(r["ok"] for r in results):
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
