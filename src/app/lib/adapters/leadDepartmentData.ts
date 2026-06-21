import DOWNLOADS_SIGUNGU_BOUNDARIES from '../../../../shared/data/administrative-regions/boundaries/downloads-sigungu-boundaries.json?raw';

export interface LeadDepartmentScenario {
  id: string;
  name: string;
  sector: string;
  intervention: string;
  status: 'draft' | 'active' | 'completed';
  quantity: number;
  unit: string;
}

export interface LeadDepartmentIndicator {
  label: string;
  value: string;
  caption: string;
}

export interface LeadDepartmentRegion {
  code: string;
  name: string;
  sidoCode: string;
  sidoName: string;
  sggName: string;
  cdList: string[];
  center: [number, number];
  boundary: [number, number][];
  extentLabel: string;
}

export interface LeadDepartmentRegionOption {
  sidoCode: string;
  sidoName: string;
  sggCode: string;
  sggName: string;
  center: [number, number];
  boundary: [number, number][];
  cdList: string[];
}

export interface LeadDepartmentRisk {
  admCode: string;
  scope: 'national' | 'local';
  sector: string;
  riskCode: string;
  riskName: string;
}

export interface LeadDepartmentUrbanIndex {
  year: string;
  governance: number;
  adaptationEffect: number;
  satisfaction: number;
  total: number;
  sequence: string;
}

export interface LeadDepartmentSectorScore {
  year: string;
  scenario: string;
  scenarioUp: string;
  sector: string;
  kind: '거버넌스' | '적응효과' | '만족도';
  value: number;
  sequence: string;
}

export interface LeadDepartmentScenarioPlan {
  id: string;
  sector: string;
  business: string;
  tableName: string;
  scenario: string;
  scenarioUp: string;
  year: string;
  goal: number;
  count: number;
  lat: number;
  lng: number;
  status: 'saved' | 'pending';
}

export interface LeadDepartmentSnapshot {
  region: LeadDepartmentRegion;
  regions: LeadDepartmentRegionOption[];
  indicators: LeadDepartmentIndicator[];
  risks: LeadDepartmentRisk[];
  scenarios: LeadDepartmentScenario[];
  urbanIndex: LeadDepartmentUrbanIndex[];
  sectorScores: LeadDepartmentSectorScore[];
  scenarioPlans: LeadDepartmentScenarioPlan[];
  layers: {
    id: string;
    name: string;
    source: string;
    enabled: boolean;
  }[];
}

export interface LeadDepartmentGateway {
  getSnapshot(regionCode?: string): Promise<LeadDepartmentSnapshot>;
}

const DEFAULT_LEAD_REGION_CODE = '41110';

const fallbackRegions: LeadDepartmentRegionOption[] = [
  {
    sidoCode: '11',
    sidoName: '서울특별시',
    sggCode: '11230',
    sggName: '동대문구',
    center: [37.5744, 127.0396],
    boundary: [
      [37.6060, 127.0264],
      [37.6035, 127.0605],
      [37.5850, 127.0718],
      [37.5612, 127.0695],
      [37.5529, 127.0455],
      [37.5660, 127.0251],
      [37.5898, 127.0184],
    ],
    cdList: ['11230101', '11230102', '11230103', '11230104'],
  },
  {
    sidoCode: '11',
    sidoName: '서울특별시',
    sggCode: '11140',
    sggName: '중구',
    center: [37.5636, 126.9976],
    boundary: [
      [37.5748, 126.9662],
      [37.5813, 126.9906],
      [37.5710, 127.0224],
      [37.5525, 127.0210],
      [37.5405, 127.0028],
      [37.5468, 126.9760],
    ],
    cdList: ['11140101', '11140102', '11140103'],
  },
  {
    sidoCode: '28',
    sidoName: '인천광역시',
    sggCode: '28200',
    sggName: '남동구',
    center: [37.4473, 126.7315],
    boundary: [
      [37.4860, 126.6940],
      [37.4932, 126.7432],
      [37.4630, 126.7755],
      [37.4245, 126.7662],
      [37.4010, 126.7212],
      [37.4280, 126.6825],
    ],
    cdList: ['28200101', '28200102', '28200103'],
  },
  {
    sidoCode: '41',
    sidoName: '경기도',
    sggCode: '41115',
    sggName: '수원시 팔달구',
    center: [37.2826, 127.0201],
    boundary: [
      [37.3030, 127.0005],
      [37.3055, 127.0340],
      [37.2884, 127.0505],
      [37.2640, 127.0385],
      [37.2605, 127.0090],
      [37.2815, 126.9945],
    ],
    cdList: ['41115101', '41115102', '41115103'],
  },
  {
    sidoCode: '41',
    sidoName: '경기도',
    sggCode: '41117',
    sggName: '수원시 영통구',
    center: [37.2596, 127.0466],
    boundary: [
      [37.2915, 127.0395],
      [37.2910, 127.0815],
      [37.2585, 127.0940],
      [37.2335, 127.0700],
      [37.2305, 127.0290],
      [37.2595, 127.0185],
    ],
    cdList: ['41117101', '41117102', '41117103'],
  },
];

type BoundaryFeature = {
  type: 'Feature';
  properties?: {
    sig_cd?: string;
    sig_kor_nm?: string;
    full_nm?: string;
  };
  geometry?: {
    type: string;
    coordinates: unknown;
  };
};

const sidoNamesByCode: Record<string, string> = {
  '11': '서울특별시',
  '26': '부산광역시',
  '27': '대구광역시',
  '28': '인천광역시',
  '29': '광주광역시',
  '30': '대전광역시',
  '31': '울산광역시',
  '36': '세종특별자치시',
  '41': '경기도',
  '43': '충청북도',
  '44': '충청남도',
  '46': '전라남도',
  '47': '경상북도',
  '48': '경상남도',
  '50': '제주특별자치도',
  '51': '강원특별자치도',
  '52': '전북특별자치도',
};

const regions: LeadDepartmentRegionOption[] = createRegionsFromBoundaryData();

function createRegionsFromBoundaryData(): LeadDepartmentRegionOption[] {
  try {
    const parsed = JSON.parse(DOWNLOADS_SIGUNGU_BOUNDARIES);
    const featuresByCode = parsed?.featuresByCode ?? {};
    const generated = Object.entries(featuresByCode)
      .map(([code, feature]) => createRegionFromBoundaryFeature(code, feature as BoundaryFeature))
      .filter((region): region is LeadDepartmentRegionOption => Boolean(region));
    const aggregateCities = createAggregateCityRegions(generated);
    const regionOptions = [...generated, ...aggregateCities].sort(
      (a, b) => a.sidoCode.localeCompare(b.sidoCode) || a.sggCode.localeCompare(b.sggCode)
    );

    return regionOptions.length > 0 ? regionOptions : fallbackRegions;
  } catch {
    return fallbackRegions;
  }
}

function createRegionFromBoundaryFeature(code: string, feature: BoundaryFeature): LeadDepartmentRegionOption | null {
  const sidoCode = code.slice(0, 2);
  const sidoName = sidoNamesByCode[sidoCode];
  const sggName = feature.properties?.sig_kor_nm ?? feature.properties?.full_nm ?? code;
  const points = collectLonLatPoints(feature.geometry?.coordinates);

  if (!sidoName || points.length === 0) return null;

  const lons = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  const minLng = Math.min(...lons);
  const maxLng = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  return {
    sidoCode,
    sidoName,
    sggCode: code,
    sggName,
    center: [(minLat + maxLat) / 2, (minLng + maxLng) / 2],
    boundary: [
      [minLat, minLng],
      [maxLat, minLng],
      [maxLat, maxLng],
      [minLat, maxLng],
    ],
    cdList: [code],
  };
}

function createAggregateCityRegions(regions: LeadDepartmentRegionOption[]): LeadDepartmentRegionOption[] {
  const groups = new Map<string, LeadDepartmentRegionOption[]>();

  regions.forEach((region) => {
    const match = region.sggName.match(/^(.+시)\s+.+구$/);
    if (!match) return;
    const parentName = match[1];
    const key = `${region.sidoCode}:${parentName}`;
    groups.set(key, [...(groups.get(key) ?? []), region]);
  });

  return Array.from(groups.entries())
    .filter(([, children]) => children.length > 1)
    .map(([key, children]) => {
      const [sidoCode, parentName] = key.split(':');
      const sidoName = children[0]?.sidoName ?? sidoNamesByCode[sidoCode] ?? '';
      const childCodes = children.map((child) => child.sggCode).sort();
      const parentCode = `${childCodes[0].slice(0, 4)}0`;
      const bounds = children.flatMap((child) => child.boundary);
      const lats = bounds.map((point) => point[0]);
      const lngs = bounds.map((point) => point[1]);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);

      return {
        sidoCode,
        sidoName,
        sggCode: parentCode,
        sggName: parentName,
        center: [(minLat + maxLat) / 2, (minLng + maxLng) / 2] as [number, number],
        boundary: [
          [minLat, minLng],
          [maxLat, minLng],
          [maxLat, maxLng],
          [minLat, maxLng],
        ] as [number, number][],
        cdList: childCodes,
      };
    });
}

function collectLonLatPoints(value: unknown): number[][] {
  if (Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number') {
    return [[Number(value[0]), Number(value[1])]];
  }

  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => collectLonLatPoints(item));
}

const risks: LeadDepartmentRisk[] = [
  { admCode: '00000', scope: 'national', sector: '건강', riskCode: 'H-01', riskName: '폭염으로 인한 건강 취약계층 피해' },
  { admCode: '00000', scope: 'national', sector: '물관리', riskCode: 'W-01', riskName: '도심 침수 피해 증가' },
  { admCode: '00000', scope: 'national', sector: '건강', riskCode: 'H-02', riskName: '수인성 매개 질환 발생 증가' },
  { admCode: '00000', scope: 'national', sector: '생태계/산림', riskCode: 'E-01', riskName: '산림 병해충 발생 증가' },
  { admCode: '11230', scope: 'local', sector: '건강', riskCode: 'DDM-H-01', riskName: '노후 주거지 폭염 노출 증가' },
  { admCode: '11230', scope: 'local', sector: '건강', riskCode: 'DDM-H-02', riskName: '전통시장·버스정류장 보행열 노출' },
  { admCode: '11230', scope: 'local', sector: '물관리', riskCode: 'DDM-W-01', riskName: '저지대 생활권 국지성 침수' },
  { admCode: '11140', scope: 'local', sector: '건강', riskCode: 'J-H-01', riskName: '업무·상업지역 보행열 노출' },
  { admCode: '28200', scope: 'local', sector: '물관리', riskCode: 'ND-W-01', riskName: '하천변 저지대 침수 위험' },
  { admCode: '41115', scope: 'local', sector: '건강', riskCode: 'PD-H-01', riskName: '도심 열섬과 고령층 노출 중첩' },
  { admCode: '41117', scope: 'local', sector: '건강', riskCode: 'YT-H-01', riskName: '대규모 보행축 폭염 체감 증가' },
];

const scenarios: LeadDepartmentScenario[] = [
  {
    id: 'sc-1',
    name: '폭염 취약 보행축 그늘 조성',
    sector: '건강',
    intervention: '가로수',
    status: 'active',
    quantity: 120,
    unit: '주',
  },
  {
    id: 'sc-2',
    name: '대중교통 결절점 그늘막 설치',
    sector: '건강',
    intervention: '그늘막',
    status: 'draft',
    quantity: 35,
    unit: '개소',
  },
  {
    id: 'sc-3',
    name: '침수 취약 생활권 배수로 정비',
    sector: '물관리',
    intervention: '배수시설',
    status: 'draft',
    quantity: 4,
    unit: '개소',
  },
];

const urbanIndex: LeadDepartmentUrbanIndex[] = [
  { year: '2026', governance: 3.1, adaptationEffect: 2.8, satisfaction: 2.9, total: 2.9, sequence: '1단계' },
  { year: '2027', governance: 3.4, adaptationEffect: 3.0, satisfaction: 3.1, total: 3.2, sequence: '1단계' },
  { year: '2028', governance: 3.6, adaptationEffect: 3.5, satisfaction: 3.3, total: 3.5, sequence: '2단계' },
  { year: '2029', governance: 3.9, adaptationEffect: 3.8, satisfaction: 3.6, total: 3.8, sequence: '2단계' },
  { year: '2030', governance: 4.2, adaptationEffect: 4.1, satisfaction: 3.9, total: 4.1, sequence: '3단계' },
];

const scenarioUps = ['2026년도 증가', '2027년도 증가', '2028년도 증가', '2029년도 증가', '2030년도 증가'];

const sectorScores: LeadDepartmentSectorScore[] = scenarioUps.flatMap((scenarioUp, scenarioIndex) => {
  const base = 2.4 + scenarioIndex * 0.22;
  return urbanIndex.flatMap((row, yearIndex) => [
    {
      year: row.year,
      scenario: '기준연도',
      scenarioUp,
      sector: '건강',
      kind: '거버넌스' as const,
      value: Math.min(5, Number((base + yearIndex * 0.18).toFixed(1))),
      sequence: row.sequence,
    },
    {
      year: row.year,
      scenario: '기준연도',
      scenarioUp,
      sector: '건강',
      kind: '적응효과' as const,
      value: Math.min(5, Number((base + 0.25 + yearIndex * 0.22).toFixed(1))),
      sequence: row.sequence,
    },
    {
      year: row.year,
      scenario: '기준연도',
      scenarioUp,
      sector: '건강',
      kind: '만족도' as const,
      value: Math.min(5, Number((base - 0.1 + yearIndex * 0.16).toFixed(1))),
      sequence: row.sequence,
    },
  ]);
});

const scenarioPlans: LeadDepartmentScenarioPlan[] = [
  {
    id: 'plan-tree-1',
    sector: '건강',
    business: '가로수',
    tableName: 'poi_street_tree',
    scenario: '기준연도',
    scenarioUp: '2026년도 증가',
    year: '2026',
    goal: 100,
    count: 18,
    lat: 37.5744,
    lng: 127.0396,
    status: 'saved',
  },
  {
    id: 'plan-tree-2',
    sector: '건강',
    business: '가로수',
    tableName: 'poi_street_tree',
    scenario: '기준연도',
    scenarioUp: '2027년도 증가',
    year: '2027',
    goal: 120,
    count: 24,
    lat: 37.5843,
    lng: 127.0491,
    status: 'saved',
  },
  {
    id: 'plan-shade-1',
    sector: '건강',
    business: '그늘막',
    tableName: 'poi_shadeinfra',
    scenario: '기준연도',
    scenarioUp: '2026년도 증가',
    year: '2026',
    goal: 35,
    count: 7,
    lat: 37.5902,
    lng: 127.0586,
    status: 'saved',
  },
];

const layers = [
  { id: 'admin-boundary', name: '행정경계', source: 'VWorld WMS · lt_c_adsido/lt_c_adsigg', enabled: true },
];

function getRegion(regionCode = DEFAULT_LEAD_REGION_CODE): LeadDepartmentRegion {
  const region = regions.find((item) => item.sggCode === regionCode) ?? regions[0];
  return {
    code: region.sggCode,
    name: `${region.sidoName} ${region.sggName}`,
    sidoCode: region.sidoCode,
    sidoName: region.sidoName,
    sggName: region.sggName,
    cdList: region.cdList,
    center: region.center,
    boundary: region.boundary,
    extentLabel: '시군구 행정경계 기준',
  };
}

function createIndicators(regionCode = DEFAULT_LEAD_REGION_CODE): LeadDepartmentIndicator[] {
  const localRiskCount = risks.filter((risk) => risk.admCode === regionCode).length;
  const planCount = scenarioPlans.length;
  const savedCount = scenarioPlans.filter((plan) => plan.status === 'saved').length;

  return [
    { label: '지역 리스크', value: `${localRiskCount || 3}개`, caption: '지역 적응대책 우선 검토' },
    { label: '계획 사업 수', value: `${planCount}개`, caption: '가로수, 그늘막, 배수시설 등' },
    { label: '우선관리 후보지', value: '14곳', caption: '공간지표와 현장수요 결합' },
    { label: '이행 평가율', value: `${Math.round((savedCount / Math.max(planCount, 1)) * 100)}%`, caption: '사업소관부서 입력 기준' },
  ];
}

const mockGateway: LeadDepartmentGateway = {
  async getSnapshot(regionCode = DEFAULT_LEAD_REGION_CODE) {
    return {
      region: getRegion(regionCode),
      regions,
      indicators: createIndicators(regionCode),
      risks,
      scenarios,
      urbanIndex,
      sectorScores,
      scenarioPlans,
      layers,
    };
  },
};

export function getLeadDepartmentGateway(): LeadDepartmentGateway {
  // Future switches:
  // - VITE_LEAD_DEPARTMENT_BACKEND=supabase
  // - VITE_LEAD_DEPARTMENT_BACKEND=java
  // The page consumes only this gateway, so backend replacement stays isolated here.
  return mockGateway;
}
