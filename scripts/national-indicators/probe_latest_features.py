"""Read historical connection evidence, without further vector downloads.

The small WFS probe preceded review of the official Open API terms.
Those terms restrict saving API results. Obtain analytical originals through
https://aid.mcee.go.kr/req/write.do; partial probes are not analysis input.
"""
import json
from pathlib import Path


def main():
    report = Path('D:/90_Data/LivingLabs/work/landcover-latest-api-20261001/feature-probe-report.json')
    records = json.loads(report.read_text(encoding='utf-8'))
    print(json.dumps({
        'networkRequestsMade': 0,
        'readyForAnalysis': False,
        'nextSource': 'https://aid.mcee.go.kr/req/write.do',
        'reason': 'API terms restrict saving results; obtain originals through the official source request process.',
        'historicalSamples': [
            {key: record.get(key) for key in ('referenceCell', 'numberMatched', 'numberReturned')}
            for record in records if 'referenceCell' in record
        ],
    }, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
