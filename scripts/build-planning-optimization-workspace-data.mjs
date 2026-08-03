import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = JSON.parse(await readFile(path.join(root, 'public/data/climate/ic4-admin-projections.json'), 'utf8'));
const keepMetrics = new Set(['TA', 'HW33', 'TR25', 'WSDI', 'TXx', 'TNx']);
const output = {
  schemaVersion: 'planning-optimization-workspace/v1',
  sourceMeta: source.meta,
  generatedAt: new Date().toISOString(),
  defaultRegionCode: '41110',
  regions: source.regions,
  scenarios: source.scenarios,
  periods: source.periods,
  metrics: source.metrics.filter((metric) => keepMetrics.has(metric.code)),
  data: source.data,
  resolution: {
    planningUnit: '시군구',
    spatialDecision: '30~100m',
    rcpNative: '약 1km',
    rule: 'RCP는 시간경로와 미래 증폭에 사용하고 공간 최적화에는 30~100m 현황자료만 사용합니다.',
  },
  spatialLayers: [
    { id: 'lst', name: '지표면온도', resolution: '100m', dimension: '위험', coverage: '수원 실증', source: '수원 LST', quality: '30m 실측가공' },
    { id: 'resident', name: '상주인구', resolution: '100m', dimension: '노출', coverage: '수원 실증', source: '국토통계 B100', quality: '공식격자' },
    { id: 'floating', name: '유동인구', resolution: '100m', dimension: '노출', coverage: '수원 실증', source: '근무인구·통근 자료', quality: '대리변수' },
    { id: 'daytime', name: '주간활동 노출', resolution: '100m', dimension: '노출', coverage: '수원 실증', source: '근무인구·통근유입', quality: '대리변수' },
    { id: 'workplace', name: '사업체 종사자', resolution: '100m', dimension: '노출', coverage: '수원 실증', source: '국토공간거점지도', quality: '대리변수' },
    { id: 'commute', name: '통근유입 중심성', resolution: '100m', dimension: '노출', coverage: '수원 실증', source: '통근 중심성', quality: '대리변수' },
    { id: 'elderly', name: '고령인구 비율', resolution: '100m', dimension: '민감도', coverage: '수원 실증', source: '국토통계 B100', quality: '공식격자' },
    { id: 'children', name: '유소년인구 비율', resolution: '100m', dimension: '민감도', coverage: '수원 실증', source: '국토통계 B100', quality: '공식격자' },
    { id: 'single', name: '1인가구 비율', resolution: '100m', dimension: '민감도', coverage: '수원 실증', source: '행정동 통계', quality: '100m 할당' },
    { id: 'health', name: '건강취약 인구 proxy', resolution: '100m', dimension: '민감도', coverage: '수원 실증', source: '순환기·호흡기 진료', quality: '구별 proxy' },
    { id: 'lowincome', name: '저소득층 비율 proxy', resolution: '100m', dimension: '민감도', coverage: '수원 실증', source: '수급자·인구 통계', quality: '행정동 proxy' },
    { id: 'oldhousing', name: '노후주택 면적비', resolution: '100m', dimension: '민감도', coverage: '수원 실증', source: '건축물 footprint', quality: '30년 이상' },
    { id: 'oldbuilding', name: '노후건축물 면적비', resolution: '100m', dimension: '민감도', coverage: '수원 실증', source: '건축물 footprint', quality: '30년 이상' },
    { id: 'shelter', name: '무더위쉼터 거리', resolution: '100m', dimension: '적응역량', coverage: '수원 실증', source: '재난안전데이터', quality: '최근접거리' },
    { id: 'shelterAccess', name: '무더위쉼터 접근성', resolution: '100m', dimension: '적응역량', coverage: '수원 실증', source: '재난안전데이터', quality: '접근성지수' },
    { id: 'green', name: '녹지·자연자원 비율', resolution: '100m', dimension: '적응역량', coverage: '수원 실증', source: '세분류 토지피복도', quality: '면적비율' },
  ],
};
const target = path.join(root, 'riskmap-core-main/static/analysis-data/planning-optimization-lab/rcp-regions.json');
await mkdir(path.dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(output)}\n`, 'utf8');
console.log(`written ${target}`);
