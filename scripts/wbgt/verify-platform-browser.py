"""Canonical regression entry point; uses the current shared production screens."""

import subprocess
import sys
from pathlib import Path

script = Path(__file__).with_name("verify-national-platform.py")
if len(sys.argv) > 1:
    raise SystemExit(subprocess.call([sys.executable, str(script), *sys.argv[1:]]))
for args in [
    [
        "--regions",
        "41110,11680",
        "--hazards",
        "flood,heatwave",
        "--name",
        "canonical-default",
    ],
    [
        "--regions",
        "41110,11680",
        "--hazards",
        "heatwave",
        "--wbgt",
        "--name",
        "canonical-wbgt",
    ],
]:
    subprocess.run([sys.executable, str(script), *args], check=True)
