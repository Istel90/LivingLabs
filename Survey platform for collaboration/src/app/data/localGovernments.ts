import { getRegionByCode } from './administrativeRegions';

export interface LocalGovernment {
  id: string;
  regionCode: string;
  sido: string;
  sigungu: string;
  displayName: string;
  center: [number, number];
  zoom: number;
  department: string;
}

export interface UserAccount {
  username: string;
  password: string;
  localGovId: string;
  regionCode: string;
  role: 'admin' | 'respondent';
  name: string;
  department: string;
}

const CUSTOM_ACCOUNTS_KEY = 'living-lab-survey:accounts';

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function makeLocalGovernment(
  id: string,
  regionCode: string,
  department = '기후적응 담당부서',
): LocalGovernment | undefined {
  const region = getRegionByCode(regionCode);
  if (!region) return undefined;

  return {
    id,
    regionCode: region.code,
    sido: region.sido,
    sigungu: region.sigungu,
    displayName: region.displayName,
    center: region.center,
    zoom: region.zoom,
    department,
  };
}

export const localGovernments: LocalGovernment[] = [
  makeLocalGovernment('incheon', '28000', '기후대응과'),
  makeLocalGovernment('suwon', '41110', '기후변화대응팀'),
].filter(Boolean) as LocalGovernment[];

export const testAccounts: UserAccount[] = [
  {
    username: 'incheon_admin',
    password: 'test123',
    localGovId: 'incheon',
    regionCode: '28000',
    role: 'admin',
    name: '인천 관리자',
    department: '기후대응과',
  },
  {
    username: 'incheon_user',
    password: 'test123',
    localGovId: 'incheon',
    regionCode: '28000',
    role: 'respondent',
    name: '인천 응답자',
    department: '건강증진과',
  },
  {
    username: 'suwon_admin',
    password: 'test123',
    localGovId: 'suwon',
    regionCode: '41110',
    role: 'admin',
    name: '수원 관리자',
    department: '기후변화대응팀',
  },
  {
    username: 'suwon_user',
    password: 'test123',
    localGovId: 'suwon',
    regionCode: '41110',
    role: 'respondent',
    name: '수원 응답자',
    department: '녹지정책과',
  },
];

function readCustomAccounts(): UserAccount[] {
  if (!canUseStorage()) return [];

  try {
    const saved = window.localStorage.getItem(CUSTOM_ACCOUNTS_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    console.error('Failed to read custom accounts:', error);
    return [];
  }
}

function writeCustomAccounts(accounts: UserAccount[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(CUSTOM_ACCOUNTS_KEY, JSON.stringify(accounts));
}

export function getUserAccounts() {
  return [...testAccounts, ...readCustomAccounts()];
}

export function createUserAccount(account: UserAccount) {
  const duplicate = getUserAccounts().some((saved) => saved.username === account.username);
  if (duplicate) {
    throw new Error('이미 사용 중인 아이디입니다.');
  }

  const region = getRegionByCode(account.regionCode);
  if (!region) {
    throw new Error('선택한 행정구역 코드를 찾을 수 없습니다.');
  }

  const customAccounts = readCustomAccounts();
  const normalizedAccount: UserAccount = {
    ...account,
    regionCode: region.code,
    localGovId: account.localGovId || `region:${region.code}`,
  };
  writeCustomAccounts([...customAccounts, normalizedAccount]);
  return normalizedAccount;
}

export function getLocalGovernment(id: string): LocalGovernment | undefined {
  const fixed = localGovernments.find((lg) => lg.id === id);
  if (fixed) return fixed;

  const account = readCustomAccounts().find(
    (saved) => saved.localGovId === id || saved.regionCode === id || `region:${saved.regionCode}` === id,
  );
  if (account) {
    return makeLocalGovernment(account.localGovId, account.regionCode, account.department);
  }

  if (id.startsWith('region:')) {
    return makeLocalGovernment(id, id.replace('region:', ''));
  }

  return makeLocalGovernment(`region:${id}`, id);
}

export function authenticateUser(username: string, password: string): UserAccount | null {
  const account = getUserAccounts().find(
    (saved) => saved.username === username && saved.password === password,
  );
  return account || null;
}
