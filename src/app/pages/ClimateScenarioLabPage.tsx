import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  CloudSun,
  Database,
  FlaskConical,
  Layers3,
  MapPinned,
  Pause,
  Play,
  Satellite,
  ThermometerSun,
} from 'lucide-react';
import { Link } from 'react-router';
import proj4 from 'proj4';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { WeatherAnalysisPage } from './WeatherAnalysisPage';

type WorkspaceMode = 'projection' | 'observation';
type AuditStatus = 'ready' | 'partial' | 'built' | 'missing';
type RiskDataAuditItem = {
  id: string;
  name: string;
  role: 'H' | 'E' | 'V' | 'AC' | '보조';
  source: string;
  coverage: string;
  timeCoverage: string;
  timeStep: string;
  resolution: string;
  status: AuditStatus;
  replacement: string;
  note: string;
};
type Period = { targetYear: number; from: number; to: number };
type Metric = {
  code: string;
  label: string;
  unit: string;
  frequency: 'monthly' | 'yearly';
  aggregation: string;
};
type Region = { code: string; name: string; sido: string; cellCount: number };
type ProjectionValues = Record<string, number | null>;
type ScenarioData = Record<string, Record<string, ProjectionValues>>;
type ClimateLabData = {
  meta: {
    title: string;
    source: string;
    generatedAt: string;
    periodMethod: string;
    experimental: boolean;
    grid: { columns: number; rows: number; cellSizeDegrees: number; nominalResolutionKm: number };
  };
  scenarios: string[];
  periods: Period[];
  metrics: Metric[];
  regions: Region[];
  data: Record<string, ScenarioData>;
};
type RiskDimension = 'H' | 'E' | 'V' | 'AC';
type HeatwaveRiskIndicator = {
  id: string;
  label: string;
  dimension: RiskDimension;
  group: string;
  description: string;
  dataPath?: string;
  dataKind?: 'grid' | 'station';
  stationMetric?: 'heatwave_days' | 'tropical_nights' | 'wsdi_days';
  sourceLabel?: string;
  buildNote?: string;
  period: string;
  resolution: string;
  direction: 'positive' | 'negative';
  score: number;
};
type RiskLayerMetadata = {
  label?: string;
  unit?: string;
  gridUnit?: string;
  crs?: string;
  columns?: number;
  rows?: number;
  stats?: { mean?: number; rawMean?: number; validCells?: number };
};
type RiskGridData = RiskLayerMetadata & {
  extent: { xmin: number; ymin: number; xmax: number; ymax: number };
  transform: { originX: number; originY: number; pixelWidth: number; pixelHeight: number };
  values: Array<number | null>;
  rawValues?: Array<number | null>;
  rawUnit?: string;
  normalizationSourceRange?: { min: number; max: number };
};
type ObservedHeatStationYear = {
  station_id: number;
  year: number;
  longitude: number;
  latitude: number;
  elevation_m: number | null;
  valid_days: number;
  heatwave_days: number;
  valid_nights: number;
  tropical_nights: number;
  wsdi_days: number;
  maximum_warm_spell_days: number;
};
type ObservedHeatData = {
  metadata: {
    title: string;
    source: string;
    period: { start: string; end: string };
    spatial_unit: string;
    stations: number;
    station_year_rows: number;
    wsdi_reference_period: string;
  };
  station_years: ObservedHeatStationYear[];
};
type RiskLayerData = RiskGridData | ObservedHeatData;
type RiskLayerCheck = {
  state: 'checking' | 'ready' | 'missing' | 'invalid' | 'error';
  validCells: number;
  totalCells: number;
  hasRawValues: boolean;
  message: string;
};

const DATA_URL = '/data/climate/ic4-admin-projections.json?v=20260731-current-baseline';
const BOUNDARY_URL = '/data/climate/admin-boundaries.geojson';
const LEAFLET_CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const EPSG5179 = '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs';
const SCENARIO_COLORS: Record<string, string> = {
  RCP26: '#10b981',
  RCP45: '#3b82f6',
  RCP60: '#f59e0b',
  RCP85: '#ef4444',
};
const FEATURED_METRICS = ['TA', 'HW33', 'TR25', 'SU25', 'TXx', 'TNx'];
const RISK_DIMENSIONS: Array<{ id: RiskDimension; label: string; english: string; color: string }> = [
  { id: 'H', label: '기후위험', english: 'Hazard', color: 'bg-rose-600' },
  { id: 'E', label: '노출', english: 'Exposure', color: 'bg-amber-500' },
  { id: 'V', label: '민감도', english: 'Sensitivity', color: 'bg-violet-600' },
  { id: 'AC', label: '적응역량', english: 'Adaptive Capacity', color: 'bg-emerald-600' },
];
const HEATWAVE_RISK_INDICATORS: HeatwaveRiskIndicator[] = [
  { id: 'lst', label: '지표면 온도', dimension: 'H', group: '기후위험', description: 'GEE Landsat 8·9 여름철 LST P90을 수원 100m 격자로 표시', dataPath: '/internal-tools/analysis-data/national/gee-lst-suwon-2021-2025-summer-p90-mean-100m.json', sourceLabel: 'Google Earth Engine · Landsat 8/9', buildNote: '현재 연결 파일은 연도별 5장이 아니라 2021~2025 P90의 5개년 평균 1장', period: '2021~2025년 6~9월 · 5개년 평균', resolution: '100m', direction: 'positive', score: 0.38262 },
  { id: 'hw33', label: '폭염일수', dimension: 'H', group: '기후위험', description: '실천권역 도출 페이지에서 사용하는 폭염일수 100m 정규화 격자', dataPath: '/internal-tools/analysis-data/ar6-hazard/H_climate_HW33_SSP245_MT_100m_z.json', dataKind: 'grid', sourceLabel: 'AR6 SSP245 중기전망 · 실천권역 동일 파일', buildNote: '수원 146×142 격자의 미래 중기전망 공간패턴입니다. 2021~2025 ASOS 관측소 집계와는 별도 자료입니다.', period: 'SSP245 중기', resolution: '100m', direction: 'positive', score: 0.55852 },
  { id: 'tr25', label: '열대야일수', dimension: 'H', group: '기후위험', description: '실천권역 도출 페이지에서 사용하는 열대야일수 100m 정규화 격자', dataPath: '/internal-tools/analysis-data/ar6-hazard/H_climate_TR25_SSP245_MT_100m_z.json', dataKind: 'grid', sourceLabel: 'AR6 SSP245 중기전망 · 실천권역 동일 파일', buildNote: '수원 146×142 격자의 미래 중기전망 공간패턴입니다. 관측소 연도별 값이 아닙니다.', period: 'SSP245 중기', resolution: '100m', direction: 'positive', score: 0.69113 },
  { id: 'wsdi', label: '온난일 계속기간', dimension: 'H', group: '기후위험', description: '실천권역 도출 페이지에서 사용하는 WSDI 100m 정규화 격자', dataPath: '/internal-tools/analysis-data/ar6-hazard/H_climate_WSDI_SSP245_MT_100m_z.json', dataKind: 'grid', sourceLabel: 'AR6 SSP245 중기전망 · 실천권역 동일 파일', buildNote: '수원 146×142 격자의 미래 중기전망 공간패턴입니다. 2021~2025 관측 WSDI와는 별도 자료입니다.', period: 'SSP245 중기', resolution: '100m', direction: 'positive', score: 0.61478 },
  { id: 'floating-population', label: '유동인구 노출량', dimension: 'E', group: '노출', description: 'Pop_Grid_100m Day_Total을 표준 100m 격자에 연결', dataPath: '/internal-tools/analysis-data/population/E_population_floating_count_100m.json', period: '기준연도 단일 스냅샷', resolution: '100m', direction: 'positive', score: 0.01259 },
  { id: 'resident-population', label: '상주인구 노출량', dimension: 'E', group: '노출', description: '국토통계 100m 격자 총인구를 표준 격자에 연결', dataPath: '/internal-tools/analysis-data/population/E_population_resident_count_100m.json', period: '기준연도 단일 스냅샷', resolution: '100m', direction: 'positive', score: 0.03308 },
  { id: 'elderly', label: '고령인구 비율', dimension: 'V', group: '민감도', description: '국토통계 100m 격자 고령인구 비율', dataPath: '/internal-tools/analysis-data/population/V_sensitivity_elderly_ratio_100m.json', period: '기준연도 단일 스냅샷', resolution: '100m', direction: 'positive', score: 0.06127 },
  { id: 'children', label: '유소년인구 비율', dimension: 'V', group: '민감도', description: '국토통계 100m 격자 유소년인구 비율', dataPath: '/internal-tools/analysis-data/population/V_sensitivity_children_ratio_100m.json', period: '기준연도 단일 스냅샷', resolution: '100m', direction: 'positive', score: 0.02439 },
  { id: 'single-household', label: '1인 가구', dimension: 'V', group: '민감도', description: '행정동 1인가구 비율을 100m 격자에 할당한 정규화 지표', dataPath: '/internal-tools/analysis-data/admin-physical/V_sensitivity_single_household_ratio_100m_z.json', period: '2026년 행정자료', resolution: '행정동→100m', direction: 'positive', score: 0.50044 },
  { id: 'health', label: '건강 취약 참고', dimension: 'V', group: '민감도', description: '순환기·호흡기 진료인원 기반 구 단위 건강취약 proxy', dataPath: '/internal-tools/analysis-data/admin-physical/V_sensitivity_chronic_disease_ratio_proxy_100m_z.json', period: '2021~2023년', resolution: '구→100m', direction: 'positive', score: 0.50816 },
  { id: 'low-income', label: '저소득층', dimension: 'V', group: '민감도', description: '기초생활보장 수급자 기반 행정동 저소득층 비율 proxy', dataPath: '/internal-tools/analysis-data/admin-physical/V_adaptive_low_income_ratio_proxy_100m_z.json', period: '2026년 행정자료', resolution: '행정동→100m', direction: 'positive', score: 0.26613 },
  { id: 'old-housing', label: '노후주택 비율', dimension: 'V', group: '민감도', description: '주거용 건축물 중 30년 이상 footprint 비율', dataPath: '/internal-tools/analysis-data/admin-physical/V_adaptive_old_housing_ratio_100m_z.json', period: '건축물 기준시점 확인 필요', resolution: '100m', direction: 'positive', score: 0.17228 },
  { id: 'shelter', label: '무더위쉼터 접근성', dimension: 'AC', group: '적응역량', description: '379개 쉼터 최근접 거리 기반 100m 접근성 점수', dataPath: '/internal-tools/analysis-data/cooling-shelter/V_adaptive_cooling_shelter_accessibility_100m_z.json', period: '시설목록 단일 시점', resolution: '100m', direction: 'negative', score: 0.87419 },
  { id: 'green', label: '녹지 비율', dimension: 'AC', group: '적응역량', description: '세분류 토지피복도 산림·초지·수역 면적 비율', dataPath: '/internal-tools/analysis-data/admin-physical/V_adaptive_green_natural_ratio_100m_z.json', period: '토지피복 기준시점 확인 필요', resolution: '100m', direction: 'negative', score: 0.38105 },
];
const AUDIT_STATUS: Record<AuditStatus, { label: string; style: string }> = {
  ready: { label: '분석 투입 가능', style: 'bg-emerald-100 text-emerald-800' },
  partial: { label: '부분 구축', style: 'bg-amber-100 text-amber-800' },
  built: { label: '산출 완료·연결 전', style: 'bg-blue-100 text-blue-800' },
  missing: { label: '미구축', style: 'bg-slate-200 text-slate-600' },
};
const RISK_DATA_AUDIT: RiskDataAuditItem[] = [
  { id: 'suwon-lst', name: '수원 지표면온도 LST', role: 'H', source: '보유 GeoTIFF', coverage: '수원시', timeCoverage: '촬영시점 메타데이터 미확인', timeStep: '단일 장면', resolution: '원본 30m → 분석 100m', status: 'ready', replacement: '현재 수원 H 지표로 사용 중', note: '전국 확장에는 동일한 취득일·품질 기준의 영상이 추가로 필요' },
  { id: 'ar6-hazard', name: 'AR6 폭염일수·열대야·WSDI', role: 'H', source: 'AR6 SSP126/245/370', coverage: '수원시', timeCoverage: '단기·중기·장기 27개 조합', timeStep: '기간 평균', resolution: '100m 가공격자', status: 'ready', replacement: '미래 H 지표 대체 가능', note: '현재 파일은 수원 범위이므로 타 지역 100m 래스터가 필요' },
  { id: 'ic4-admin', name: 'IC4 기후전망 12개 지표', role: 'H', source: '기상청 기후정보포털', coverage: '전국 268개 행정구역', timeCoverage: '2020·2050·2060·2070·2080·2090·2100', timeStep: '10년 간격 표출', resolution: '약 1km 원자료 → 시군구 평균', status: 'ready', replacement: '전국 미래 H 비교 가능', note: '행정구역 평균이므로 100m Risk 공간분석을 직접 대체하지는 못함' },
  { id: 'gee-lst', name: 'GEE LST 4종', role: 'H', source: 'Google Earth Engine·Landsat', coverage: '전국', timeCoverage: '2021~2025년 6~9월', timeStep: '5개년 계절집계·연도별 P90 포함', resolution: '100m EPSG:5179', status: 'built', replacement: '전국 현재 H 공간지표 후보', note: 'GeoTIFF 산출·MD5 검증 완료, Drive 파일을 웹 저장소/API에 연결해야 함' },
  { id: 'gk2a-lst', name: 'GK2A 위성 LST·구름', role: 'H', source: '기상청 API허브', coverage: '경기도', timeCoverage: '2026-05-01~2026-07-28 중 20장', timeStep: '12·13·14시 후보 중 맑은 장면', resolution: '약 2km', status: 'partial', replacement: '관측 H 검증·시간대 비교 가능', note: '연속 시계열이 아니라 선별 장면이며 전국·야간 자료가 아직 없음' },
  { id: 'kma-stations', name: 'AWS·ASOS 기상관측', role: 'H', source: '기상청 API허브·Supabase 수집기', coverage: '수원 중심 35km', timeCoverage: '수집설계 2020-06-01~현재, 6~9월', timeStep: '13·14·15시', resolution: '관측소 지점', status: 'partial', replacement: '기온·습도·풍속 H 보완 가능', note: '수집 스크립트는 있으나 실제 적재 행수와 결측률 감사가 추가로 필요' },
  { id: 'population', name: '상주·유동인구 100m', role: 'E', source: '국토통계·공간허브 가공', coverage: '수원시', timeCoverage: '기준연도 단일 스냅샷', timeStep: '비시계열', resolution: '100m', status: 'ready', replacement: '현재 E 지표로 사용 중', note: '전국 동일 격자 원자료 확보 여부와 기준연도 통일 필요' },
  { id: 'gee-built', name: 'GEE 시가화·나지 확률', role: 'E', source: 'Google Earth Engine', coverage: '전국', timeCoverage: '2021~2025년 6~9월', timeStep: '5개년 계절집계', resolution: '100m EPSG:5179', status: 'built', replacement: '인구 노출의 대체가 아닌 공간 보조지표', note: '사람의 노출량을 나타내지 않으므로 상주·유동인구와 함께 사용해야 함' },
  { id: 'population-sensitive', name: '고령·유소년·1인가구', role: 'V', source: '국토통계·행정자료 가공', coverage: '수원시', timeCoverage: '기준연도 단일 스냅샷', timeStep: '비시계열', resolution: '100m 또는 행정동 할당', status: 'ready', replacement: '현재 민감도 지표로 사용 중', note: '전국 확장 시 통계 기준연도와 행정구역 개편 이력 관리 필요' },
  { id: 'health-income-housing', name: '건강·저소득·노후주택 proxy', role: 'V', source: '행정·건축물 자료 가공', coverage: '수원시', timeCoverage: '2021~2026 혼합', timeStep: '비시계열', resolution: '구·행정동 → 100m 할당', status: 'partial', replacement: '민감도 보완 가능', note: '서로 다른 기준연도와 proxy 정의라 전국 비교 전 표준화 필요' },
  { id: 'gee-moisture', name: 'GEE NDMI·NDVI·수목·녹지', role: 'AC', source: 'Google Earth Engine·Landsat', coverage: '전국', timeCoverage: '2021~2025년 6~9월', timeStep: '5개년 계절집계', resolution: '100m EPSG:5179', status: 'built', replacement: '녹지 적응역량 전국 대체 후보', note: '기존 토지피복 녹지비율과 중복성을 검증한 뒤 선택해야 함' },
  { id: 'shelter', name: '무더위쉼터 접근성', role: 'AC', source: '쉼터 379개 위치 가공', coverage: '수원시', timeCoverage: '시설목록 단일 시점', timeStep: '비시계열', resolution: '100m 최근접거리', status: 'ready', replacement: '현재 적응역량 지표로 사용 중', note: '전국 시설 API/목록과 폐업·이전 갱신일 관리가 필요' },
  { id: 'terrain', name: '고도·경사·향', role: '보조', source: 'Google Earth Engine DEM', coverage: '전국', timeCoverage: '정적 지형', timeStep: '비시계열', resolution: '100m EPSG:5179', status: 'built', replacement: 'Risk 구성요소 설명·보정용', note: '직접 H/E/V로 넣기보다 그늘·바람·열축적 보정변수로 검토' },
  { id: 'vworld', name: '행정경계·필지', role: '보조', source: 'VWorld WMS·Data API', coverage: '전국', timeCoverage: 'API 최신본', timeStep: '요청 시 조회', resolution: '벡터', status: 'ready', replacement: '지역 마스킹·필지 후보 도출', note: 'Risk 값 자체가 아니라 모든 레이어의 공간 기준' },
  { id: 'shade', name: '그늘면적·수관 투영', role: 'AC', source: '미정', coverage: '없음', timeCoverage: '미구축', timeStep: '시간대별 필요', resolution: '10~100m 목표', status: 'missing', replacement: '기존 결측 적응역량 지표', note: '수목·건물높이·태양고도 또는 현장조사 자료 조합 필요' },
  { id: 'national-exposure', name: '전국 시간대별 유동인구', role: 'E', source: '미정', coverage: '없음', timeCoverage: '미구축', timeStep: '시간대별 목표', resolution: '100m 목표', status: 'missing', replacement: '전국 E 핵심 공백', note: 'API 제공범위·라이선스·다운로드 가능성을 우선 확인해야 함' },
];

function inspectRiskGrid(data: RiskGridData): RiskLayerCheck {
  const columns = Number(data.columns ?? 0);
  const rows = Number(data.rows ?? 0);
  const totalCells = columns * rows;
  const values = Array.isArray(data.values) ? data.values : [];
  const validCells = values.reduce((count, value) => count + (typeof value === 'number' && Number.isFinite(value) ? 1 : 0), 0);
  const hasSpatialReference = data.crs === 'EPSG:5179'
    && [data.extent?.xmin, data.extent?.ymin, data.extent?.xmax, data.extent?.ymax].every(Number.isFinite)
    && [data.transform?.originX, data.transform?.originY, data.transform?.pixelWidth, data.transform?.pixelHeight].every(Number.isFinite);
  if (!columns || !rows) return { state: 'invalid', validCells, totalCells, hasRawValues: false, message: '격자 크기 정보 없음' };
  if (values.length !== totalCells) return { state: 'invalid', validCells, totalCells, hasRawValues: false, message: `값 개수 불일치 (${values.length.toLocaleString()} / ${totalCells.toLocaleString()})` };
  if (!hasSpatialReference) return { state: 'invalid', validCells, totalCells, hasRawValues: false, message: 'EPSG:5179 공간정보 없음' };
  if (!validCells) return { state: 'invalid', validCells, totalCells, hasRawValues: false, message: '유효 격자값 없음' };
  const hasRawValues = Array.isArray(data.rawValues) && data.rawValues.length === totalCells;
  return {
    state: 'ready',
    validCells,
    totalCells,
    hasRawValues,
    message: hasRawValues ? '지도 표시 가능 · 원시값 포함' : '지도 표시 가능 · 정규화/가공값',
  };
}

function isObservedHeatData(data: RiskLayerData): data is ObservedHeatData {
  return Array.isArray((data as ObservedHeatData).station_years);
}

function inspectRiskLayer(data: RiskLayerData, indicator: HeatwaveRiskIndicator): RiskLayerCheck {
  if (!isObservedHeatData(data)) return inspectRiskGrid(data);
  const metric = indicator.stationMetric;
  const validRows = metric
    ? data.station_years.filter((row) => Number.isFinite(row[metric])).length
    : 0;
  if (!metric || !validRows) return { state: 'invalid', validCells: 0, totalCells: data.station_years.length, hasRawValues: true, message: '관측소 지표값 없음' };
  return {
    state: 'ready',
    validCells: validRows,
    totalCells: data.station_years.length,
    hasRawValues: true,
    message: `전국 ${data.metadata.stations}개 ASOS 관측소 · ${validRows}개 연도값`,
  };
}

function loadScript(src: string, attribute: string) {
  const existing = document.querySelector<HTMLScriptElement>(`script[${attribute}="true"]`);
  if (existing) {
    if (existing.dataset.loaded === 'true' || (window as any).L) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', reject, { once: true });
    });
  }
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.setAttribute(attribute, 'true');
    script.onload = () => { script.dataset.loaded = 'true'; resolve(); };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function loadLeaflet() {
  if (!document.querySelector(`link[href="${LEAFLET_CSS_URL}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = LEAFLET_CSS_URL;
    document.head.appendChild(link);
  }
  if (!(window as any).L) await loadScript(LEAFLET_JS_URL, 'data-climate-lab-leaflet');
  return (window as any).L;
}

function valueText(value: number | null | undefined, unit: string) {
  if (value == null) return '자료 없음';
  return `${value.toLocaleString('ko-KR', { maximumFractionDigits: unit === '°C' ? 2 : 1 })}${unit}`;
}

function shortRegionName(region: Region) {
  return region.name.startsWith(`${region.sido} `)
    ? region.name.slice(region.sido.length + 1)
    : region.name;
}

function colorForValue(value: number | null | undefined, min: number, max: number) {
  if (value == null) return '#94a3b8';
  const ratio = max === min ? 0.5 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  const hue = 215 - ratio * 210;
  return `hsl(${hue} 82% 50%)`;
}

function matchesRegionCode(featureCode: string, selectedCode: string) {
  if (featureCode === selectedCode) return true;
  return selectedCode.endsWith('0') && featureCode.startsWith(selectedCode.slice(0, 4));
}

function ClimateProjectionMap({
  region,
  metric,
  value,
  valuesByRegion,
  min,
  max,
  scenario,
  year,
  maskSelectedRegion,
  showThematicLayer,
  showLegend,
}: {
  region?: Region;
  metric?: Metric;
  value: number | null | undefined;
  valuesByRegion: Map<string, number | null>;
  min: number;
  max: number;
  scenario: string;
  year: number;
  maskSelectedRegion: boolean;
  showThematicLayer: boolean;
  showLegend: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const boundariesRef = useRef<any>(null);
  const dataLayerRef = useRef<any>(null);
  const selectedLayerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;
    const setup = async () => {
      try {
        const L = await loadLeaflet();
        if (disposed || !containerRef.current || mapRef.current) return;
        const map = L.map(containerRef.current, { minZoom: 6, zoomControl: true }).setView([36.3, 127.8], 7);
        mapRef.current = map;
        const base = L.tileLayer('https://xdworld.vworld.kr/2d/Base/service/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; VWorld',
        });
        const white = L.tileLayer('https://xdworld.vworld.kr/2d/white/service/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; VWorld',
        });
        base.addTo(map);
        L.control.layers({ '일반 지도': base, '백지도': white }, undefined, { position: 'topright' }).addTo(map);
        const response = await fetch(BOUNDARY_URL);
        if (!response.ok) throw new Error(`행정구역 경계자료 응답 오류 (${response.status})`);
        boundariesRef.current = await response.json();
        setReady(true);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : '지도를 불러오지 못했습니다.');
      }
    };
    void setup();
    return () => {
      disposed = true;
      if (mapRef.current) mapRef.current.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !region || !mapRef.current || !boundariesRef.current) return;
    const L = (window as any).L;
    if (dataLayerRef.current) mapRef.current.removeLayer(dataLayerRef.current);
    if (selectedLayerRef.current) mapRef.current.removeLayer(selectedLayerRef.current);
    dataLayerRef.current = L.geoJSON(boundariesRef.current, {
      style: (feature: any) => {
        const code = String(feature?.properties?.code ?? '');
        const featureValue = valuesByRegion.get(code);
        const insideMask = matchesRegionCode(code, region.code);
        return {
          color: maskSelectedRegion && !insideMask ? '#cbd5e1' : '#ffffff',
          weight: maskSelectedRegion && !insideMask ? 0.2 : 0.7,
          opacity: showThematicLayer ? 0.8 : 0,
          fillColor: showThematicLayer ? colorForValue(featureValue, min, max) : 'transparent',
          fillOpacity: !showThematicLayer ? 0 : maskSelectedRegion && !insideMask ? 0.035 : featureValue == null ? 0.12 : 0.72,
        };
      },
      onEachFeature: (feature: any, featureLayer: any) => {
        const code = String(feature?.properties?.code ?? '');
        const featureValue = valuesByRegion.get(code);
        featureLayer.bindTooltip(
          `<strong>${feature?.properties?.name ?? code}</strong><br/>${metric?.label ?? ''} ${valueText(featureValue, metric?.unit ?? '')}<br/>${scenario} · ${year}년`,
          { sticky: true },
        );
      },
    }).addTo(mapRef.current);
    const features = boundariesRef.current.features.filter((feature: any) =>
      matchesRegionCode(String(feature.properties?.code ?? ''), region.code),
    );
    if (!features.length) return;
    const layer = L.geoJSON({ type: 'FeatureCollection', features }, {
      style: { color: '#052e2b', weight: 4, opacity: 1, fillOpacity: 0 },
      onEachFeature: (_feature: any, featureLayer: any) => featureLayer.bindTooltip(
        `<strong>${region.name}</strong><br/>${metric?.label ?? ''} ${valueText(value, metric?.unit ?? '')}<br/>${scenario} · ${year}년`,
        { sticky: true },
      ),
    }).addTo(mapRef.current);
    selectedLayerRef.current = layer;
    mapRef.current.fitBounds(layer.getBounds(), { padding: [34, 34], maxZoom: 11, animate: false });
    window.setTimeout(() => mapRef.current?.invalidateSize(), 0);
  }, [ready, region, metric, value, valuesByRegion, min, max, scenario, year, maskSelectedRegion, showThematicLayer]);

  return (
    <div className="relative h-[620px] overflow-hidden rounded-2xl bg-slate-200 lg:h-[690px]">
      <div ref={containerRef} className="absolute inset-0" />
      {error && <div className="absolute inset-0 z-[600] grid place-items-center bg-slate-100 p-6 text-sm font-bold text-slate-600">{error}</div>}
      <div className="pointer-events-none absolute left-5 top-5 z-[500] max-w-[280px] rounded-2xl border border-white/80 bg-slate-950/90 p-4 text-white shadow-xl backdrop-blur">
        <div className="flex items-center gap-2 text-[11px] font-extrabold tracking-wider text-emerald-300"><MapPinned className="size-4" />선택 행정구역</div>
        <strong className="mt-2 block text-lg">{region?.name}</strong>
        <span className="mt-1 block text-xs text-slate-300">{scenario} · {year}년 · 약 1km 격자 {region?.cellCount.toLocaleString()}개</span>
      </div>
      {showLegend && showThematicLayer && <div className="pointer-events-none absolute bottom-5 right-5 z-[500] w-56 rounded-2xl border border-white/80 bg-white/95 p-4 text-slate-800 shadow-xl">
        <div className="flex items-center justify-between gap-3 text-xs"><strong>{metric?.label}</strong><span className="text-slate-500">전국 시군구 분포</span></div>
        <strong className="mt-2 block text-xl">{valueText(value, metric?.unit ?? '')}</strong>
        <div className="mt-3 h-2.5 rounded-full" style={{ background: 'linear-gradient(90deg,hsl(215 82% 50%),hsl(110 82% 50%),hsl(5 82% 50%))' }} />
        <div className="mt-1 flex justify-between text-[10px] font-bold text-slate-500"><span>{valueText(min, metric?.unit ?? '')}</span><span>{valueText(max, metric?.unit ?? '')}</span></div>
      </div>}
    </div>
  );
}

function gridColor(value: number, min: number, max: number, inverse: boolean) {
  let ratio = max === min ? 0.5 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  if (inverse) ratio = 1 - ratio;
  const stops = [
    [35, 99, 235],
    [16, 185, 129],
    [250, 204, 21],
    [239, 68, 68],
  ];
  const scaled = ratio * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  const local = scaled - index;
  return stops[index].map((channel, channelIndex) => Math.round(channel + (stops[index + 1][channelIndex] - channel) * local));
}

function RiskGridMap({
  indicator,
  data,
  error,
  selectedYear = 2025,
  embedded = false,
}: {
  indicator: HeatwaveRiskIndicator;
  data: RiskLayerData | null;
  error: string;
  selectedYear?: number;
  embedded?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const boundaryDataRef = useRef<any>(null);
  const boundaryLayerRef = useRef<any>(null);
  const rasterLayerRef = useRef<any>(null);
  const pointLayerRef = useRef<any>(null);
  const clickHandlerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState('');

  useEffect(() => {
    let disposed = false;
    const setup = async () => {
      try {
        const L = await loadLeaflet();
        if (disposed || !containerRef.current || mapRef.current) return;
        const map = L.map(containerRef.current, { minZoom: 6, zoomControl: true }).setView([37.2636, 127.0286], 11);
        mapRef.current = map;
        L.tileLayer('https://xdworld.vworld.kr/2d/Base/service/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; VWorld' }).addTo(map);
        const response = await fetch(BOUNDARY_URL);
        if (!response.ok) throw new Error(`행정경계 응답 오류 (${response.status})`);
        boundaryDataRef.current = await response.json();
        setReady(true);
      } catch (reason) {
        setMapError(reason instanceof Error ? reason.message : '100m 레이어 지도를 준비하지 못했습니다.');
      }
    };
    void setup();
    return () => {
      disposed = true;
      if (mapRef.current) mapRef.current.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !data || !mapRef.current || !boundaryDataRef.current) return;
    const L = (window as any).L;
    if (rasterLayerRef.current) mapRef.current.removeLayer(rasterLayerRef.current);
    if (pointLayerRef.current) mapRef.current.removeLayer(pointLayerRef.current);
    if (boundaryLayerRef.current) mapRef.current.removeLayer(boundaryLayerRef.current);
    if (clickHandlerRef.current) mapRef.current.off('click', clickHandlerRef.current);
    mapRef.current.closePopup();

    if (isObservedHeatData(data)) {
      const metric = indicator.stationMetric;
      const yearRows = metric
        ? data.station_years.filter((row) => row.year === selectedYear && Number.isFinite(row[metric]))
        : [];
      const values = metric ? yearRows.map((row) => Number(row[metric])) : [];
      const min = values.length ? Math.min(...values) : 0;
      const max = values.length ? Math.max(...values) : 1;
      const group = L.layerGroup();
      for (const row of yearRows) {
        const value = Number(row[metric!]);
        const [red, green, blue] = gridColor(value, min, max, indicator.direction === 'negative');
        L.circleMarker([row.latitude, row.longitude], {
          radius: 6,
          color: '#ffffff',
          weight: 1.5,
          fillColor: `rgb(${red},${green},${blue})`,
          fillOpacity: 0.92,
        }).bindPopup(`<strong>${indicator.label}</strong><br/>ASOS ${row.station_id} · ${selectedYear}년<br/><b>${value.toLocaleString('ko-KR')}일</b><br/><small>유효 일자료 ${row.valid_days}일 · 유효 야간 ${row.valid_nights}일</small>`).addTo(group);
      }
      pointLayerRef.current = group.addTo(mapRef.current);
      boundaryLayerRef.current = L.geoJSON(boundaryDataRef.current, {
        style: { color: '#334155', weight: 0.7, opacity: 0.65, fillOpacity: 0 },
      }).addTo(mapRef.current);
      if (yearRows.length) mapRef.current.fitBounds(L.latLngBounds(yearRows.map((row) => [row.latitude, row.longitude])), { padding: [24, 24], animate: false });
      window.setTimeout(() => mapRef.current?.invalidateSize(), 0);
      return;
    }

    const renderValues = data.rawValues?.length === data.values.length ? data.rawValues : data.values;
    const validValues = renderValues.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const min = validValues.length ? Math.min(...validValues) : 0;
    const max = validValues.length ? Math.max(...validValues) : 1;
    const canvas = document.createElement('canvas');
    canvas.width = data.columns ?? 1;
    canvas.height = data.rows ?? 1;
    const context = canvas.getContext('2d');
    if (!context) return;
    const image = context.createImageData(canvas.width, canvas.height);
    renderValues.forEach((value, index) => {
      if (value == null || !Number.isFinite(value)) return;
      const [red, green, blue] = gridColor(value, min, max, indicator.direction === 'negative');
      image.data[index * 4] = red;
      image.data[index * 4 + 1] = green;
      image.data[index * 4 + 2] = blue;
      image.data[index * 4 + 3] = 205;
    });
    context.putImageData(image, 0, 0);
    const [southWestLon, southWestLat] = proj4(EPSG5179, 'EPSG:4326', [data.extent.xmin, data.extent.ymin]);
    const [northEastLon, northEastLat] = proj4(EPSG5179, 'EPSG:4326', [data.extent.xmax, data.extent.ymax]);
    const rasterBounds = L.latLngBounds([southWestLat, southWestLon], [northEastLat, northEastLon]);
    rasterLayerRef.current = L.imageOverlay(canvas.toDataURL('image/png'), rasterBounds, { opacity: 0.82, interactive: false }).addTo(mapRef.current);

    const suwonFeatures = boundaryDataRef.current.features.filter((feature: any) => matchesRegionCode(String(feature?.properties?.code ?? ''), '41110'));
    boundaryLayerRef.current = L.geoJSON({ type: 'FeatureCollection', features: suwonFeatures }, {
      style: (feature: any) => ({
        color: String(feature?.properties?.code ?? '') === '41110' ? '#071c1a' : '#ffffff',
        weight: String(feature?.properties?.code ?? '') === '41110' ? 4 : 1.5,
        opacity: 1,
        fillOpacity: 0,
      }),
      onEachFeature: (feature: any, layer: any) => layer.bindTooltip(String(feature?.properties?.name ?? '수원시'), { sticky: true }),
    }).addTo(mapRef.current);
    mapRef.current.fitBounds(rasterBounds, { padding: [18, 18], animate: false });

    const unit = data.rawUnit || data.unit || (indicator.id === 'lst' ? '°C' : indicator.score <= 1 ? '점수' : '');
    const clickHandler = (event: any) => {
      const [x, y] = proj4('EPSG:4326', EPSG5179, [event.latlng.lng, event.latlng.lat]);
      const column = Math.floor((x - data.transform.originX) / data.transform.pixelWidth);
      const row = Math.floor((data.transform.originY - y) / data.transform.pixelHeight);
      if (column < 0 || row < 0 || column >= (data.columns ?? 0) || row >= (data.rows ?? 0)) return;
      const index = row * (data.columns ?? 0) + column;
      const value = renderValues[index];
      if (value == null || !Number.isFinite(value)) return;
      L.popup().setLatLng(event.latlng).setContent(`<strong>${indicator.label}</strong><br/>100m 격자 ${column + 1}, ${row + 1}<br/><b>${Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 4 })}${unit === '점수' ? '' : unit}</b>`).openOn(mapRef.current);
    };
    clickHandlerRef.current = clickHandler;
    mapRef.current.on('click', clickHandler);
    window.setTimeout(() => mapRef.current?.invalidateSize(), 0);
    return () => {
      if (mapRef.current && clickHandlerRef.current) mapRef.current.off('click', clickHandlerRef.current);
    };
  }, [ready, data, indicator, selectedYear]);

  const stationValues = data && isObservedHeatData(data) && indicator.stationMetric
    ? data.station_years.filter((row) => row.year === selectedYear).map((row) => Number(row[indicator.stationMetric!])).filter(Number.isFinite)
    : [];
  const displayValues = data && !isObservedHeatData(data) && data.rawValues?.length === data.values.length ? data.rawValues : data && !isObservedHeatData(data) ? data.values : stationValues;
  const valid = displayValues?.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)) ?? [];
  const min = valid.length ? Math.min(...valid) : 0;
  const max = valid.length ? Math.max(...valid) : 1;
  return (
    <div className={embedded ? 'overflow-hidden bg-slate-100' : 'overflow-hidden rounded-2xl border border-slate-200 bg-slate-100'}>
      {!embedded && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4"><div><p className="text-[10px] font-extrabold tracking-wider text-emerald-700">{data && isObservedHeatData(data) ? 'ACTUAL ASOS STATION LAYER' : 'ACTUAL 100M GRID LAYER'}</p><h4 className="mt-1 font-black">{indicator.label} {data ? '실제 공간분포' : '지도 미구축'}</h4></div>{data ? <div className="flex gap-2 text-[10px] font-bold"><span className="rounded-full bg-slate-100 px-3 py-1.5">{isObservedHeatData(data) ? `전국 · ${selectedYear}년` : '수원시 경계'}</span><span className="rounded-full bg-emerald-100 px-3 py-1.5 text-emerald-700">지도 클릭 시 {isObservedHeatData(data) ? '관측소값' : '격자값'} 확인</span></div> : <span className="rounded-full bg-amber-100 px-3 py-1.5 text-[10px] font-bold text-amber-800">결과 파일 필요</span>}</div>}
      <div className={embedded ? 'relative h-[620px] lg:h-[690px]' : 'relative h-[560px]'}>
        <div ref={containerRef} className="absolute inset-0" />
        {(error || mapError) && <div className="absolute inset-0 z-[600] grid place-items-center bg-slate-100 p-6 text-sm font-bold text-rose-700">{error || mapError}</div>}
        {!data && !error && <div className="absolute inset-0 z-[600] grid place-items-center bg-slate-100 text-sm font-bold text-slate-500">100m 지표 레이어를 불러오는 중입니다.</div>}
        {data && <div className="pointer-events-none absolute bottom-5 right-5 z-[500] w-56 rounded-xl border border-white/80 bg-white/95 p-4 shadow-xl"><div className="flex justify-between text-xs"><strong>{indicator.label}</strong><span>{indicator.resolution}</span></div><div className="mt-3 h-2.5 rounded-full" style={{ background: indicator.direction === 'negative' ? 'linear-gradient(90deg,#ef4444,#facc15,#10b981,#2363eb)' : 'linear-gradient(90deg,#2363eb,#10b981,#facc15,#ef4444)' }} /><div className="mt-1 flex justify-between text-[10px] font-bold text-slate-500"><span>{min.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}{isObservedHeatData(data) ? '일' : ''}</span><span>{max.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}{isObservedHeatData(data) ? '일' : ''}</span></div></div>}
      </div>
    </div>
  );
}

function RiskDataInventory({
  region, metric, value, valuesByRegion, min, max, scenario, year,
}: {
  region?: Region;
  metric?: Metric;
  value: number | null | undefined;
  valuesByRegion: Map<string, number | null>;
  min: number;
  max: number;
  scenario: string;
  year: number;
}) {
  const [roleFilter, setRoleFilter] = useState('전체');
  const [statusFilter, setStatusFilter] = useState('전체');
  const [selectedAuditId, setSelectedAuditId] = useState('ic4-admin');
  const filtered = RISK_DATA_AUDIT.filter((item) =>
    (roleFilter === '전체' || item.role === roleFilter) &&
    (statusFilter === '전체' || item.status === statusFilter),
  );
  const selectedAudit = RISK_DATA_AUDIT.find((item) => item.id === selectedAuditId) ?? RISK_DATA_AUDIT[0];
  const hasLiveSpatialValues = selectedAudit.id === 'ic4-admin';
  const count = (status: AuditStatus) => RISK_DATA_AUDIT.filter((item) => item.status === status).length;
  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-4">
        {(['ready', 'built', 'partial', 'missing'] as AuditStatus[]).map((status) => <article key={status} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ${AUDIT_STATUS[status].style}`}>{AUDIT_STATUS[status].label}</span><strong className="mt-3 block text-3xl font-black">{count(status)}<small className="ml-1 text-sm text-slate-400">개 묶음</small></strong></article>)}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-extrabold tracking-wider text-emerald-700">RISK DATA AUDIT</p><h2 className="mt-1 text-xl font-black">폭염 Risk 대체·보완 데이터 점검표</h2><p className="mt-1 text-xs text-slate-500">파일이 존재하는 것과 전국 Risk에 바로 쓸 수 있는 것은 다릅니다. 공간범위와 시간축을 함께 확인합니다.</p></div>
          <div className="flex gap-2"><label className="text-[10px] font-bold text-slate-500">Risk 역할<select aria-label="Risk 역할 필터" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="mt-1 block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800">{['전체', 'H', 'E', 'V', 'AC', '보조'].map((value) => <option key={value}>{value}</option>)}</select></label><label className="text-[10px] font-bold text-slate-500">구축상태<select aria-label="구축상태 필터" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="mt-1 block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800"><option value="전체">전체</option>{(Object.keys(AUDIT_STATUS) as AuditStatus[]).map((status) => <option key={status} value={status}>{AUDIT_STATUS[status].label}</option>)}</select></label></div>
        </div>
        <div className="mt-5 grid items-start gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-3 px-2">
              <p className="text-[10px] font-extrabold tracking-wider text-emerald-700">DATA LAYERS</p>
              <h3 className="mt-1 text-sm font-black text-slate-900">지도에서 확인할 데이터</h3>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">항목을 선택하면 구축 범위와 실제 연결 여부를 확인합니다.</p>
            </div>
            <div className="max-h-[520px] space-y-1 overflow-y-auto pr-1">
              {filtered.map((item) => (
                <button key={item.id} type="button" onClick={() => setSelectedAuditId(item.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedAudit.id === item.id ? 'border-emerald-500 bg-white shadow-sm' : 'border-transparent hover:border-slate-200 hover:bg-white'}`}>
                  <div className="flex items-start justify-between gap-2"><strong className="text-xs leading-5 text-slate-900">{item.name}</strong><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black ${AUDIT_STATUS[item.status].style}`}>{AUDIT_STATUS[item.status].label}</span></div>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500"><span>{item.role} · {item.resolution}</span><span>{item.coverage}</span></div>
                </button>
              ))}
            </div>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
            <ClimateProjectionMap region={region} metric={hasLiveSpatialValues ? metric : undefined} value={hasLiveSpatialValues ? value : null} valuesByRegion={hasLiveSpatialValues ? valuesByRegion : new Map()} min={min} max={max} scenario={scenario} year={year} maskSelectedRegion={selectedAudit.coverage.includes('수원')} showThematicLayer={hasLiveSpatialValues} showLegend={hasLiveSpatialValues} />
            <div className="absolute left-4 right-4 top-4 z-[550] rounded-2xl border border-white/80 bg-white/95 p-4 shadow-xl backdrop-blur sm:left-auto sm:w-[360px]">
              <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black tracking-wider text-emerald-700">SELECTED DATA</p><h3 className="mt-1 text-base font-black text-slate-900">{selectedAudit.name}</h3></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${AUDIT_STATUS[selectedAudit.status].style}`}>{AUDIT_STATUS[selectedAudit.status].label}</span></div>
              <dl className="mt-3 grid grid-cols-[72px_1fr] gap-x-2 gap-y-1 text-[11px] leading-5"><dt className="font-bold text-slate-400">공간 범위</dt><dd className="font-bold text-slate-700">{selectedAudit.coverage}</dd><dt className="font-bold text-slate-400">시간 범위</dt><dd className="font-bold text-slate-700">{selectedAudit.timeCoverage}</dd><dt className="font-bold text-slate-400">시간 간격</dt><dd className="font-bold text-slate-700">{selectedAudit.timeStep}</dd></dl>
              <div className={`mt-3 rounded-xl px-3 py-2.5 text-[11px] font-bold leading-5 ${hasLiveSpatialValues ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{hasLiveSpatialValues ? '실제 행정구역별 값이 연결되어 있습니다. 시나리오와 시점을 바꾸면 지도와 범례가 함께 갱신됩니다.' : selectedAudit.status === 'missing' ? '원자료가 없어 아직 공간 분포를 표시할 수 없습니다.' : '구축 범위만 표시 중입니다. 실제 픽셀 분포를 보려면 원본 파일을 웹 레이어로 연결해야 합니다.'}</div>
            </div>
          </div>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse text-left text-xs">
            <thead><tr className="border-y border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><th className="px-3 py-3">자료</th><th className="px-3 py-3">Risk</th><th className="px-3 py-3">공간범위</th><th className="px-3 py-3">시간범위·간격</th><th className="px-3 py-3">해상도</th><th className="px-3 py-3">상태</th><th className="px-3 py-3">기존 지표 대체성</th></tr></thead>
            <tbody>{filtered.map((item) => <tr key={item.id} className="border-b border-slate-100 align-top hover:bg-slate-50"><td className="px-3 py-4"><strong className="block text-sm text-slate-900">{item.name}</strong><span className="mt-1 block text-[10px] text-slate-400">{item.source}</span><p className="mt-2 max-w-xs leading-4 text-slate-500">{item.note}</p></td><td className="px-3 py-4"><span className={`inline-flex size-8 items-center justify-center rounded-full font-black ${item.role === 'H' ? 'bg-rose-100 text-rose-700' : item.role === 'E' ? 'bg-blue-100 text-blue-700' : item.role === 'V' ? 'bg-violet-100 text-violet-700' : item.role === 'AC' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{item.role}</span></td><td className="px-3 py-4 font-bold text-slate-700">{item.coverage}</td><td className="px-3 py-4"><strong className="block text-slate-700">{item.timeCoverage}</strong><span className="mt-1 block text-[10px] text-slate-400">{item.timeStep}</span></td><td className="px-3 py-4 text-slate-600">{item.resolution}</td><td className="px-3 py-4"><span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-black ${AUDIT_STATUS[item.status].style}`}>{AUDIT_STATUS[item.status].label}</span></td><td className="px-3 py-4 font-bold leading-5 text-slate-700">{item.replacement}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
      <section className="grid gap-3 lg:grid-cols-3"><article className="rounded-2xl border border-rose-200 bg-rose-50 p-5"><strong className="text-rose-900">가장 큰 공백: 전국 노출(E)</strong><p className="mt-2 text-xs leading-5 text-rose-700">시간대별 유동인구와 동일 기준연도의 100m 상주인구가 아직 전국 규격으로 연결되지 않았습니다.</p></article><article className="rounded-2xl border border-blue-200 bg-blue-50 p-5"><strong className="text-blue-900">가장 빠른 확장: GEE 현재 공간지표</strong><p className="mt-2 text-xs leading-5 text-blue-700">전국 100m 산출은 끝났으므로 Drive GeoTIFF를 웹 저장소에 옮기고 지역별 타일·마스크를 만들면 됩니다.</p></article><article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><strong className="text-emerald-900">시간축이 가장 명확한 자료: IC4</strong><p className="mt-2 text-xs leading-5 text-emerald-700">전국 행정구역과 2020~2100 전망은 준비됐지만, 100m Risk 지도와 결합할 다운스케일 규칙이 필요합니다.</p></article></section>
    </div>
  );
}

export function ClimateScenarioLabPage() {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('projection');
  const [catalog, setCatalog] = useState<ClimateLabData | null>(null);
  const [error, setError] = useState('');
  const [selectedSido, setSelectedSido] = useState('경기도');
  const [selectedRegionCode, setSelectedRegionCode] = useState('41110');
  const [selectedScenario, setSelectedScenario] = useState('RCP45');
  const [selectedYear, setSelectedYear] = useState(2020);
  const [selectedMapMetric, setSelectedMapMetric] = useState('TA');
  const [maskSelectedRegion, setMaskSelectedRegion] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [playingTimeline, setPlayingTimeline] = useState(false);
  const [selectedRiskId, setSelectedRiskId] = useState('lst');
  const [selectedObservedYear, setSelectedObservedYear] = useState(2025);
  const [riskLayerMetadata, setRiskLayerMetadata] = useState<RiskLayerData | null>(null);
  const [riskLayerError, setRiskLayerError] = useState('');
  const [riskLayerChecks, setRiskLayerChecks] = useState<Record<string, RiskLayerCheck>>(() => Object.fromEntries(
    HEATWAVE_RISK_INDICATORS.map((indicator) => [indicator.id, { state: 'checking', validCells: 0, totalCells: 0, hasRawValues: false, message: '파일 검사 중' }]),
  ));

  useEffect(() => {
    fetch(DATA_URL)
      .then(async (response) => {
        if (!response.ok) throw new Error(`기후전망 자료 응답 오류 (${response.status})`);
        return response.json() as Promise<ClimateLabData>;
      })
      .then((result) => {
        setCatalog(result);
        const initialRegion = result.regions.find((region) => region.code === '41110') ?? result.regions[0];
        if (initialRegion) {
          setSelectedSido(initialRegion.sido);
          setSelectedRegionCode(initialRegion.code);
        }
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : '기후전망 자료를 불러오지 못했습니다.'));
  }, []);

  const sidoOptions = useMemo(
    () => [...new Set(catalog?.regions.map((region) => region.sido) ?? [])].sort((a, b) => a.localeCompare(b, 'ko')),
    [catalog],
  );
  const regionOptions = useMemo(
    () => (catalog?.regions ?? []).filter((region) => region.sido === selectedSido),
    [catalog, selectedSido],
  );
  const selectedRegion = catalog?.regions.find((region) => region.code === selectedRegionCode);
  const selectedValues = catalog?.data[selectedRegionCode]?.[selectedScenario]?.[String(selectedYear)] ?? {};
  const metricByCode = useMemo(
    () => new Map((catalog?.metrics ?? []).map((metric) => [metric.code, metric])),
    [catalog],
  );
  const mapMetric = metricByCode.get(selectedMapMetric);
  const trendData = useMemo(
    () => (catalog?.periods ?? []).map((period) => ({
      year: period.targetYear,
      ...Object.fromEntries((catalog?.scenarios ?? []).map((scenario) => [
        scenario,
        catalog?.data[selectedRegionCode]?.[scenario]?.[String(period.targetYear)]?.[selectedMapMetric] ?? null,
      ])),
    })),
    [catalog, selectedMapMetric, selectedRegionCode],
  );
  const mapRange = useMemo(() => {
    const values = (catalog?.regions ?? [])
      .map((region) => catalog?.data[region.code]?.[selectedScenario]?.[String(selectedYear)]?.[selectedMapMetric])
      .filter((item): item is number => typeof item === 'number');
    return values.length ? { min: Math.min(...values), max: Math.max(...values) } : { min: 0, max: 1 };
  }, [catalog, selectedScenario, selectedYear, selectedMapMetric]);
  const mapValuesByRegion = useMemo(
    () => new Map((catalog?.regions ?? []).map((region) => [
      region.code,
      catalog?.data[region.code]?.[selectedScenario]?.[String(selectedYear)]?.[selectedMapMetric] ?? null,
    ])),
    [catalog, selectedScenario, selectedYear, selectedMapMetric],
  );
  const selectedRiskIndicator = HEATWAVE_RISK_INDICATORS.find((item) => item.id === selectedRiskId)
    ?? HEATWAVE_RISK_INDICATORS[0];

  useEffect(() => {
    let disposed = false;
    setRiskLayerMetadata(null);
    setRiskLayerError('');
    if (!selectedRiskIndicator.dataPath) {
      setRiskLayerError(selectedRiskIndicator.buildNote ?? '아직 지도 파일이 구축되지 않았습니다.');
      return () => { disposed = true; };
    }
    fetch(selectedRiskIndicator.dataPath)
      .then(async (response) => {
        if (!response.ok) throw new Error(`지표 파일 응답 오류 (${response.status})`);
        return response.json() as Promise<RiskLayerData>;
      })
      .then((metadata) => { if (!disposed) setRiskLayerMetadata(metadata); })
      .catch((reason) => { if (!disposed) setRiskLayerError(reason instanceof Error ? reason.message : '지표 파일을 읽지 못했습니다.'); });
    return () => { disposed = true; };
  }, [selectedRiskIndicator.id, selectedRiskIndicator.dataPath, selectedRiskIndicator.buildNote]);
  useEffect(() => {
    let disposed = false;
    HEATWAVE_RISK_INDICATORS.forEach((indicator) => {
      if (!indicator.dataPath) {
        setRiskLayerChecks((current) => ({
          ...current,
          [indicator.id]: { state: 'missing', validCells: 0, totalCells: 0, hasRawValues: false, message: indicator.buildNote ?? '결과 파일 미구축' },
        }));
        return;
      }
      fetch(indicator.dataPath)
        .then(async (response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json() as Promise<RiskLayerData>;
        })
        .then((data) => {
          if (!disposed) setRiskLayerChecks((current) => ({ ...current, [indicator.id]: inspectRiskLayer(data, indicator) }));
        })
        .catch((reason) => {
          if (!disposed) setRiskLayerChecks((current) => ({
            ...current,
            [indicator.id]: { state: 'error', validCells: 0, totalCells: 0, hasRawValues: false, message: reason instanceof Error ? reason.message : '파일 읽기 실패' },
          }));
        });
    });
    return () => { disposed = true; };
  }, []);
  useEffect(() => {
    if (!playingTimeline || !catalog?.periods.length) return;
    const timer = window.setInterval(() => {
      setSelectedYear((currentYear) => {
        const currentIndex = catalog.periods.findIndex((period) => period.targetYear === currentYear);
        return catalog.periods[(currentIndex + 1) % catalog.periods.length].targetYear;
      });
    }, 1400);
    return () => window.clearInterval(timer);
  }, [playingTimeline, catalog]);

  const changeSido = (value: string) => {
    setSelectedSido(value);
    const firstRegion = catalog?.regions.find((region) => region.sido === value);
    if (firstRegion) setSelectedRegionCode(firstRegion.code);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-4 px-4 py-5">
          <div className="flex items-center gap-4">
            <Link to="/tools" aria-label="지원도구로 돌아가기" className="grid size-10 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"><ArrowLeft className="size-4" /></Link>
            <div>
              <div className="flex items-center gap-2 text-xs font-extrabold tracking-[0.16em] text-emerald-700"><FlaskConical className="size-4" />CLIMATE & WEATHER LAB</div>
              <h1 className="mt-1 text-2xl font-black tracking-tight">기후·기상 데이터 실험실</h1>
            </div>
          </div>
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1" aria-label="실험자료 구분">
            <button type="button" onClick={() => setWorkspaceMode('projection')} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-extrabold ${workspaceMode === 'projection' ? 'bg-emerald-700 text-white shadow' : 'text-slate-600'}`}><BarChart3 className="size-4" />미래 기후전망</button>
            <button type="button" onClick={() => setWorkspaceMode('observation')} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-extrabold ${workspaceMode === 'observation' ? 'bg-sky-700 text-white shadow' : 'text-slate-600'}`}><Satellite className="size-4" />관측·위성 LST</button>
          </div>
        </div>
      </header>

      {workspaceMode === 'observation' ? (
        <WeatherAnalysisPage embedded />
      ) : (
        <main className="container mx-auto px-4 py-5">
          {error && <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-bold text-rose-700">{error}</div>}
          {!catalog && !error && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-500">IC4 행정구역 전망자료를 불러오는 중입니다.</div>}
          {catalog && (
            <div className="space-y-4">
              <section className="rounded-2xl bg-slate-950 px-5 py-6 text-white shadow-lg sm:px-7">
                <p className="text-[11px] font-extrabold tracking-[0.18em] text-emerald-300">LOCAL CLIMATE TIME EXPLORER</p>
                <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
                  <div><h2 className="text-2xl font-black">지역의 기후변화를 시점별로 확인합니다.</h2><p className="mt-2 text-sm text-slate-300">지역과 지표를 선택한 뒤 연도를 누르면 지도와 그래프가 함께 바뀝니다.</p></div>
                  <button type="button" onClick={() => setPlayingTimeline((value) => !value)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-emerald-500" aria-label={playingTimeline ? '시간 재생 중지' : '시간 재생'}>{playingTimeline ? <Pause className="size-4" /> : <Play className="size-4" />}{playingTimeline ? '자동 재생 중지' : '시점 자동 재생'}</button>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full bg-emerald-700 text-xs font-black text-white">01</span><div><h3 className="font-black">확인할 시점 선택</h3><p className="text-xs text-slate-500">현재 기준과 미래 시점을 바로 비교할 수 있습니다.</p></div></div>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                  {catalog.periods.map((period) => <button key={period.targetYear} type="button" onClick={() => setSelectedYear(period.targetYear)} className={`rounded-xl border px-2 py-3 text-center transition ${selectedYear === period.targetYear ? 'border-emerald-700 bg-emerald-700 text-white shadow-md' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-emerald-300 hover:bg-emerald-50'}`}><strong className="block text-sm">{period.targetYear}</strong><span className={`mt-1 block text-[10px] ${selectedYear === period.targetYear ? 'text-emerald-100' : 'text-slate-400'}`}>{period.targetYear === 2020 ? '현재 기준' : '미래 전망'}</span></button>)}
                </div>
              </section>

              <section className="grid items-start gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-4">
                  <div className="mb-5 flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full bg-slate-900 text-xs font-black text-white">02</span><div><h3 className="font-black">분석 조건</h3><p className="text-xs text-slate-500">네 가지 항목만 선택하세요.</p></div></div>
                  <div className="grid gap-4">
                    <label className="text-xs font-bold text-slate-500">시도<select aria-label="시도" value={selectedSido} onChange={(event) => changeSido(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-900">{sidoOptions.map((sido) => <option key={sido}>{sido}</option>)}</select></label>
                    <label className="text-xs font-bold text-slate-500">시군구<select aria-label="시군구" value={selectedRegionCode} onChange={(event) => setSelectedRegionCode(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-900">{regionOptions.map((region) => <option key={region.code} value={region.code}>{shortRegionName(region)}</option>)}</select></label>
                    <label className="text-xs font-bold text-slate-500">배출 시나리오<select aria-label="배출 시나리오" value={selectedScenario} onChange={(event) => setSelectedScenario(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-900">{catalog.scenarios.map((scenario) => <option key={scenario}>{scenario}</option>)}</select></label>
                    <label className="text-xs font-bold text-slate-500">기후지표<select aria-label="기후지표" value={selectedMapMetric} onChange={(event) => setSelectedMapMetric(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-900">{catalog.metrics.map((metric) => <option key={metric.code} value={metric.code}>{metric.label}</option>)}</select></label>
                  </div>
                  <div className="mt-5 rounded-2xl bg-emerald-50 p-4">
                    <span className="text-[10px] font-extrabold tracking-wider text-emerald-700">선택 결과</span>
                    <strong className="mt-2 block text-lg text-slate-900">{mapMetric?.label}</strong>
                    <strong className="mt-1 block text-3xl font-black text-emerald-800">{valueText(selectedValues[selectedMapMetric], mapMetric?.unit ?? '')}</strong>
                    <p className="mt-2 text-xs leading-5 text-slate-500">{selectedRegion?.name} · {selectedScenario} · {selectedYear}년</p>
                  </div>
                  <div className="mt-4 flex gap-4 border-t border-slate-100 pt-4 text-xs font-bold text-slate-600"><label className="flex items-center gap-2"><input type="checkbox" checked={maskSelectedRegion} onChange={(event) => setMaskSelectedRegion(event.target.checked)} />선택지역만</label><label className="flex items-center gap-2"><input type="checkbox" checked={showLegend} onChange={(event) => setShowLegend(event.target.checked)} />범례</label></div>
                </aside>

                <div className="space-y-4">
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"><ClimateProjectionMap region={selectedRegion} metric={mapMetric} value={selectedValues[selectedMapMetric]} valuesByRegion={mapValuesByRegion} min={mapRange.min} max={mapRange.max} scenario={selectedScenario} year={selectedYear} maskSelectedRegion={maskSelectedRegion} showThematicLayer showLegend={showLegend} /></div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div><p className="text-[11px] font-extrabold tracking-wider text-rose-700">03 · HEATWAVE RISK DATA CHECK</p><h3 className="mt-1 text-xl font-black">폭염 리스크 지표 파일·지도 검증</h3><p className="mt-1 text-xs text-slate-500">목록의 파일을 실제로 읽어 공간정보와 격자값을 검사합니다. 항목을 누르면 바로 옆 지도에서 확인할 수 있습니다.</p></div>
                  <div className="rounded-full bg-emerald-50 px-4 py-2 text-xs font-black text-emerald-700">{Object.values(riskLayerChecks).filter((check) => check.state === 'ready').length} / {HEATWAVE_RISK_INDICATORS.length} 지도 검증 완료</div>
                </div>
                <div className="mt-5 grid items-start gap-4 xl:grid-cols-[430px_minmax(0,1fr)]">
                  <div className="max-h-[620px] space-y-1.5 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-2">
                    {HEATWAVE_RISK_INDICATORS.map((indicator, index) => {
                      const check = riskLayerChecks[indicator.id];
                      const selected = selectedRiskIndicator.id === indicator.id;
                      const statusStyle = check?.state === 'ready' ? 'bg-emerald-100 text-emerald-800' : check?.state === 'checking' ? 'bg-blue-100 text-blue-700' : check?.state === 'missing' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-700';
                      const statusLabel = check?.state === 'ready' ? '지도 표시 가능' : check?.state === 'checking' ? '검사 중' : check?.state === 'missing' ? '결과 미구축' : check?.state === 'invalid' ? '형식 오류' : '파일 오류';
                      return <button key={indicator.id} type="button" aria-label={`${indicator.label} 지도 확인`} onClick={() => setSelectedRiskId(indicator.id)} disabled={check?.state === 'invalid' || check?.state === 'error'} className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${selected ? 'border-emerald-600 bg-white shadow-sm ring-1 ring-emerald-600' : 'border-slate-200 bg-white hover:border-emerald-300'} disabled:cursor-not-allowed disabled:opacity-60`}>
                        <div className="flex items-center gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-slate-900 text-[10px] font-black text-white">{index + 1}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><strong className="truncate text-sm text-slate-900"><span className="mr-2 text-[10px] text-slate-400">{indicator.dimension}</span>{indicator.label}</strong><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black ${statusStyle}`}>{statusLabel}</span></div><p className="mt-1 truncate text-[10px] text-slate-500">{indicator.sourceLabel ?? '기존 수원 100m 구축자료'} · {indicator.period} · {indicator.resolution}</p></div></div>
                      </button>;
                    })}
                  </div>
                  <div className="xl:sticky xl:top-4">
                    {selectedRiskIndicator.id === 'lst' && <div className="mb-2 rounded-xl border border-slate-200 bg-white p-2"><div className="grid grid-cols-5 gap-1">{[2021, 2022, 2023, 2024, 2025].map((year) => <button key={year} type="button" disabled aria-label={`지표면온도 ${year}년 파일 준비 중`} className="cursor-not-allowed rounded-lg bg-slate-100 px-2 py-2 text-xs font-black text-slate-400">{year}</button>)}</div><p className="mt-2 px-1 text-[10px] font-bold text-amber-700">현재 연결 지도는 2021~2025 5개년 평균입니다. 연도별 GEE GeoTIFF 5개를 다시 산출한 뒤 버튼을 활성화합니다.</p></div>}
                    {selectedRiskIndicator.dataKind === 'station' && <div className="mb-2 grid grid-cols-5 gap-1 rounded-xl border border-slate-200 bg-white p-2">{[2021, 2022, 2023, 2024, 2025].map((year) => <button key={year} type="button" aria-label={`관측연도 ${year}년`} onClick={() => setSelectedObservedYear(year)} className={`rounded-lg px-2 py-2 text-xs font-black ${selectedObservedYear === year ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-emerald-50'}`}>{year}</button>)}</div>}
                    <RiskGridMap indicator={selectedRiskIndicator} data={riskLayerMetadata} error={riskLayerError} selectedYear={selectedObservedYear} />
                    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4 text-xs"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-slate-900">{selectedRiskIndicator.label}</strong><span className="font-bold text-slate-500">{selectedRiskIndicator.sourceLabel ?? '기존 수원 100m 구축자료'}</span></div><p className="mt-2 leading-5 text-slate-600">{selectedRiskIndicator.description}</p>{selectedRiskIndicator.buildNote && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 font-bold leading-5 text-amber-900">{selectedRiskIndicator.buildNote}</p>}</div>
                    <div className="mt-3 grid gap-2 rounded-xl bg-slate-950 p-4 text-xs text-white sm:grid-cols-4"><div><span className="text-slate-500">구축 판정</span><strong className="mt-1 block text-emerald-300">{riskLayerChecks[selectedRiskIndicator.id]?.message}</strong></div><div><span className="text-slate-500">공간 기준</span><strong className="mt-1 block">{riskLayerMetadata && isObservedHeatData(riskLayerMetadata) ? '전국 ASOS 관측소' : `${riskLayerMetadata?.crs ?? '확인 중'} · ${riskLayerMetadata?.gridUnit ?? selectedRiskIndicator.resolution}`}</strong></div><div><span className="text-slate-500">자료 단위</span><strong className="mt-1 block">{riskLayerMetadata && isObservedHeatData(riskLayerMetadata) ? `${selectedObservedYear}년 · ${riskLayerMetadata.station_years.filter((row) => row.year === selectedObservedYear).length}개소` : `${riskLayerMetadata?.columns ?? '-'} × ${riskLayerMetadata?.rows ?? '-'} / ${riskLayerChecks[selectedRiskIndicator.id]?.validCells.toLocaleString() ?? '-'}셀`}</strong></div><div><span className="text-slate-500">파일 값</span><strong className="mt-1 block">{riskLayerMetadata && isObservedHeatData(riskLayerMetadata) ? '관측소 연도별 실측 집계' : riskLayerChecks[selectedRiskIndicator.id]?.hasRawValues ? '원시값 우선 표시' : '정규화/가공값 표시'}</strong></div></div>
                    <p className="mt-2 break-all px-1 text-[10px] text-slate-400">{selectedRiskIndicator.dataPath}</p>
                  </div>
                </div>
              </section>

              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[11px] font-extrabold tracking-wider text-blue-700">04 · TIME SERIES</p><h3 className="mt-1 text-lg font-black">{selectedRegion?.name} {mapMetric?.label} 변화</h3></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">선택 시점 {selectedYear}년</span></div>
                <div className="mt-4 h-[320px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={trendData} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}><CartesianGrid stroke="#e2e8f0" vertical={false} /><XAxis dataKey="year" stroke="#64748b" tickLine={false} axisLine={false} /><YAxis stroke="#64748b" tickLine={false} axisLine={false} unit={mapMetric?.unit} width={58} /><Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12 }} labelFormatter={(item) => `${item}년`} /><Legend />{catalog.scenarios.map((scenario) => <Line key={scenario} type="monotone" dataKey={scenario} stroke={SCENARIO_COLORS[scenario]} strokeWidth={scenario === selectedScenario ? 4 : 2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />)}</LineChart></ResponsiveContainer></div>
              </article>

              <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-xs leading-5 text-slate-500 shadow-sm"><strong className="text-slate-800">자료 안내</strong> · 2020년은 IC4 모형의 현재 비교 기준이며 실시간 관측값이 아닙니다. 지도는 약 1km 원자료를 시군구 단위로 평균한 값입니다. · {catalog.meta.source}</section>
            </div>
          )}
        </main>
      )}
    </div>
  );
}
