export interface LocalGovernment {
  id: string;
  sido: string;
  sigungu: string;
  displayName: string;
  center: [number, number]; // [lat, lng]
  zoom: number;
  department: string;
}

export interface UserAccount {
  username: string;
  password: string;
  localGovId: string;
  role: 'admin' | 'respondent';
  name: string;
  department: string;
}

export const localGovernments: LocalGovernment[] = [
  {
    id: 'incheon',
    sido: '인천광역시',
    sigungu: '',
    displayName: '인천광역시',
    center: [37.4563, 126.7052],
    zoom: 11,
    department: '기후대응과',
  },
  {
    id: 'suwon',
    sido: '경기도',
    sigungu: '수원시',
    displayName: '경기도 수원시',
    center: [37.2636, 127.0286],
    zoom: 12,
    department: '기후변화대응팀',
  },
];

// 테스트 계정 (실제로는 백엔드에서 관리)
export const testAccounts: UserAccount[] = [
  {
    username: 'incheon_admin',
    password: 'test123',
    localGovId: 'incheon',
    role: 'admin',
    name: '김인천',
    department: '기후대응과',
  },
  {
    username: 'incheon_user',
    password: 'test123',
    localGovId: 'incheon',
    role: 'respondent',
    name: '이응답',
    department: '건강증진과',
  },
  {
    username: 'suwon_admin',
    password: 'test123',
    localGovId: 'suwon',
    role: 'admin',
    name: '박수원',
    department: '기후변화대응팀',
  },
  {
    username: 'suwon_user',
    password: 'test123',
    localGovId: 'suwon',
    role: 'respondent',
    name: '최담당',
    department: '산림녹지과',
  },
];

export function getLocalGovernment(id: string): LocalGovernment | undefined {
  return localGovernments.find(lg => lg.id === id);
}

export function authenticateUser(username: string, password: string): UserAccount | null {
  const account = testAccounts.find(
    acc => acc.username === username && acc.password === password
  );
  return account || null;
}
