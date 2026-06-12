export interface Sector {
  id: string;
  name: string;
}

export interface SubSector {
  id: string;
  sectorId: string;
  name: string;
  description: string;
}

export const sectors: Sector[] = [
  { id: 'S01', name: '국토' },
  { id: 'S02', name: '연안' },
  { id: 'S03', name: '물관리' },
  { id: 'S04', name: '생태계/산림' },
  { id: 'S05', name: '건강' },
  { id: 'S06', name: '산업 및 에너지' },
];

export const subSectors: SubSector[] = [
  { id: 'S01-01', sectorId: 'S01', name: '도시·주거', description: '도시공간, 주거지역, 건축물, 생활권 공간과 관련된 리스크' },
  { id: 'S01-02', sectorId: 'S01', name: '기반시설', description: '도로, 철도, 교량, 공공시설 등 기반시설 관련 리스크' },
  { id: 'S01-03', sectorId: 'S01', name: '토지이용', description: '개발지, 시가화지역, 토지이용 변화와 관련된 리스크' },

  { id: 'S02-01', sectorId: 'S02', name: '연안침수', description: '해수면 상승, 폭풍해일, 연안 저지대 침수 관련 리스크' },
  { id: 'S02-02', sectorId: 'S02', name: '연안침식', description: '해안선 후퇴, 해안 침식, 사빈 감소 관련 리스크' },
  { id: 'S02-03', sectorId: 'S02', name: '항만·어촌', description: '항만시설, 어촌지역, 연안 생활권 관련 리스크' },

  { id: 'S03-01', sectorId: 'S03', name: '치수', description: '홍수, 도시침수, 하천범람, 내수침수 등 물 피해 관련 리스크' },
  { id: 'S03-02', sectorId: 'S03', name: '이수', description: '가뭄, 물 부족, 용수공급, 수자원 확보 관련 리스크' },
  { id: 'S03-03', sectorId: 'S03', name: '수질', description: '수온 상승, 오염물질 확산, 수질 악화 관련 리스크' },

  { id: 'S04-01', sectorId: 'S04', name: '산림', description: '산림재해, 산림병해충, 산림생산성, 산림생태계 관련 리스크' },
  { id: 'S04-02', sectorId: 'S04', name: '생태계', description: '생물다양성, 서식지, 생태축, 생태계 교란 관련 리스크' },
  { id: 'S04-03', sectorId: 'S04', name: '농업생태', description: '농경지 주변 생태환경, 생물서식 기반 변화 관련 리스크' },

  { id: 'S05-01', sectorId: 'S05', name: '감염병', description: '수인성 매개질환, 곤충·설치류 매개질환 등 감염병 관련 리스크' },
  { id: 'S05-02', sectorId: 'S05', name: '건강질환', description: '폭염, 한파, 대기오염, 기상재해로 인한 건강 피해 관련 리스크' },
  { id: 'S05-03', sectorId: 'S05', name: '취약계층 건강', description: '고령자, 어린이, 야외근로자 등 취약계층 건강 관련 리스크' },

  { id: 'S06-01', sectorId: 'S06', name: '산업', description: '산업시설, 생산활동, 공급망, 사업장 운영 관련 리스크' },
  { id: 'S06-02', sectorId: 'S06', name: '에너지', description: '전력수요, 냉난방 수요, 에너지 공급 안정성 관련 리스크' },
  { id: 'S06-03', sectorId: 'S06', name: '관광·서비스', description: '관광, 여가, 지역서비스 산업 관련 리스크' },
];

export function getSubSectorsBySector(sectorId: string): SubSector[] {
  return subSectors.filter(sub => sub.sectorId === sectorId);
}

export function getSectorById(sectorId: string): Sector | undefined {
  return sectors.find(s => s.id === sectorId);
}

export function getSubSectorById(subSectorId: string): SubSector | undefined {
  return subSectors.find(s => s.id === subSectorId);
}
