"""Verify the actual map PNG download in an isolated browser without a native picker."""

import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright
from PIL import Image

OUT = Path(__file__).resolve().parents[2] / "output/national-platform-audit/exports"


async def main():
    OUT.mkdir(exist_ok=True)
    results = []
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
                # Exercise the supported browser download fallback in headless QA.
                await context.add_init_script("window.showSaveFilePicker = undefined")
                page = await context.new_page()
                r = {"code": code, "hazard": hazard}
                try:
                    await page.goto(
                        f"http://127.0.0.1:4173/internal-tools/priority-management-area/{hazard}?regionCode={code}",
                        wait_until="domcontentloaded",
                    )
                    await page.locator(".leaflet-container").wait_for()
                    if hazard == "heatwave":
                        await page.locator(".indicator-item").filter(
                            has=page.get_by_text("H11 · 추정 WBGT (시험)", exact=True)
                        ).locator("input[type=checkbox]").check()
                        await page.locator(".indicator-item").filter(
                            has=page.get_by_text("H01 · 평균기온", exact=True)
                        ).locator("input[type=checkbox]").uncheck()
                    await page.get_by_role(
                        "button", name="Risk 분석 실행", exact=True
                    ).click()
                    await page.wait_for_function(
                        "() => document.querySelector('[data-analysis-message]')?.textContent.includes('분석 완료')",
                        timeout=120000,
                    )
                    await page.locator(".analysis-grid-tabs").get_by_role(
                        "button",
                        name="H" if hazard == "heatwave" else "Risk",
                        exact=True,
                    ).click()
                    async with page.expect_download(timeout=90000) as d:
                        await page.get_by_role(
                            "button", name="지도 PNG 다운로드", exact=True
                        ).click()
                    download = await d.value
                    assert (
                        "수원시" if code == "41110" else "제주시"
                    ) in download.suggested_filename, download.suggested_filename
                    path = OUT / f"{hazard}_{code}.png"
                    await download.save_as(path)
                    with Image.open(path) as img:
                        assert (
                            img.format == "PNG"
                            and img.width > 1000
                            and img.height > 500
                        )
                        assert len(img.resize((100, 100)).getcolors(10001)) > 10
                        r.update(
                            dimensions=img.size,
                            bytes=path.stat().st_size,
                            filename=download.suggested_filename,
                            ok=True,
                        )
                except Exception as e:
                    r.update(ok=False, error=str(e))
                finally:
                    await context.close()
                results.append(r)
                print(json.dumps(r, ensure_ascii=False), flush=True)
        await browser.close()
    (OUT / "results.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2), encoding="utf8"
    )
    if not all(r["ok"] for r in results):
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
