"""Small read-only capability probe; never treat rendered maps as analytical data."""
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import xml.etree.ElementTree as ET

import requests

OUTPUT = Path('D:/90_Data/LivingLabs/work/landcover-latest-api-20261001')
OUTPUT.mkdir(parents=True, exist_ok=True)
BASE = 'https://api.mcee.go.kr/geoserver'
session = requests.Session()
session.headers['User-Agent'] = 'LivingLabs-landcover-validation/1.0'
sources = {
    'official-land-api': 'https://aid.mcee.go.kr/api/land.do',
    'official-map': 'https://aid.mcee.go.kr/map/map.do',
    'official-request-guide': 'https://aid.mcee.go.kr/req/intro.do',
    'wms-capabilities': BASE + '/wms?service=WMS&request=GetCapabilities&version=1.3.0',
    'wfs-capabilities': BASE + '/ows?service=WFS&request=GetCapabilities&version=2.0.0',
    'wcs-capabilities': BASE + '/ows?service=WCS&request=GetCapabilities&version=2.0.1',
}
results = []
for name, url in sources.items():
    result = {'name': name, 'url': url, 'checkedAt': datetime.now(timezone.utc).isoformat()}
    try:
        response = session.get(url, timeout=(10, 30))
        data = response.content
        suffix = '.html' if name.startswith('official-') else '.xml'
        (OUTPUT / (name + suffix)).write_bytes(data)
        result.update(status=response.status_code, finalUrl=response.url, contentType=response.headers.get('content-type'),
                      bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
        if not name.startswith('official-'):
            try:
                root = ET.fromstring(data)
                result['root'] = root.tag
                result['exceptions'] = [node.text for node in root.iter() if node.tag.split('}')[-1] in ('ExceptionText','ServiceException')]
                entries = []
                for node in root.iter():
                    if node.tag.split('}')[-1] not in ('Layer', 'FeatureType', 'CoverageSummary'):
                        continue
                    entry = {child.tag.split('}')[-1]:child.text for child in node
                             if child.tag.split('}')[-1] in ('Name','Title','CoverageId','Identifier')}
                    if any(term in str(entry).lower() for term in ('lv3','lv2','landcover','토지피복','impermeable')):
                        entries.append(entry)
                result['landcoverEntries'] = entries
            except ET.ParseError:
                result['xmlParsed'] = False
                result['bodyPreview'] = response.text[:160]
    except requests.RequestException as error:
        result['error'] = str(error)
    results.append(result)
    (OUTPUT / 'capability-report.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps(result, ensure_ascii=False), flush=True)
