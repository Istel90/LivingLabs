"""Index successful regional builds without overwriting their files or provenance."""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from build_landcover import digest, write_json


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def assemble(base, recovery, destination):
    base, recovery = base.resolve(), recovery.resolve()
    prior = read_json(base / 'build-progress.json')
    recovered = read_json(recovery / 'build-progress.json')
    if recovered['status'] != 'complete' or recovered['failedRegions']:
        raise ValueError('Recovery build has not completed successfully')
    manifests = {directory: read_json(directory / 'build-manifest.json') for directory in (base, recovery)}
    for key in ('classes', 'source', 'sourceYear', 'reference', 'metadata'):
        if manifests[base]['identity'][key] != manifests[recovery]['identity'][key]:
            raise ValueError('Recovery changed the source/reference contract: ' + key)
    failed = {row['regionCode'] for row in prior['failures']}
    recovered_codes = {row['regionCode'] for row in recovered['regions']}
    if failed != recovered_codes:
        raise ValueError('Recovery must cover exactly the failed regions in this index')
    locations = {row['regionCode']: base for row in prior['regions']}
    if set(locations) & recovered_codes:
        raise ValueError('Recovery must not overwrite a successful region')
    locations.update({code: recovery for code in recovered_codes})
    expected = read_json(base / 'grid-validation.json')
    expected_cells = {row['regionCode']: row['cells'] for row in expected['details']}
    if set(locations) != set(expected_cells):
        raise ValueError('National region set is incomplete')
    entries, statuses = [], {}
    for code, directory in sorted(locations.items()):
        region_dir = directory / code
        report_path = region_dir / 'region-report.json'
        report = read_json(report_path)
        verification_path = directory / ('verification-' + code + '.json')
        verification = read_json(verification_path)
        if (report['runKey'] != manifests[directory]['runKey'] or report['regionCode'] != code or
                report['targetCells'] != expected_cells[code] or verification['status'] != 'passed' or
                verification['regionCode'] != code):
            raise ValueError('Region provenance or verification mismatch: ' + code)
        required = {indicator + extension for indicator in ('impervious-area-ratio', 'forest-grass-area-component')
                    for extension in ('.json', '.csv.gz', '.tif')}
        required.update({'cell-quality.csv.gz', 'geometry-repairs.json'})
        if not required.issubset(report['outputSha256']):
            raise ValueError('Missing expected output formats: ' + code)
        for name, expected_hash in report['outputSha256'].items():
            if Path(name).name != name or digest(region_dir / name) != expected_hash:
                raise ValueError('Output changed or unsafe filename: ' + code + '/' + name)
        for status, count in report['cellStatus'].items():
            statuses[status] = statuses.get(status, 0) + count
        entries.append({'regionCode': code, 'directory': str(region_dir), 'runKey': report['runKey'],
                        'targetCells': report['targetCells'], 'cellStatus': report['cellStatus'],
                        'reportSha256': digest(report_path), 'verificationSha256': digest(verification_path),
                        'outputSha256': report['outputSha256']})
        if len(entries) % 50 == 0:
            print(json.dumps({'verifiedRegions': len(entries), 'totalRegions': len(locations)}), flush=True)
    target_cells = sum(entry['targetCells'] for entry in entries)
    if target_cells != expected['cells'] or sum(statuses.values()) != target_cells:
        raise ValueError('National cell totals do not match the reference')
    result = {'schemaVersion': 'livinglabs-preintegration-regional-index/v1', 'status': 'complete',
              'createdAt': datetime.now(timezone.utc).isoformat(), 'sourceYear': manifests[base]['identity']['sourceYear'],
              'completedRegions': len(entries), 'failedRegions': 0, 'targetCells': target_cells,
              'validCells': statuses.get('valid', 0), 'cellStatus': statuses,
              'gridCountsIncludeCityDistrictOverlap': True, 'readyForPlatform': False, 'platformModified': False,
              'greenIndicatorIsForestGrassComponentOnly': True,
              'verification': 'Existing CSV/JSON/TIF checks passed; all regional output hashes rechecked during assembly',
              'builds': [{'directory': str(directory), 'manifest': manifests[directory],
                         'manifestSha256': digest(directory / 'build-manifest.json')} for directory in (base, recovery)],
              'regions': entries}
    destination.mkdir(parents=True, exist_ok=True)
    output = destination / 'build-index.json'
    if output.exists():
        raise ValueError('Index already exists; preserve prior release and select a new destination')
    write_json(output, result)
    return {key: result[key] for key in ('status', 'completedRegions', 'failedRegions', 'targetCells', 'validCells', 'cellStatus')}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', type=Path, required=True)
    parser.add_argument('--recovery', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(assemble(args.base, args.recovery, args.output), ensure_ascii=False), flush=True)
