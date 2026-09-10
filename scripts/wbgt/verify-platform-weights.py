"""Verify changed indicator weights affect actual results in both hazards."""

import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path(__file__).resolve().parents[2] / "output/national-platform-audit/weights"


async def export(page):
    async with page.expect_download(timeout=60000) as d:
        await page.get_by_role("button", name="설정 내보내기", exact=True).click()
    down = await d.value
    return json.loads(Path(await down.path()).read_text(encoding="utf8"))


async def run(page):
    await page.get_by_role("button", name="Risk 분석 실행", exact=True).click()
    await page.wait_for_function(
        "() => document.querySelector('[data-analysis-message]')?.textContent.includes('분석 완료')",
        timeout=120000,
    )


async def main():
    OUT.mkdir(exist_ok=True)
    report = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path="C:/Program Files/Google/Chrome/Application/chrome.exe",
            headless=True,
        )
        for code in ["41110", "50110"]:
            for hazard in ["flood", "heatwave"]:
                context = await browser.new_context(
                    viewport={"width": 1600, "height": 1050}, accept_downloads=True
                )
                page = await context.new_page()
                r = {"code": code, "hazard": hazard}
                try:
                    await page.goto(
                        f"http://127.0.0.1:4173/internal-tools/priority-management-area/{hazard}?regionCode={code}",
                        wait_until="domcontentloaded",
                    )
                    if hazard == "heatwave":
                        await page.locator(".indicator-item").filter(
                            has=page.get_by_text("H11 · 추정 WBGT (시험)", exact=True)
                        ).locator("input[type=checkbox]").check()
                    await run(page)
                    before = await export(page)
                    name = (
                        "H01 · 도시침수 30년"
                        if hazard == "flood"
                        else "H11 · 추정 WBGT (시험)"
                    )
                    for _ in range(5):
                        await page.get_by_role(
                            "button", name=name + " 가중치 증가", exact=True
                        ).click()
                    assert (
                        "분석 완료"
                        not in await page.locator(
                            "[data-analysis-message]"
                        ).inner_text()
                    )
                    await run(page)
                    after = await export(page)
                    assert (
                        after["analysisResult"]["riskScore"]
                        != before["analysisResult"]["riskScore"]
                    )
                    actual = next(
                        i["weight"]
                        for i in after["analysisResult"]["indicators"]
                        if i["label"] == name
                    )
                    assert actual == 1.5
                    (OUT / f"{hazard}_{code}_settings.json").write_text(
                        json.dumps(after, ensure_ascii=False), encoding="utf8"
                    )
                    r.update(
                        ok=True,
                        weight=actual,
                        before=before["analysisResult"]["riskScore"],
                        after=after["analysisResult"]["riskScore"],
                    )
                except Exception as e:
                    r.update(ok=False, error=str(e))
                finally:
                    await context.close()
                report.append(r)
                print(json.dumps(r, ensure_ascii=False), flush=True)
        await browser.close()
    (OUT / "results.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8"
    )
    if not all(r["ok"] for r in report):
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
