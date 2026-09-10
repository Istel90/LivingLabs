"""All-region end-to-end risk, layers and real cadastral parcel derivation."""

import argparse, asyncio, json, re, time
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output/national-platform-audit"


async def check(browser, code, hazard):
    start = time.monotonic()
    r = {"code": code, "hazard": hazard, "wbgt": hazard == "heatwave"}
    context = await browser.new_context(
        viewport={"width": 1600, "height": 1050}, accept_downloads=True
    )
    page = await context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
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
        await page.get_by_role("button", name="Risk 분석 실행", exact=True).click()
        await page.wait_for_function(
            "() => {const t=document.querySelector('[data-analysis-message]')?.textContent||'';return t.includes('분석 완료')||t.includes('못했습니다')}",
            timeout=180000,
        )
        r["risk_message"] = await page.locator("[data-analysis-message]").inner_text()
        assert "분석 완료" in r["risk_message"], r["risk_message"]
        for layer in ["H", "E", "V", "Risk", "Hotspot"]:
            button = page.locator(".analysis-grid-tabs").get_by_role(
                "button", name=layer, exact=True
            )
            await button.click()
            assert "active" in (await button.get_attribute("class") or "")
        await page.get_by_role("button", name="실천권역도출하기", exact=True).click()
        await page.get_by_role("button", name="실천권역도출하기", exact=True).wait_for(
            timeout=240000
        )
        r["parcel_message"] = await page.locator(
            ".parcel-candidate-tools > span"
        ).inner_text()
        assert re.search(
            r"[1-9][0-9]*개.*실천지구.*(?:도출|표시)", r["parcel_message"]
        ), r["parcel_message"]
        async with page.expect_download() as d:
            await page.get_by_role("button", name="설정 내보내기", exact=True).click()
        download = await d.value
        data = json.loads(Path(await download.path()).read_text(encoding="utf8"))
        assert data["regionCode"] == code and data["hazard"] == hazard
        assert code == "41110" or data["region"] != "경기도 수원시", data["region"]
        r["region"] = data["region"]
        r["stats"] = data["analysisResult"]["gridResult"]["stats"]
        candidates = data["analysisResult"].get("parcelCandidates", [])
        r["candidate_count"] = len(candidates)
        assert len(candidates) > 0
        r["candidate_keys"] = list(candidates[0])
        r["ok"] = not errors
    except Exception as e:
        r.update(ok=False, error=str(e))
    finally:
        r["pageErrors"] = errors
        r["seconds"] = round(time.monotonic() - start, 2)
        await context.close()
    return r


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--regions", default="all")
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--name", default="nationwide-parcels")
    args = ap.parse_args()
    codes = (
        json.loads((OUT / "regions.json").read_text())
        if args.regions == "all"
        else args.regions.split(",")
    )
    target = OUT / f"{args.name}.json"
    results = (
        json.loads(target.read_text(encoding="utf8"))
        if args.resume and target.exists()
        else []
    )
    done = {(r["code"], r["hazard"]) for r in results if r["ok"]}
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path="C:/Program Files/Google/Chrome/Application/chrome.exe",
            headless=True,
        )
        for code in codes:
            for hazard in ["flood", "heatwave"]:
                if (code, hazard) in done:
                    continue
                r = await check(browser, code, hazard)
                results = [
                    x for x in results if (x["code"], x["hazard"]) != (code, hazard)
                ] + [r]
                target.write_text(
                    json.dumps(results, ensure_ascii=False, indent=2), encoding="utf8"
                )
                print(
                    json.dumps(
                        {
                            k: r.get(k)
                            for k in [
                                "code",
                                "hazard",
                                "ok",
                                "parcel_message",
                                "candidate_count",
                                "error",
                                "seconds",
                            ]
                        },
                        ensure_ascii=False,
                    ),
                    flush=True,
                )
        await browser.close()
    print(
        json.dumps({"checked": len(results), "passed": sum(r["ok"] for r in results)}),
        flush=True,
    )
    if not all(r["ok"] for r in results):
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
