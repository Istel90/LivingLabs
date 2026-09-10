"""Local IndexedDB and intercepted server-draft round-trip; no external writes."""

import asyncio, hashlib, json, time, sys
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path(__file__).resolve().parents[2] / "output/national-platform-audit"


async def export(page):
    async with page.expect_download(timeout=90000) as d:
        await page.get_by_role("button", name="설정 내보내기", exact=True).click()
    download = await d.value
    return json.loads(Path(await download.path()).read_text(encoding="utf8"))


def fingerprint(data):
    grid = data["analysisResult"]["gridResult"]
    keys = [
        "values",
        "hValues",
        "eValues",
        "sensitivityValues",
        "adaptiveCapacityValues",
        "vValues",
    ]
    return {
        k: hashlib.sha256(
            json.dumps(grid[k], sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        for k in keys
    }


async def main():
    results = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path="C:/Program Files/Google/Chrome/Application/chrome.exe",
            headless=True,
        )
        for code in (
            sys.argv[1].split(",") if len(sys.argv) > 1 else ["41110", "50110", "28000"]
        ):
            for hazard in ["flood", "heatwave"]:
                context = await browser.new_context(
                    viewport={"width": 1600, "height": 1050}, accept_downloads=True
                )
                page = await context.new_page()
                saved = []
                r = {"code": code, "hazard": hazard}

                async def mock(route):
                    req = route.request
                    if "/priority_area_sets" in req.url:
                        if req.method == "POST":
                            row = req.post_data_json
                            row.update(id="qa-draft", created_at="2026-09-08T00:00:00Z")
                            saved.append(row)
                            await route.fulfill(status=201, json=[row])
                        else:
                            await route.fulfill(status=200, json=saved)
                    elif "/regions" in req.url:
                        await route.fulfill(status=200, json=[])
                    else:
                        await route.abort()

                await context.route("**/rest/v1/**", mock)
                try:
                    url = f"http://127.0.0.1:4173/internal-tools/priority-management-area/{hazard}?regionCode={code}"
                    await page.goto(url, wait_until="domcontentloaded")
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
                    original = await export(page)
                    original_hash = fingerprint(original)
                    await page.wait_for_function(
                        """async ({code,hazard}) => await new Promise(resolve=>{const q=indexedDB.open('livinglabs-priority-management');q.onsuccess=()=>{const db=q.result;const g=db.transaction('priority-management-sessions').objectStore('priority-management-sessions').getAll();g.onsuccess=()=>{resolve(g.result.some(d=>d.regionCode===code&&d.hazard===hazard&&d.analysisDone&&d.analysisResult?.gridResult?.stats?.validCells>0));db.close()};g.onerror=()=>resolve(false)};q.onerror=()=>resolve(false)})""",
                        arg={"code": code, "hazard": hazard},
                        timeout=120000,
                    )
                    await page.goto(
                        url + "&resumeDraft=1", wait_until="domcontentloaded"
                    )
                    await page.wait_for_function(
                        "() => document.querySelector('[data-analysis-message]')?.textContent.includes('분석 완료')",
                        timeout=60000,
                    )
                    assert (
                        fingerprint(await export(page)) == original_hash
                    ), "Local restored values changed"
                    r["local_roundtrip"] = True
                    await page.locator(".db-save-action").click()
                    await page.get_by_role(
                        "heading", name="대안 저장 완료", exact=True
                    ).wait_for(timeout=90000)
                    assert saved, "Server write was not intercepted"
                    await page.get_by_role("button", name="확인", exact=True).click()
                    # Switch to an empty alternative to prove load restores the saved one.
                    await page.locator(".browser-tab-select").nth(1).click()
                    await page.locator(".db-load-action").click()
                    await page.locator(".saved-draft-row").first.click()
                    restored = await export(page)
                    restored_hash = fingerprint(restored)
                    if restored_hash != original_hash:
                        differences = {}
                        for key in original_hash:
                            before = original["analysisResult"]["gridResult"][key]
                            after = restored["analysisResult"]["gridResult"][key]
                            if original_hash[key] != restored_hash[key]:
                                diffs = [
                                    (i, a, b)
                                    for i, (a, b) in enumerate(zip(before, after))
                                    if a != b
                                ]
                                differences[key] = {
                                    "count": len(diffs),
                                    "examples": diffs[:8],
                                }
                        r["differences"] = differences
                    assert (
                        restored_hash == original_hash
                    ), "Compact server restored values changed"
                    r.update(
                        server_payload_roundtrip=True,
                        server_test="intercepted; no external writes",
                        ok=True,
                    )
                    for layer in ["H", "E", "V", "Risk"]:
                        await page.locator(".analysis-grid-tabs").get_by_role(
                            "button", name=layer, exact=True
                        ).click()
                        assert await page.locator("canvas.risk-grid-canvas").count() > 0
                except Exception as e:
                    r.update(ok=False, error=str(e))
                finally:
                    await context.close()
                results.append(r)
                print(json.dumps(r, ensure_ascii=False), flush=True)
        await browser.close()
    (OUT / "draft-roundtrip.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2), encoding="utf8"
    )
    if not all(r["ok"] for r in results):
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
