from __future__ import annotations

import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def request(label: str, path: str, params: dict[str, str], api_key: str) -> None:
    query = urllib.parse.urlencode({**params, "authKey": api_key})
    url = f"https://apihub.kma.go.kr/api/typ01/url/{path}?{query}"
    try:
        with urllib.request.urlopen(url, timeout=60) as response:
            payload = response.read().decode("euc-kr", errors="replace")
            print(f"{label}: HTTP {response.status}, bytes={len(payload.encode('utf-8'))}")
            print(payload[:300].replace("\n", " ").replace("\r", " "))
    except urllib.error.HTTPError as error:
        payload = error.read().decode("euc-kr", errors="replace")
        print(f"{label}: HTTP {error.code}")
        print(payload[:300].replace("\n", " ").replace("\r", " "))
    except Exception as error:  # noqa: BLE001 - this is a diagnostic probe.
        print(f"{label}: {type(error).__name__}: {error}")


def request_public_data_asos(api_key: str) -> None:
    params = {
        "ServiceKey": api_key,
        "pageNo": "1",
        "numOfRows": "10",
        "dataType": "JSON",
        "dataCd": "ASOS",
        "dateCd": "DAY",
        "startDt": "20210101",
        "endDt": "20210101",
        "stnIds": "108",
    }
    url = (
        "https://apis.data.go.kr/1360000/AsosDalyInfoService/getWthrDataList?"
        + urllib.parse.urlencode(params)
    )
    try:
        with urllib.request.urlopen(url, timeout=60) as response:
            payload = response.read().decode("utf-8", errors="replace")
            print(f"public-data-asos: HTTP {response.status}, bytes={len(payload.encode('utf-8'))}")
            print(payload[:300].replace("\n", " ").replace("\r", " "))
    except urllib.error.HTTPError as error:
        payload = error.read().decode("utf-8", errors="replace")
        print(f"public-data-asos: HTTP {error.code}")
        print(payload[:300].replace("\n", " ").replace("\r", " "))
    except Exception as error:  # noqa: BLE001 - this is a diagnostic probe.
        print(f"public-data-asos: {type(error).__name__}: {error}")


def main() -> None:
    env = {
        **read_env(ROOT / ".env.local"),
        **read_env(ROOT / "riskmap-core-main" / ".env.local"),
        **os.environ,
    }
    api_key = env.get("KMA_API_KEY")
    if not api_key:
        raise RuntimeError("KMA_API_KEY is missing")
    if "--public-only" in sys.argv:
        request_public_data_asos(api_key)
        return
    request(
        "hourly-awsh",
        "awsh.php",
        {"var": "TA", "tm": "202101010000", "stn": "0", "help": "0"},
        api_key,
    )
    request(
        "combined-daily",
        "sfc_aws_day.php",
        {
            "tm1": "20210101",
            "tm2": "20210102",
            "obs": "ta_max",
            "stn": "0",
            "disp": "1",
            "help": "0",
        },
        api_key,
    )
    if "--kma-only" not in sys.argv:
        request_public_data_asos(api_key)


if __name__ == "__main__":
    main()
