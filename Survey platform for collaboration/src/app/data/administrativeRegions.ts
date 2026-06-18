import SIDO_SIGUNGU_CSV from '../../../../shared/data/administrative-regions/sido_sgg_codes.csv?raw';
import SIGUNGU_CENTERS_CSV from '../../../../shared/data/administrative-regions/sigungu_centers.csv?raw';

export type RegionLevel = 'sido' | 'sigungu';

export interface RegionOption {
  code: string;
  sido: string;
  sigungu: string;
  displayName: string;
  shortName: string;
  center: [number, number];
  zoom: number;
  level: RegionLevel;
}

const DEFAULT_CENTER: [number, number] = [37.4563, 126.7052];

function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const [headerLine, ...dataLines] = lines;
  const headers = headerLine.split(',').map((header) => header.trim());

  return dataLines.map((line) => {
    const values = line.split(',').map((value) => value.trim());
    return headers.reduce<Record<string, string>>((row, header, index) => {
      row[header] = values[index] || '';
      return row;
    }, {});
  });
}

function normalizeCode(code: string) {
  return String(code || '').replace(/\D/g, '').padStart(5, '0');
}

function zoomForRegion(displayName: string, level: RegionLevel) {
  if (level === 'sido') return 10;
  if (/(구|읍|면|동)$/.test(displayName)) return 13;
  if (/시$/.test(displayName)) return 12;
  return 11;
}

const centerRows = parseCsv(SIGUNGU_CENTERS_CSV);

const centersByCode = new Map<string, { name: string; center: [number, number] }>();
const sidoCodeByName = new Map<string, string>();

centerRows.forEach((row) => {
  const code = normalizeCode(row.SIG_CD);
  const lng = Number(row.X);
  const lat = Number(row.Y);
  if (!code || !Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const name = row.한국이름;
  centersByCode.set(code, { name, center: [lat, lng] });

  if (code.endsWith('000')) {
    sidoCodeByName.set(name, code);
  }
});

const sidoOptions: RegionOption[] = Array.from(sidoCodeByName.entries()).map(([sido, code]) => {
  const center = centersByCode.get(code)?.center || DEFAULT_CENTER;
  return {
    code,
    sido,
    sigungu: '',
    displayName: sido,
    shortName: sido,
    center,
    zoom: zoomForRegion(sido, 'sido'),
    level: 'sido',
  };
});

const sigunguOptions: RegionOption[] = parseCsv(SIDO_SIGUNGU_CSV).map((row) => {
  const sido = row.Sido;
  const displayName = row.SIG_KOR_NM;
  const code = normalizeCode(row.SIG_CD);
  const sidoCode = sidoCodeByName.get(sido);
  const sigungu = displayName.startsWith(`${sido} `)
    ? displayName.slice(sido.length + 1)
    : displayName;

  return {
    code,
    sido,
    sigungu,
    displayName,
    shortName: sigungu || displayName,
    center: centersByCode.get(code)?.center || (sidoCode ? centersByCode.get(sidoCode)?.center : undefined) || DEFAULT_CENTER,
    zoom: zoomForRegion(sigungu || displayName, 'sigungu'),
    level: 'sigungu',
  };
});

export const regionOptions: RegionOption[] = [...sidoOptions, ...sigunguOptions];

export const sidos = sidoOptions.map((region) => region.sido);

export function getRegionByCode(code?: string | null): RegionOption | undefined {
  if (!code) return undefined;
  const normalized = normalizeCode(code);
  return regionOptions.find((region) => region.code === normalized);
}

export function getSidoRegionCode(sido: string): string | undefined {
  return sidoCodeByName.get(sido);
}

export function getSidoRegion(sido: string): RegionOption | undefined {
  const code = getSidoRegionCode(sido);
  return code ? getRegionByCode(code) : undefined;
}

export function getRegionsBySido(sido: string): RegionOption[] {
  return sigunguOptions.filter((region) => region.sido === sido);
}

export function getSelectableRegionsBySido(sido: string): RegionOption[] {
  const sidoRegion = getSidoRegion(sido);
  const regions = getRegionsBySido(sido);
  return sidoRegion ? [sidoRegion, ...regions] : regions;
}

export function formatRegionDisplayName(region?: RegionOption | null) {
  if (!region) return '지역 미지정';
  return region.displayName;
}
