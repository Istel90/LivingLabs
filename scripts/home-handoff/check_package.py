"""Verify a transferred package without extracting, installing or modifying the platform."""
import argparse
import hashlib
import json
import zipfile
from pathlib import Path


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(8 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package', type=Path, default=Path(__file__).resolve().parent)
    args = parser.parse_args()
    root = args.package.resolve()
    manifest = json.loads((root / 'package-manifest.json').read_text(encoding='utf8'))
    for item in manifest['files']:
        path = (root / item['path']).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            raise ValueError('Missing/unsafe path: ' + item['path'])
        if path.stat().st_size != item['bytes'] or digest(path) != item['sha256']:
            raise ValueError('Transfer mismatch: ' + item['path'])
    with zipfile.ZipFile(root / '01_company_source.zip') as z:
        expected = json.loads((root / 'code-manifest.json').read_text(encoding='utf8'))['files']
        expected = [item for item in expected if item['sha256'] is not None]
        if set(z.namelist()) != {item['path'] for item in expected}:
            raise ValueError('Source archive file set mismatch')
        for item in expected:
            if hashlib.sha256(z.read(item['path'])).hexdigest() != item['sha256']:
                raise ValueError('Source archive content mismatch: ' + item['path'])
    with zipfile.ZipFile(root / '02_landcover_2021_results.zip') as z:
        index = json.loads(z.read('landcover-2021-current/build-index.json'))
        if len(index['regions']) != 269 or index['readyForPlatform'] is not False:
            raise ValueError('Unexpected data admission/region count')
        for region in index['regions']:
            prefix = region['directory'] + '/'
            for name, value in region['outputSha256'].items():
                if hashlib.sha256(z.read(prefix + name)).hexdigest() != value:
                    raise ValueError('Regional hash mismatch: ' + prefix + name)
            if hashlib.sha256(z.read(prefix + 'region-report.json')).hexdigest() != region['reportSha256']:
                raise ValueError('Regional report mismatch')
            if hashlib.sha256(z.read(region['verificationFile'])).hexdigest() != region['verificationSha256']:
                raise ValueError('Regional verification mismatch')
        if z.testzip() is not None:
            raise ValueError('Invalid data ZIP CRC')
    print(json.dumps({'status': 'passed', 'packageFiles': len(manifest['files']),
                      'sourceFiles': len(expected), 'dataRegions': len(index['regions']),
                      'readyForPlatform': False, 'platformModified': False}, ensure_ascii=False))


if __name__ == '__main__':
    main()
