"""Exercise the authoritative flood/heatwave UI against real regional APIs."""

import argparse, asyncio, json, re, time
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output/national-platform-audit"
BASE = "http://127.0.0.1:4173/internal-tools/priority-management-area"


async def check(browser, code, hazard, wbgt=False):
    context = await browser.new_context(viewport={"width": 1600, "height": 1050})
    page = await context.new_page()
    errors = []
    grids = []
    pending = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    async def record(response):
        if any(
            s in response.url
            for s in [
                "/hazard-grid?",
                "/flood-grid?",
                "/analysis-grid?",
                "/population/grid?",
            ]
        ):
            try:
                g = await response.json()
                grids.append(
                    {
                        "url": response.url.split("4173")[-1],
                        "status": response.status,
                        "indicator": g.get("indicatorCode", g.get("indicator")),
                        "quality": g.get("qualityStatus"),
                        "stats": g.get("stats"),
                        "rows": g.get("rows"),
                        "columns": g.get("columns"),
                        "transform": g.get("transform"),
                        "sparseCount": len(g.get("sparseValues", [])) // 2,
                        "error": g.get("error"),
                    }
                )
            except Exception as exc:
                grids.append({"url": response.url, "error": str(exc)})

    page.on("response", lambda r: pending.append(asyncio.create_task(record(r))))
    started = time.monotonic()
    result = {"code": code, "hazard": hazard, "wbgt": wbgt}
    try:
        if hazard == "flood":
            async with page.expect_response(
                lambda r: "/indicator-availability?" in r.url, timeout=30000
            ):
                await page.goto(
                    f"{BASE}/{hazard}?regionCode={code}",
                    wait_until="domcontentloaded",
                    timeout=60000,
                )
        else:
            await page.goto(
                f"{BASE}/{hazard}?regionCode={code}",
                wait_until="domcontentloaded",
                timeout=60000,
            )
        await page.get_by_role("button", name="Risk 분석 실행", exact=True).wait_for()
        await page.wait_for_timeout(500)
        assert "PUBLIC DEMO" not in await page.locator("body").inner_text()
        if wbgt:
            row = page.locator(".indicator-item").filter(
                has=page.get_by_text("H11 · 추정 WBGT (시험)", exact=True)
            )
            await row.locator("input[type=checkbox]").check()
            # H11 alone verifies that risk cannot succeed by silently dropping WBGT.
            for other_row in await page.locator(
                '.indicator-item[data-dimension="H"]'
            ).all():
                checkbox = other_row.locator("input[type=checkbox]")
                if (
                    "H11 ·" not in await other_row.inner_text()
                    and await checkbox.is_checked()
                ):
                    await checkbox.uncheck()
        selected = await page.locator(".indicator-item").evaluate_all(
            "rows => rows.filter(r=>r.querySelector('input[type=checkbox]')?.checked).map(r=>r.innerText)"
        )
        await page.get_by_role("button", name="Risk 분석 실행", exact=True).click()
        status = page.locator("[data-analysis-message]")
        await page.wait_for_function(
            """() => {
            const t=document.querySelector('[data-analysis-message]')?.textContent||'';
            return t.includes('분석 완료')||t.includes('못했습니다')||t.includes('실행할 수 없습니다');
        }""",
            timeout=180000,
        )
        message = await status.inner_text()
        result.update(
            message=message, visible=await status.is_visible(), selected=selected
        )
        result["ok"] = "분석 완료" in message and bool(
            re.search(r"격자 [\d,]+셀", message)
        )
        result["risk_cells"] = (
            int(re.search(r"격자 ([\d,]+)셀", message).group(1).replace(",", ""))
            if result["ok"]
            else 0
        )
        if wbgt:
            h11 = [g for g in grids if "indicator=H11" in g["url"]]
            result["wbgt_source_ok"] = bool(
                h11
                and h11[-1].get("quality")
                == "EXPERIMENTAL_SPATIAL_REFERENCE_WBGT_V2_NATIONAL"
            )
            result["ok"] &= result["wbgt_source_ok"]
        if not result["ok"] or code in ["41110", "11680", "50110"]:
            await page.screenshot(
                path=str(
                    OUT
                    / f'{hazard}_{code}_{"wbgt" if wbgt else "default"}_{int(time.time())}.png'
                )
            )
    except Exception as exc:
        result.update(ok=False, error=str(exc))
        try:
            await page.screenshot(path=str(OUT / f"{hazard}_{code}_error.png"))
        except Exception:
            pass
    finally:
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
        result.update(
            pageErrors=errors, grids=grids, seconds=round(time.monotonic() - started, 2)
        )
        if errors:
            result["ok"] = False
        await context.close()
    return result


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--regions", default="41110,11680,28177,26290,50110,47940,11110,27140"
    )
    parser.add_argument("--hazards", default="flood,heatwave")
    parser.add_argument("--wbgt", action="store_true")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--name", default="browser-results")
    args = parser.parse_args()
    OUT.mkdir(exist_ok=True)
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
    done = {(r["code"], r["hazard"], r.get("wbgt", False)) for r in results if r["ok"]}
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path="C:/Program Files/Google/Chrome/Application/chrome.exe",
            headless=True,
            args=["--disable-dev-shm-usage"],
        )
        for code in codes:
            for hazard in args.hazards.split(","):
                wbgt = args.wbgt and hazard == "heatwave"
                if (code, hazard, wbgt) in done:
                    continue
                r = await check(browser, code, hazard, wbgt)
                results = [
                    x
                    for x in results
                    if (x["code"], x["hazard"], x.get("wbgt", False))
                    != (code, hazard, wbgt)
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
                                "wbgt",
                                "ok",
                                "risk_cells",
                                "message",
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
        json.dumps(
            {"checked": len(results), "passed": sum(bool(r["ok"]) for r in results)}
        ),
        flush=True,
    )
    if not results or not all(r["ok"] for r in results):
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
