import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'public', 'data', 'climate', 'ic4-admin-projections.json');
const outputPath = path.join(root, 'riskmap-core-main', 'static', 'analysis-data', 'planning-optimization-lab', 'rcp-suwon.json');
const source = JSON.parse(await readFile(sourcePath, 'utf8'));
const regionCode = '41110';
const region = source.regions.find((item) => item.code === regionCode);

if (!region || !source.data?.[regionCode]) throw new Error(`RCP projection data for ${regionCode} was not found.`);

const output = {
  schemaVersion: 'planning-optimization-lab/v1',
  generatedAt: new Date().toISOString(),
  experimental: true,
  region,
  resolution: {
    planningUnit: '시군구',
    climateNative: '약 1km',
    spatialDecisionTarget: '30~100m',
    note: 'RCP 값은 시군구의 시간 경로와 미래 위험 증폭에만 사용하며 30~100m 공간값으로 간주하지 않습니다.',
  },
  scenarios: source.scenarios,
  periods: source.periods,
  metrics: source.metrics.filter((metric) => ['TA', 'HW33', 'TR25', 'WSDI', 'TXx', 'TNx'].includes(metric.code)),
  data: source.data[regionCode],
  currentSpatialLayers: [
    { id: 'lst100', label: '수원 지표면온도', resolution: '100m', role: '현재 고온 분포' },
    { id: 'resident100', label: '상주인구', resolution: '100m', role: '현재 노출' },
    { id: 'floating100', label: '유동인구', resolution: '100m', role: '현재 활동 노출' },
    { id: 'elderly100', label: '고령인구 비율', resolution: '100m', role: '민감도' },
    { id: 'children100', label: '유소년인구 비율', resolution: '100m', role: '민감도' },
    { id: 'shelter100', label: '무더위쉼터 접근성', resolution: '100m', role: '적응역량' },
    { id: 'green100', label: '녹지·자연자원 비율', resolution: '100m', role: '적응역량' },
  ],
  provenance: {
    sourceFolder: 'data/',
    model: 'AR5 IC4 HadGEM3-RA skorea gridsub',
    scenarios: 'RCP2.6 / RCP4.5 / RCP6.0 / RCP8.5',
    sourceGrid: '0.01° 격자(명목 약 1km)',
  },
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`written ${outputPath}`);
