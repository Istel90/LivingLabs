"""Create a new, portable handoff directory; preserve all existing code and data."""
import argparse
import collections
import hashlib
import json
import re
import shutil
import subprocess
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from compare_home import comparison_digest

REPO = Path(__file__).resolve().parents[2]
WORK = Path('D:/90_Data/LivingLabs/work/national-indicators-20261001')
API = Path('D:/90_Data/LivingLabs/work/landcover-latest-api-20261001')


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(8 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf8')


def git(*args):
    return subprocess.check_output(['git', '-C', str(REPO), *args])


def code_archive(output):
    base = git('rev-parse', 'HEAD').decode().strip()
    tracked = set(filter(None, git('ls-files', '-z').decode().split('\0')))
    files = set(filter(None, git('ls-files', '-z', '--cached', '--others', '--exclude-standard').decode().split('\0')))
    records = []
    excluded = []
    token_pattern = re.compile(rb'(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|AKIA[A-Z0-9]{16})')
    with zipfile.ZipFile(output / '01_company_source.zip', 'w', zipfile.ZIP_DEFLATED, compresslevel=3) as z:
        for relative in sorted(files):
            path = REPO / relative
            parts = Path(relative).parts
            # Exclude an old tracked binary backup, not a runtime source.
            if relative == 'riskmap-core-main.zip':
                excluded.append({'path': relative, 'reason': 'Legacy binary backup, not active platform source'})
                continue
            if any(p in {'.runtime-secrets', '.runtime-logs', '.env', '.env.local', 'node_modules', '__pycache__'} for p in parts):
                raise ValueError('Unexpected private/generated tracked file: ' + relative)
            old = git('show', base + ':' + relative) if relative in tracked else None
            data = path.read_bytes() if path.is_file() else None
            if data is not None:
                if token_pattern.search(data):
                    raise ValueError('Credential-like literal needs review: ' + relative)
                z.writestr(relative, data)
            sha = hashlib.sha256(data).hexdigest() if data is not None else None
            old_sha = hashlib.sha256(old).hexdigest() if old is not None else None
            compare_sha = comparison_digest(path, data)
            base_compare_sha = comparison_digest(path, old)
            records.append({'path': relative, 'sha256': sha, 'baseSha256': old_sha,
                            'compareSha256': compare_sha, 'baseCompareSha256': base_compare_sha,
                            'bytes': len(data) if data is not None else 0,
                            'companyChangedFromBase': compare_sha != base_compare_sha})
    # Detect another task changing source during packaging rather than silently mixing versions.
    for item in records:
        path = REPO / item['path']
        if (digest(path) if path.is_file() else None) != item['sha256']:
            raise ValueError('Source changed during packaging: ' + item['path'])
    (output / 'company-tracked-changes.patch').write_bytes(git('diff', '--binary', 'HEAD'))
    write_json(output / 'code-manifest.json', {'baseCommit': base, 'branch': git('branch', '--show-current').decode().strip(),
                                              'containsUncommittedWork': True, 'excluded': excluded, 'files': records})
    return {'files': len(records), 'changedFiles': sum(x['companyChangedFromBase'] for x in records), 'baseCommit': base}


def data_archive(output):
    original = json.loads((WORK / 'landcover-2021-national-current/build-index.json').read_text(encoding='utf8'))
    current = json.loads(json.dumps(original))
    current['schemaVersion'] = 'livinglabs-portable-regional-index/v1'
    current['pathBase'] = 'archive_extraction_root'
    current['portableCreatedAt'] = datetime.now(timezone.utc).isoformat()
    with zipfile.ZipFile(output / '02_landcover_2021_results.zip', 'w', zipfile.ZIP_DEFLATED, compresslevel=3) as z:
        z.write(WORK / 'landcover-2021-national-current/build-index.json', 'provenance/company-build-index.json')
        for position, region in enumerate(current['regions']):
            directory = Path(region['directory'])
            prefix = 'landcover-2021-current/' + region['regionCode']
            expected = {**region['outputSha256'], 'region-report.json': region['reportSha256']}
            for name, expected_sha in expected.items():
                path = directory / name
                if digest(path) != expected_sha:
                    raise ValueError('Regional artifact changed: ' + str(path))
                z.write(path, prefix + '/' + name)
            verify = directory.parent / ('verification-' + region['regionCode'] + '.json')
            if digest(verify) != region['verificationSha256']:
                raise ValueError('Verification artifact changed')
            verification_name = 'landcover-2021-current/verification-' + region['regionCode'] + '.json'
            z.write(verify, verification_name)
            region['companyOriginalDirectory'] = region['directory']
            region['directory'] = prefix
            region['verificationFile'] = verification_name
            if (position + 1) % 50 == 0:
                print(json.dumps({'stage': 'data_archive', 'regions': position + 1, 'total': 269}), flush=True)
        for build in current['builds']:
            directory = Path(build['directory'])
            build['companyOriginalDirectory'] = build['directory']
            prefix = 'provenance/' + directory.name
            for name in ('build-manifest.json', 'build-progress.json', 'process-status.json', 'grid-validation.json'):
                if (directory / name).is_file():
                    z.write(directory / name, prefix + '/' + name)
            build['directory'] = prefix
        for p in sorted((WORK / 'reference-current-national').iterdir()):
            if p.is_file():
                z.write(p, 'reference-current-national/' + p.name)
        # A single canonical reference replaces 269 duplicated per-build reference files.
        z.writestr('landcover-2021-current/build-index.json', json.dumps(current, ensure_ascii=False, indent=2))
    return {'regions': len(current['regions']), 'targetCells': current['targetCells'],
            'validCells': current['validCells'], 'readyForPlatform': current['readyForPlatform']}


def evidence_archive(output):
    with zipfile.ZipFile(output / '03_evidence.zip', 'w', zipfile.ZIP_DEFLATED, compresslevel=3) as z:
        docs = ['NATIONAL_INDICATORS_2026-10-01.md', 'PRIORITY_SERVER_PRACTICE_AREAS.md',
                'PRIORITY_COMMON_REPOSITORIES.md', 'PRIORITY_PARCEL_REFERENCES.md',
                'VWORLD_CADASTRE_POSTGIS.md', 'CANOPY_DOWNLOAD_PROGRESS.md']
        for name in docs:
            z.write(REPO / 'docs' / name, 'docs/' + name)
        for name in ('haenam-source-diagnosis.json', 'haenam-original-traceback.txt', 'conversion-tests.log',
                     'tile-validation-comparison.json', 'import-verification.json'):
            z.write(WORK / name, 'landcover-validation/' + name)
        for name in ('verification-46820.json', 'spatial-verification-46820.json'):
            z.write(WORK / 'landcover-2021-haenam-v3' / name, 'landcover-validation/' + name)
        # Only findings; never include captured WFS feature geometry or login pages.
        for name in ('acquisition-status.json', 'terms-user-file-verification.json', 'user-supplied-openapi-terms.txt'):
            z.write(API / name, 'latest-landcover/' + name)
        for relative in ('output/practice-area-server-20261001/browser-network/report.json',
                         'output/practice-area-server-20261001/browser/live-legacy-parity.json',
                         'output/platform-audit/2026-10-01T02-49-43-486Z/report.json'):
            path = REPO / relative
            if path.is_file():
                z.write(path, relative)
        queue = json.loads((REPO / '.runtime-logs/canopy-queue.json').read_text(encoding='utf8'))
        stages = {name: dict(collections.Counter(item.get('status', 'unknown') for item in items))
                  for name, items in queue['stages'].items()}
        state = {'observedAt': datetime.now(timezone.utc).isoformat(), 'queueUpdatedAt': queue.get('updated'),
                 'source': queue['source'], 'stages': stages, 'qaApprovedStages': queue.get('qaApprovedStages'),
                 'note': 'Read-only checkpoint. No jobs moved or duplicated. Home must reconcile with company before submitting more GEE jobs.',
                 'rawRastersIncluded': False, 'gk2aDownloadIncluded': False}
        z.writestr('background-data-summary.json', json.dumps(state, ensure_ascii=False, indent=2))
        z.write(WORK / 'national-indicators-20260930/company-handoff/회사컴퓨터_이어하기.txt',
                'previous-home-handoff/회사컴퓨터_이어하기.txt')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    started = time.monotonic()
    readme = (REPO / 'docs/HOME_HANDOFF_2026-10-01.md').read_text(encoding='utf8')
    (args.output / '00_먼저읽기_집에서이어하기.txt').write_text(readme, encoding='utf-8-sig')
    for name in ('compare_home.py', 'check_package.py'):
        shutil.copy2(Path(__file__).with_name(name), args.output / name)
    prompt = '''LivingLabs 집 작업을 이어가 주세요. 저는 집과 회사의 다른 로컬 채팅에서 작업해 왔고 회사의 최신 추가 결과를 Dropbox로 가져왔습니다.
이 인계 폴더의 00_먼저읽기_집에서이어하기.txt를 먼저 읽고 check_package.py로 파일 무결성을 확인하세요.
집 저장소(E:/40_LocalPython/LivingLabs일 가능성이 있으나 실제 경로 확인)의 기존 수정·커밋·데이터와 이 채팅에서 했던 작업을 먼저 확인·보존하세요.
회사 소스는 기준 커밋 6142d4631f0e59f43bfb557b8cd9ca199ddf2135 + 미커밋 작업의 스냅샷입니다. compare_home.py로 파일별 차이를 확인하고, 별도 비교 폴더에서 회사 코드와 집 변경을 3방향으로 비교해 필요한 부분을 병합하세요. 전체 덮어쓰기나 hard reset은 하지 마세요.
회사 추가분은 실천권역 계산의 서버 분리(개발 검증 완료/공개 미배포)와 2021년 토지피복 불투수면·산림초지 구성분 269지역 구축 및 해남 재처리입니다.
결과는 원시 0~100%이고 플랫폼 탑재 전입니다. 기존 집 DB 전체를 교체하지 말고 회사 기준 격자와 집 격자를 비교하세요.
기존 9/30 자료 묶음은 Dropbox/99_DATA/회사전달/2026-09-30_전국4개지표에서 그대로 재사용합니다.
미완료: 공식 2025년 세분류 원본 확보(2024 기준), 실제 조성 공원 및 보행전용도로 경계, 건축물 신구 PK·도형 연결과 주거 판정, 플랫폼 데이터 등록·정규화·검증.
환경공간정보 API 저장 제한 확인으로 전국 API 수집은 시작하지 않았습니다. 공식 자료신청 원본 경로를 사용하고 로그인은 집에서 새로 진행합니다.
검증 기준 화면은 http://127.0.0.1:4173/internal-tools/priority-management-area/flood?regionCode=41110 입니다. 회사 PC의 공개 서비스·터널·기존 하루 한 번 자동점검·수관높이/GK2A 수집 작업은 이 인계로 변경하거나 집에서 중복 실행하지 마세요.
코드와 데이터의 현재 상태를 비교한 뒤 이어 할 우선순위를 짧게 정리하고, 이미 승인된 범위의 작업을 계속해 주세요.
'''
    (args.output / '04_집채팅에붙여넣기.txt').write_text(prompt, encoding='utf-8-sig')
    source = code_archive(args.output)
    print(json.dumps({'stage': 'source_complete', **source}), flush=True)
    data = data_archive(args.output)
    evidence_archive(args.output)
    files = [{'path': p.name, 'bytes': p.stat().st_size, 'sha256': digest(p)}
             for p in sorted(args.output.iterdir()) if p.is_file()]
    manifest = {'schemaVersion': 'livinglabs-home-handoff/v1', 'createdAt': datetime.now(timezone.utc).isoformat(),
                'source': source, 'data': data, 'files': files,
                'homeChangesMerged': False, 'productionDeployed': False, 'credentialsIncluded': False,
                'dropboxDestination': '/99_DATA/집전달/2026-10-01_LivingLabs_이어가기',
                'priorData': {'dropboxPath': '/99_DATA/회사전달/2026-09-30_전국4개지표/national-indicators-company-handoff-20260930.zip',
                              'bytes': 674507483, 'sha256': '973f30857dc37d926b8a0074ad941a9491f55322aeb356c0836c653fca93d5cf'}}
    write_json(args.output / 'package-manifest.json', manifest)
    print(json.dumps({'stage': 'complete', 'bytes': sum(p.stat().st_size for p in args.output.iterdir()),
                      'seconds': round(time.monotonic() - started, 1), 'output': str(args.output)}), flush=True)


if __name__ == '__main__':
    main()
