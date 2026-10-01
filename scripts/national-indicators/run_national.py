"""One-shot data build supervisor: retains completion/failure after the console is closed."""
import json
import os
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

import build_landcover


def main():
    if '--output' not in sys.argv:
        raise ValueError('--output required')
    output = Path(sys.argv[sys.argv.index('--output') + 1])
    output.mkdir(parents=True, exist_ok=True)
    status_path = output / 'process-status.json'
    status = {'pid': os.getpid(), 'startedAt': datetime.now(timezone.utc).isoformat(), 'status': 'running',
              'oneShot': True, 'scheduledTaskCreated': False, 'platformModified': False}
    build_landcover.write_json(status_path, status)
    try:
        code = build_landcover.main()
        status.update(status='complete' if code == 0 else 'complete_with_failures', exitCode=code)
    except Exception as error:
        traceback.print_exc()
        status.update(status='failed', exitCode=1, errorType=type(error).__name__, error=str(error))
    status['finishedAt'] = datetime.now(timezone.utc).isoformat()
    build_landcover.write_json(status_path, status)
    print(json.dumps(status, ensure_ascii=False), flush=True)
    return status['exitCode']


if __name__ == '__main__':
    raise SystemExit(main())
