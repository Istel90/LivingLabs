"""Regression of failure/retry, map layers, alternatives and parcel derivation."""

import asyncio, json, re, time
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output/national-platform-audit/workflows"
OUT.mkdir(exist_ok=True)
BASE = "http://127.0.0.1:4173/internal-tools/priority-management-area"


async def run(page):
    await page.get_by_role("button", name="Risk 분석 실행", exact=True).click()
    await page.wait_for_function(
        """() => {const t=document.querySelector('[data-analysis-message]')?.textContent||'';return t.includes('분석 완료')||t.includes('못했습니다')||t.includes('실행할 수 없습니다')}""",
        timeout=180000,
    )
    return await page.locator("[data-analysis-message]").inner_text()


async def check(browser, hazard, code):
    context = await browser.new_context(
        viewport={"width": 1600, "height": 1050}, accept_downloads=True
    )
    page = await context.new_page()
    steps = []
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    try:
        await page.goto(
            f"{BASE}/{hazard}?regionCode={code}", wait_until="domcontentloaded"
        )
        await page.locator(".leaflet-container").wait_for(timeout=30000)
        await page.locator(".map-refresh-loading").wait_for(
            state="hidden", timeout=30000
        )
        steps.append("local map ready")
        assert "분석 완료" in await run(page)
        steps.append("risk calculation")
        for layer in ["H", "E", "V", "Risk", "Hotspot"]:
            button = page.locator(".analysis-grid-tabs").get_by_role(
                "button", name=layer, exact=True
            )
            await button.click()
            assert "active" in (await button.get_attribute("class") or "")
        steps.append("all five map layers")
        async with page.expect_download() as d:
            await page.get_by_role("button", name="설정 내보내기", exact=True).click()
        download = await d.value
        path = OUT / f"{hazard}_{code}_settings.json"
        await download.save_as(path)
        config = json.loads(path.read_text(encoding="utf8"))
        assert config["hazard"] == hazard and config["regionCode"] == code
        expected_name = {
            "41110": "수원시",
            "11680": "강남구",
            "26290": "남구",
            "50110": "제주시",
        }[code]
        assert (
            expected_name in config["region"] and expected_name in config["projectName"]
        ), config["region"]
        assert config["analysisResult"]["gridResult"]["stats"]["validCells"] > 0
        steps.append("settings export with actual result")
        tabs = page.locator(".browser-tab-select")
        await tabs.nth(1).click()
        assert (
            "분석 완료"
            not in await page.locator("[data-analysis-message]").inner_text()
        )
        await tabs.nth(0).click()
        assert "분석 완료" in await page.locator("[data-analysis-message]").inner_text()
        steps.append("alternative result isolation and restoration")
        # A selected source failure must stop calculation and allow retry.
        target = (
            "**/analysis-grid?*indicator=facility-shelter"
            if hazard == "flood"
            else "**/population/grid?*indicator=elderly"
        )
        await page.reload(wait_until="domcontentloaded")
        await page.locator(".leaflet-container").wait_for()
        await page.route(
            target,
            lambda route: route.fulfill(
                status=503,
                content_type="application/json",
                body='{"error":"regression source unavailable"}',
            ),
        )
        message = await run(page)
        assert "못했습니다" in message, message
        assert await page.get_by_role(
            "button", name="Risk 분석 실행", exact=True
        ).is_enabled()
        assert await page.locator("[data-analysis-message]").is_visible()
        steps.append("source failure visible; no invented fallback; button released")
        await page.unroute(target)
        assert "분석 완료" in await run(page)
        steps.append("source retry succeeds")
        # A one-cell shift is an incompatible input even if rows/columns match.
        await page.reload(wait_until="domcontentloaded")
        await page.locator(".leaflet-container").wait_for()

        async def shift(route):
            response = await route.fetch()
            g = await response.json()
            g["transform"]["originX"] += 100
            await route.fulfill(response=response, json=g)

        await page.route(target, shift)
        message = await run(page)
        assert "정렬되지 않은" in message, message
        steps.append("misaligned selected grid rejected")
        await page.unroute(target)
        assert "분석 완료" in await run(page)
        await page.get_by_role("button", name="실천권역도출하기", exact=True).click()
        await page.get_by_role("button", name="실천권역도출하기", exact=True).wait_for(
            timeout=240000
        )
        parcel = await page.locator(".parcel-candidate-tools > span").inner_text()
        assert re.search(r"[1-9][0-9]*개.*실천지구.*(?:도출|표시)", parcel), parcel
        steps.append(parcel)
        await page.screenshot(
            path=str(OUT / f"{hazard}_{code}_map_{int(time.time())}.png"), timeout=15000
        )
        return {
            "hazard": hazard,
            "code": code,
            "ok": True,
            "steps": steps,
            "pageErrors": errors,
        }
    except Exception as exc:
        return {
            "hazard": hazard,
            "code": code,
            "ok": False,
            "steps": steps,
            "error": str(exc),
            "pageErrors": errors,
        }
    finally:
        await context.close()


async def main():
    results = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path="C:/Program Files/Google/Chrome/Application/chrome.exe",
            headless=True,
        )
        for code in ["41110", "11680", "26290", "50110"]:
            for hazard in ["flood", "heatwave"]:
                r = await check(browser, hazard, code)
                results.append(r)
                (OUT / "results.json").write_text(
                    json.dumps(results, ensure_ascii=False, indent=2), encoding="utf8"
                )
                print(json.dumps(r, ensure_ascii=False), flush=True)
        await browser.close()
    if not all(r["ok"] and not r["pageErrors"] for r in results):
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
