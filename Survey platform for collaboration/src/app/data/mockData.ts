export type BadgeStatus = 'pending' | 'in-progress' | 'completed' | 'revision' | 'confirmed';

export interface Project {
  id: string;
  name: string;
  region: string;
  startDate: string;
  endDate: string;
  totalRisks: number;
  assignedDepartments: number;
  submittedResponses: number;
  confirmedRisks: number;
}

export interface Risk {
  id: string;
  name: string;
  description: string;
  sector: string;
  subSector: string;
  subSubTag?: string;
  contextPages: number;
  mapLayers: number;
  assignedDepartments: number;
  status: BadgeStatus;
}

export interface Department {
  id: string;
  name: string;
}

export interface Response {
  id: string;
  riskId: string;
  respondent: string;
  department: string;
  userId?: string;
  question1Type: string;
  question1Urgency: string;
  question2Answers: string[];
  question3Short: string;
  question3Long: string;
  submittedAt: string;
}

export const mockProject: Project = {
  id: '1',
  name: '인천광역시 2026 기후변화 리스크 설문',
  region: '인천광역시',
  startDate: '2026-03-01',
  endDate: '2026-04-30',
  totalRisks: 24,
  assignedDepartments: 7,
  submittedResponses: 18,
  confirmedRisks: 12,
};

export const mockRisks: Risk[] = [
  {
    id: '1',
    name: '수인성 매개 질환 발생 증가',
    description: '기후변화로 인한 수온 상승과 강수 패턴 변화로 수인성 감염병 발생이 증가할 수 있습니다.',
    sector: '건강',
    subSector: '감염병',
    subSubTag: '수인성 매개질환',
    contextPages: 3,
    mapLayers: 2,
    assignedDepartments: 2,
    status: 'completed',
  },
  {
    id: '2',
    name: '폭염으로 인한 건강 취약계층 피해',
    description: '여름철 폭염일수 증가로 고령자 및 건강 취약계층의 온열질환 발생이 우려됩니다.',
    sector: '건강',
    subSector: '건강질환',
    contextPages: 2,
    mapLayers: 3,
    assignedDepartments: 3,
    status: 'confirmed',
  },
  {
    id: '3',
    name: '산림 병해충 발생 증가',
    description: '기온 상승으로 인한 병해충 생존율 증가 및 활동기간 연장이 예상됩니다.',
    sector: '생태계/산림',
    subSector: '산림',
    subSubTag: '병해충',
    contextPages: 2,
    mapLayers: 1,
    assignedDepartments: 1,
    status: 'in-progress',
  },
  {
    id: '4',
    name: '도심 침수 피해 증가',
    description: '집중호우 증가로 인한 도심지 내수 침수 위험이 높아지고 있습니다.',
    sector: '물관리',
    subSector: '치수',
    contextPages: 4,
    mapLayers: 2,
    assignedDepartments: 2,
    status: 'revision',
  },
  {
    id: '5',
    name: '해안 침식 가속화',
    description: '해수면 상승과 태풍 강도 증가로 해안 침식이 가속화되고 있습니다.',
    sector: '연안',
    subSector: '연안침식',
    contextPages: 3,
    mapLayers: 2,
    assignedDepartments: 2,
    status: 'pending',
  },
];

export const mockDepartments: Department[] = [
  { id: '1', name: '기후대응과' },
  { id: '2', name: '도시계획과' },
  { id: '3', name: '하천관리과' },
  { id: '4', name: '재난안전과' },
  { id: '5', name: '건강증진과' },
  { id: '6', name: '보건정책과' },
  { id: '7', name: '산림녹지과' },
  { id: '8', name: '기후변화대응팀' },
];

export const mockResponses: Response[] = [
  {
    id: '1',
    riskId: '1',
    respondent: '김민지',
    department: '건강증진과',
    userId: 'user1',
    question1Type: '우선적 추가조치 필요한 리스크 항목',
    question1Urgency: '매우 시급함',
    question2Answers: ['시가화·건조지역 - 지자체 전역', '수역 및 인근지역 - 특정 권역'],
    question3Short: '증가',
    question3Long: '증가',
    submittedAt: '2026-04-15 14:30',
  },
  {
    id: '2',
    riskId: '1',
    respondent: '이준호',
    department: '보건정책과',
    userId: 'user2',
    question1Type: '우선적 추가조치 필요한 리스크 항목',
    question1Urgency: '시급함',
    question2Answers: ['시가화·건조지역 - 지자체 전역', '농업지역 - 특정 권역'],
    question3Short: '증가',
    question3Long: '증가',
    submittedAt: '2026-04-16 10:15',
  },
];

export const sectors = ['전체', '국토', '연안', '물관리', '생태계/산림', '건강', '산업 및 에너지'];

export const sectorProgress = [
  { sector: '건강', total: 6, completed: 4 },
  { sector: '생태계/산림', total: 5, completed: 3 },
  { sector: '물관리', total: 5, completed: 3 },
  { sector: '연안', total: 4, completed: 1 },
  { sector: '국토', total: 3, completed: 1 },
  { sector: '산업 및 에너지', total: 1, completed: 0 },
];
