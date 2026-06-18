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
  center: [number, number];
  extentLabel: string;
}

export interface LeadDepartmentSnapshot {
  region: LeadDepartmentRegion;
  indicators: LeadDepartmentIndicator[];
  scenarios: LeadDepartmentScenario[];
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

const mockSnapshot: LeadDepartmentSnapshot = {
  region: {
    code: '11230',
    name: '서울특별시 동대문구',
    center: [37.5744, 127.0396],
    extentLabel: '시군구 행정경계 기준',
  },
  indicators: [
    { label: '도시 취약성 지수', value: '72.4', caption: '건강·폭염 리스크 우선 검토' },
    { label: '계획 사업 수', value: '8개', caption: '가로수, 그늘막, 쉼터 등' },
    { label: '우선관리 후보지', value: '14곳', caption: '공간지표와 현장수요 결합' },
    { label: '이행 점검률', value: '42%', caption: '사업소관부서 입력 기준' },
  ],
  scenarios: [
    { id: 'sc-1', name: '폭염 취약 보행축 녹음 조성', sector: '건강', intervention: '가로수', status: 'active', quantity: 120, unit: '주' },
    { id: 'sc-2', name: '대중교통 결절점 그늘막 설치', sector: '건강', intervention: '그늘막', status: 'draft', quantity: 35, unit: '개소' },
    { id: 'sc-3', name: '침수 취약 생활권 우수저류 검토', sector: '물관리', intervention: '저류시설', status: 'draft', quantity: 4, unit: '개소' },
  ],
  layers: [
    { id: 'admin-boundary', name: '행정경계', source: 'shared/administrative-regions', enabled: true },
    { id: 'risk-index', name: '지역 리스크 지수', source: 'PostGIS/GeoServer 대체 예정', enabled: true },
    { id: 'scenario-poi', name: '적응사업 후보지', source: '시나리오 사업 배치 데이터', enabled: true },
    { id: 'vulnerable-population', name: '취약계층 분포', source: '통계/격자 데이터 연계 예정', enabled: false },
  ],
};

export const localLeadDepartmentGateway: LeadDepartmentGateway = {
  async getSnapshot() {
    return mockSnapshot;
  },
};

export function getLeadDepartmentGateway(): LeadDepartmentGateway {
  // Future switches:
  // - VITE_LEAD_DEPARTMENT_BACKEND=supabase
  // - VITE_LEAD_DEPARTMENT_BACKEND=java
  // The page consumes only this gateway, so backend replacement stays isolated here.
  return localLeadDepartmentGateway;
}
