import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CalendarDays, CloudSun, Database, Droplets, Flame, MapPin, RefreshCw, Satellite, ThermometerSun, Wind } from 'lucide-react';
import { Link } from 'react-router';

type NetworkType = 'asos' | 'aws';
type ViewMode = 'stations' | 'heatmap';
type StationObservation = {
  observedAt: string;
  temperature: number | null;
  windDirection: number | null;
  windSpeed: number | null;
  rainfallDay: number | null;
  rainfallHour: number | null;
  humidity: number | null;
  stationPressure: number | null;
  seaLevelPressure: number | null;
};
type WeatherStation = {
  id: string;
  name: string;
  type: NetworkType;
  longitude: number;
  latitude: number;
  distanceKm: number;
  observation: StationObservation;
};
type NetworkResponse = {
  ok: boolean;
  type: NetworkType;
  radiusKm: number;
  observedAt: string;
  count: number;
  stations: WeatherStation[];
};
type ArchiveAvailability = {
  ok: boolean;
  minDate: string;
  maxDate: string;
  dateCount: number;
  availableDates: string[];
  hours: number[];
};
type LstCheck = {
  ok: boolean;
  date: string;
  statusCode: number;
  contentType?: string;
  contentLength?: number;
  disposition?: string;
};
type LstVerificationRecord = {
  dateKst: string;
  checkedAt: string;
  items: LstCheck[];
};
type LstGridCell = { latitude: number; longitude: number; temperatureC: number };
type LstGrid = {
  ok: boolean;
  date: string;
  gridSizeMeters: number;
  cells: LstGridCell[];
  minC: number;
  maxC: number;
  count: number;
};
type LstCatalogRecord = Omit<LstGrid, 'cells' | 'count'> & {
  dateKst: string;
  timeKst: string;
  file: string;
  totalCells: number;
  cloudCells: number;
  clearCells: number;
  unknownCells: number;
  cloudPercent: number;
  clearPercent: number;
  lstValidCells: number;
  lstCoveragePercent: number;
};
type LstCatalog = {
  generatedAt: string;
  count: number;
  records: LstCatalogRecord[];
};

const LEAFLET_CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const KMA_PROXY_URL = 'http://127.0.0.1:4176';
const LST_RECORD_KEY = 'livinglabs.weatherAnalysis.lstVerification.v1';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

async function fetchWeatherArchive(body: Record<string, unknown>) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('기상자료 저장소 설정이 없습니다.');
  const response = await fetch(`${SUPABASE_URL}/functions/v1/kma-weather-read`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || '저장자료 응답 오류');
  return result;
}

function loadScript(src: string, attribute: string) {
  const existing = document.querySelector<HTMLScriptElement>(`script[${attribute}="true"]`);
  if (existing) {
    if ((existing as any).dataset.loaded === 'true') return Promise.resolve();
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
  if (!(window as any).L) await loadScript(LEAFLET_JS_URL, 'data-weather-leaflet');
  const L = (window as any).L;
  return (window as any).L;
}

function formatObservedAt(value?: string) {
  if (!value || value.length !== 12) return '자료 확인 중';
  return `${value.slice(0, 4)}.${value.slice(4, 6)}.${value.slice(6, 8)} ${value.slice(8, 10)}:${value.slice(10, 12)} KST`;
}

function numberText(value: number | null | undefined, unit: string) {
  return value == null ? '—' : `${value.toFixed(1)}${unit}`;
}

function currentKstDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function kstSlotToUtc(dateKst: string, hour: number, minute: number) {
  const date = new Date(`${dateKst}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+09:00`);
  return date.toISOString().slice(0, 16).replace(/[-T:]/g, '');
}

function lstKstLabel(utcDate: string) {
  const date = new Date(Date.UTC(
    Number(utcDate.slice(0, 4)),
    Number(utcDate.slice(4, 6)) - 1,
    Number(utcDate.slice(6, 8)),
    Number(utcDate.slice(8, 10)),
    Number(utcDate.slice(10, 12)),
  ));
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function fileNameFromDisposition(disposition?: string) {
  return disposition?.match(/filename="([^"]+)"/)?.[1] || '';
}

function WeatherDataSourceCard({ children }: { children: ReactNode }) {
  return <section className="rounded-xl border border-sky-200 bg-white px-4 py-3 shadow-sm">{children}</section>;
}

function LstVerificationPanel({ onGridChange }: { onGridChange: (grid: LstGrid | null, loading: boolean, error?: string) => void }) {
  const [dateKst, setDateKst] = useState(currentKstDate);
  const [selectedTime, setSelectedTime] = useState('all');
  const [record, setRecord] = useState<LstVerificationRecord | null>(() => {
    try {
      const stored = window.localStorage.getItem(LST_RECORD_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');

  const selectLstTime = async (value: string) => {
    setSelectedTime(value);
    if (value === 'all') {
      onGridChange(null, false);
      setMessage('');
      return;
    }
    onGridChange(null, true);
    setMessage('선택한 LST를 지도에 표시하는 중입니다.');
    try {
      const response = await fetch(`${KMA_PROXY_URL}/kma-lst-grid?date=${value}`);
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || `LST 격자 변환 실패 (${response.status})`);
      onGridChange(result as LstGrid, false);
      setMessage(`${lstKstLabel(value)} LST ${Number(result.count).toLocaleString()}개 격자를 지도에 표시했습니다.`);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'LST 지도 레이어를 불러오지 못했습니다.';
      onGridChange(null, false, text);
      setMessage(text);
    }
  };

  const verify = async () => {
    setChecking(true);
    setMessage('');
    try {
      const slots = Array.from({ length: 13 }, (_, index) => {
        const totalMinutes = 12 * 60 + index * 10;
        return kstSlotToUtc(dateKst, Math.floor(totalMinutes / 60), totalMinutes % 60);
      });
      const items = await Promise.all(slots.map(async (date) => {
        const response = await fetch(`${KMA_PROXY_URL}/kma-lst-check?date=${date}`);
        const result = await response.json();
        return {
          ok: Boolean(response.ok && result.ok),
          date,
          statusCode: Number(result.statusCode || response.status),
          contentType: result.contentType,
          contentLength: result.contentLength,
          disposition: result.disposition,
        } as LstCheck;
      }));
      const nextRecord = { dateKst, checkedAt: new Date().toISOString(), items };
      setRecord(nextRecord);
      window.localStorage.setItem(LST_RECORD_KEY, JSON.stringify(nextRecord));
      setMessage(`${items.filter((item) => item.ok).length}/${items.length}개 시각의 LST 원본을 확인했습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'LST 자료를 확인하지 못했습니다.');
    } finally {
      setChecking(false);
    }
  };

  const displayItems = record?.dateKst === dateKst ? record.items : Array.from({ length: 13 }, (_, index) => {
    const totalMinutes = 12 * 60 + index * 10;
    return {
      ok: false,
      date: kstSlotToUtc(dateKst, Math.floor(totalMinutes / 60), totalMinutes % 60),
      statusCode: 0,
    };
  });
  const availableCount = displayItems.filter((item) => item.ok).length;
  const totalBytes = displayItems.reduce((sum, item) => sum + (item.ok ? Number(item.contentLength || 0) : 0), 0);
  const selectedItem = selectedTime === 'all'
    ? null
    : displayItems.find((item) => item.date === selectedTime) || null;

  return (
    <WeatherDataSourceCard>
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sky-600 text-white"><Satellite className="size-4" /></span>
        <div className="mr-auto min-w-[220px]">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h2 className="text-sm font-extrabold text-slate-950">천리안 2A LST 확보 기록</h2>
            <span className="text-[10px] font-bold text-slate-500">12:00~14:00 · 10분 · 2km NetCDF · 경기도 · 원본</span>
          </div>
          <p className="mt-0.5 text-[10px] text-slate-500">
            {record ? `최근 확인 ${new Date(record.checkedAt).toLocaleString('ko-KR')}` : '확인 기록 없음'}
          </p>
        </div>

        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
          날짜
          <input type="date" value={dateKst} onChange={(event) => { setDateKst(event.target.value); setSelectedTime('all'); }} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800" />
        </label>
        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
          시각
          <select value={selectedTime} onChange={(event) => void selectLstTime(event.target.value)} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800">
            <option value="all">전체 요약</option>
            {displayItems.map((item) => <option key={item.date} value={item.date}>{lstKstLabel(item.date)}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => void verify()} disabled={checking} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-sky-700 px-3 text-xs font-extrabold text-white hover:bg-sky-800 disabled:cursor-wait disabled:opacity-60">
          <RefreshCw className={`size-3.5 ${checking ? 'animate-spin' : ''}`} />
          {checking ? '확인 중' : '확인'}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 pt-3 text-xs">
        {selectedItem ? (
          <>
            <strong className="text-slate-950">{lstKstLabel(selectedItem.date)}</strong>
            <span className={selectedItem.ok ? 'font-extrabold text-emerald-700' : 'font-extrabold text-slate-500'}>
              {selectedItem.ok ? 'NETCDF 확보' : selectedItem.statusCode ? `HTTP ${selectedItem.statusCode}` : '확인 전'}
            </span>
            {selectedItem.ok && <span className="text-slate-500">{Math.round(Number(selectedItem.contentLength || 0) / 1024)}KB</span>}
            {selectedItem.ok && <span className="max-w-[420px] truncate text-[10px] text-slate-400">{fileNameFromDisposition(selectedItem.disposition)}</span>}
          </>
        ) : (
          <>
            <span className="font-extrabold text-emerald-700">확보 {availableCount}/13</span>
            <span className="flex items-center gap-1 text-slate-500"><Database className="size-3.5" />총 {(totalBytes / 1024 / 1024).toFixed(1)}MB</span>
            <span className="text-slate-500">KO 한반도 원본 확인</span>
          </>
        )}
        {message && <span className="ml-auto text-[11px] font-bold text-sky-700">{message}</span>}
      </div>
    </WeatherDataSourceCard>
  );
}

function LstCatalogPanel({ onGridChange }: { onGridChange: (grid: LstGrid | null, loading: boolean, error?: string) => void }) {
  const [catalog, setCatalog] = useState<LstCatalog | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<LstCatalogRecord | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/data/weather/lst/gyeonggi-catalog.json')
      .then((response) => {
        if (!response.ok) throw new Error('저운량 LST 목록을 불러오지 못했습니다.');
        return response.json();
      })
      .then((result) => setCatalog(result))
      .catch((error) => setMessage(error instanceof Error ? error.message : '저운량 LST 목록 오류'));
  }, []);

  const loadSnapshot = async (date: string) => {
    setSelectedDate(date);
    const record = catalog?.records.find((item) => item.date === date) || null;
    setSelectedRecord(record);
    if (!record) return;
    onGridChange(null, true);
    setMessage(`${record.dateKst} ${record.timeKst} 원본 LST를 지도에 표시하는 중입니다.`);
    try {
      const response = await fetch(record.file);
      const snapshot = await response.json();
      if (!response.ok || !snapshot.ok) throw new Error('저장된 LST 스냅샷을 불러오지 못했습니다.');
      onGridChange({ ...snapshot, count: snapshot.cells.length } as LstGrid, false);
      setMessage(`구름 ${record.cloudPercent}% · LST 유효 ${record.lstCoveragePercent}% · ${record.lstValidCells.toLocaleString()}개 격자`);
    } catch (error) {
      const text = error instanceof Error ? error.message : '저장된 LST 스냅샷 오류';
      onGridChange(null, false, text);
      setMessage(text);
    }
  };

  const cloudRange = catalog?.records.length
    ? `${Math.min(...catalog.records.map((record) => record.cloudPercent)).toFixed(1)}~${Math.max(...catalog.records.map((record) => record.cloudPercent)).toFixed(1)}%`
    : '—';

  return (
    <WeatherDataSourceCard>
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-indigo-600 text-white"><CloudSun className="size-4" /></span>
        <div className="mr-auto min-w-[240px]">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h2 className="text-sm font-extrabold text-slate-950">경기도 저운량 LST 원본 20건</h2>
            <span className="text-[10px] font-bold text-slate-500">CLD 선별 · 2026.05~07 · 2km · 로컬 스냅샷</span>
          </div>
          <p className="mt-0.5 text-[10px] text-slate-500">12·13·14시 구름탐지 비교 후 동일 시각 LST 결합</p>
        </div>
        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
          저장자료
          <select value={selectedDate} onChange={(event) => void loadSnapshot(event.target.value)} className="h-8 min-w-[260px] rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800">
            <option value="">저운량 LST 선택</option>
            {catalog?.records.map((record, index) => (
              <option key={record.date} value={record.date}>
                {String(index + 1).padStart(2, '0')} · {record.dateKst} {record.timeKst} · 구름 {record.cloudPercent}%
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 pt-3 text-xs">
        {selectedRecord ? (
          <>
            <strong className="text-slate-950">{selectedRecord.dateKst} {selectedRecord.timeKst}</strong>
            <span className="font-extrabold text-indigo-700">구름 {selectedRecord.cloudPercent}%</span>
            <span className="font-extrabold text-emerald-700">LST 유효 {selectedRecord.lstCoveragePercent}%</span>
            <span className="text-slate-500">{selectedRecord.minC.toFixed(1)}~{selectedRecord.maxC.toFixed(1)}℃</span>
          </>
        ) : (
          <>
            <span className="font-extrabold text-indigo-700">저장 {catalog?.count ?? 0}건</span>
            <span className="text-slate-500">구름비율 {cloudRange}</span>
            <span className="text-slate-500">원본 LST·CLD 처리 이력 포함</span>
          </>
        )}
        {message && <span className="ml-auto text-[11px] font-bold text-indigo-700">{message}</span>}
      </div>
    </WeatherDataSourceCard>
  );
}

function temperatureColor(value: number | null) {
  if (value == null) return '#64748b';
  if (value >= 33) return '#b91c1c';
  if (value >= 30) return '#ea580c';
  if (value >= 27) return '#f59e0b';
  if (value >= 24) return '#65a30d';
  return '#0284c7';
}

function idwColor(value: number, min: number, max: number) {
  const ratio = max === min ? 0.5 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  const hue = 220 - ratio * 220;
  return `hsl(${hue} 82% 49%)`;
}

function pointInRing(longitude: number, latitude: number, ring: number[][]) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[previous];
    if ((y1 > latitude) !== (y2 > latitude) && longitude < ((x2 - x1) * (latitude - y1)) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}

function pointInGeometry(longitude: number, latitude: number, geometry: any) {
  const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polygons.some((polygon: number[][][]) => pointInRing(longitude, latitude, polygon[0]) && !polygon.slice(1).some((hole) => pointInRing(longitude, latitude, hole)));
}

function pointInBoundary(longitude: number, latitude: number, boundary: any) {
  return boundary?.features?.some((feature: any) => pointInGeometry(longitude, latitude, feature.geometry)) ?? false;
}

function boundaryExtent(boundary: any): [number, number, number, number] {
  let minLongitude = Infinity;
  let minLatitude = Infinity;
  let maxLongitude = -Infinity;
  let maxLatitude = -Infinity;
  const visit = (coordinates: any) => {
    if (typeof coordinates?.[0] === 'number') {
      minLongitude = Math.min(minLongitude, coordinates[0]);
      maxLongitude = Math.max(maxLongitude, coordinates[0]);
      minLatitude = Math.min(minLatitude, coordinates[1]);
      maxLatitude = Math.max(maxLatitude, coordinates[1]);
      return;
    }
    coordinates?.forEach(visit);
  };
  boundary?.features?.forEach((feature: any) => visit(feature.geometry?.coordinates));
  return [minLongitude, minLatitude, maxLongitude, maxLatitude];
}

function interpolateIdw(latitude: number, longitude: number, stations: WeatherStation[]) {
  let weightedTemperature = 0;
  let weightSum = 0;
  for (const station of stations) {
    const temperature = station.observation.temperature;
    if (temperature == null) continue;
    const latitudeDistance = latitude - station.latitude;
    const longitudeDistance = (longitude - station.longitude) * Math.cos(latitude * Math.PI / 180);
    const distanceSquared = latitudeDistance * latitudeDistance + longitudeDistance * longitudeDistance;
    if (distanceSquared < 0.00000001) return temperature;
    const weight = 1 / distanceSquared;
    weightedTemperature += temperature * weight;
    weightSum += weight;
  }
  return weightSum ? weightedTemperature / weightSum : null;
}

function WeatherMap({ stations, networkType, viewMode, lstGrid, lstLoading }: { stations: WeatherStation[]; networkType: NetworkType; viewMode: ViewMode; lstGrid: LstGrid | null; lstLoading: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const dataLayerRef = useRef<any>(null);
  const boundaryRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const [heatRange, setHeatRange] = useState<{ min: number; max: number } | null>(null);

  useEffect(() => {
    let disposed = false;
    const setup = async () => {
      try {
        const L = await loadLeaflet();
        if (disposed || !containerRef.current || mapRef.current) return;
        const map = L.map(containerRef.current, { minZoom: 8 }).setView([37.2636, 127.0286], 11);
        mapRef.current = map;
        const base = L.tileLayer('https://xdworld.vworld.kr/2d/Base/service/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; VWorld' });
        const white = L.tileLayer('https://xdworld.vworld.kr/2d/white/service/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; VWorld' });
        const satellite = L.tileLayer('https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg', { maxZoom: 19, attribution: '&copy; VWorld' });
        base.addTo(map);
        L.control.layers({ 'VWorld 일반': base, 'VWorld 백지도': white, 'VWorld 위성': satellite }, undefined, { position: 'topright' }).addTo(map);
        const [gyeonggiResponse, suwonResponse] = await Promise.all([
          fetch('/data/gyeonggi-boundary.geojson'),
          fetch('/data/suwon-boundary.geojson'),
        ]);
        const [gyeonggiBoundary, suwonBoundary] = await Promise.all([
          gyeonggiResponse.json(),
          suwonResponse.json(),
        ]);
        boundaryRef.current = gyeonggiBoundary;
        L.geoJSON(gyeonggiBoundary, {
          style: { color: '#475569', weight: 1.2, opacity: 0.75, fillColor: '#e2e8f0', fillOpacity: 0.025 },
          onEachFeature: (feature: any, layer: any) => layer.bindTooltip(feature?.properties?.adm_nm || feature?.properties?.name || '경기도', { sticky: true }),
        }).addTo(map);
        L.geoJSON(suwonBoundary, {
          style: { color: '#047857', weight: 3, opacity: 0.95, fillColor: '#10b981', fillOpacity: 0.04 },
          onEachFeature: (_feature: any, layer: any) => layer.bindTooltip('수원시', { sticky: true }),
        }).addTo(map);
        setMapReady(true);
      } catch (error) {
        setMapError(error instanceof Error ? error.message : '지도를 불러오지 못했습니다.');
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
    if (!mapReady || !mapRef.current) return;
    const L = (window as any).L;
    if (dataLayerRef.current) mapRef.current.removeLayer(dataLayerRef.current);

    if (lstGrid?.cells.length && boundaryRef.current) {
      const group = L.layerGroup();
      const boundary = boundaryRef.current;
      const latitudeStep = lstGrid.gridSizeMeters / 111_320;
      const longitudeStep = lstGrid.gridSizeMeters / (111_320 * Math.cos(37.2636 * Math.PI / 180));
      const observedCells = lstGrid.cells.filter((cell) => pointInBoundary(cell.longitude, cell.latitude, boundary));
      const displayTemperatures = observedCells.map((cell) => cell.temperatureC);
      const displayMin = Math.min(...displayTemperatures);
      const displayMax = Math.max(...displayTemperatures);
      setHeatRange({ min: displayMin, max: displayMax });
      observedCells.forEach((cell) => {
        const color = idwColor(cell.temperatureC, displayMin, displayMax);
        L.rectangle([
          [cell.latitude - latitudeStep / 2, cell.longitude - longitudeStep / 2],
          [cell.latitude + latitudeStep / 2, cell.longitude + longitudeStep / 2],
        ], {
          color,
          weight: 0.25,
          opacity: 0.85,
          fillColor: color,
          fillOpacity: 0.82,
        }).bindTooltip(`지표면 온도 <b>${cell.temperatureC.toFixed(1)}°C</b><br/><span style="font-size:11px;color:#64748b">천리안 2A 원본 관측 격자</span>`).addTo(group);
      });
      dataLayerRef.current = group.addTo(mapRef.current);
    } else if (viewMode === 'heatmap' && boundaryRef.current && stations.length) {
      const group = L.layerGroup();
      const boundary = boundaryRef.current;
      const [minLongitude, minLatitude, maxLongitude, maxLatitude] = boundaryExtent(boundary);
      const cellSize = 0.003;
      const cells: Array<{ bounds: [[number, number], [number, number]]; temperature: number }> = [];
      for (let latitude = minLatitude; latitude < maxLatitude; latitude += cellSize) {
        for (let longitude = minLongitude; longitude < maxLongitude; longitude += cellSize) {
          const centerLatitude = latitude + cellSize / 2;
          const centerLongitude = longitude + cellSize / 2;
          if (!pointInBoundary(centerLongitude, centerLatitude, boundary)) continue;
          const temperature = interpolateIdw(centerLatitude, centerLongitude, stations);
          if (temperature == null) continue;
          cells.push({ bounds: [[latitude, longitude], [latitude + cellSize, longitude + cellSize]], temperature });
        }
      }
      const outputTemperatures = cells.map((cell) => cell.temperature);
      const outputMin = Math.min(...outputTemperatures);
      const outputMax = Math.max(...outputTemperatures);
      setHeatRange({ min: outputMin, max: outputMax });
      cells.forEach((cell) => {
        const color = idwColor(cell.temperature, outputMin, outputMax);
        L.rectangle(cell.bounds, {
          color,
          weight: 1,
          opacity: 0.88,
          fillColor: color,
          fillOpacity: 0.76,
          interactive: false,
        }).addTo(group);
      });
      dataLayerRef.current = group.addTo(mapRef.current);
    } else {
      setHeatRange(null);
      const group = L.layerGroup();
      stations.forEach((station) => {
        const temperature = station.observation.temperature;
        L.circleMarker([station.latitude, station.longitude], {
          radius: networkType === 'asos' ? 9 : 6,
          color: '#ffffff',
          weight: 2,
          fillColor: temperatureColor(temperature),
          fillOpacity: 0.95,
        }).bindPopup(`
          <div style="min-width:190px;line-height:1.65">
            <strong>${station.name} ${station.type.toUpperCase()} ${station.id}</strong><br/>
            기온 <b>${numberText(temperature, '℃')}</b> · 습도 <b>${numberText(station.observation.humidity, '%')}</b><br/>
            풍속 <b>${numberText(station.observation.windSpeed, 'm/s')}</b> · 시간강수 <b>${numberText(station.observation.rainfallHour, 'mm')}</b><br/>
            <span style="font-size:11px;color:#64748b">수원 중심 ${station.distanceKm.toFixed(1)}km</span>
          </div>
        `).addTo(group);
      });
      dataLayerRef.current = group.addTo(mapRef.current);
    }

    if (boundaryRef.current) {
      const [minLongitude, minLatitude, maxLongitude, maxLatitude] = boundaryExtent(boundaryRef.current);
      mapRef.current.fitBounds([[minLatitude, minLongitude], [maxLatitude, maxLongitude]], { padding: [24, 24], maxZoom: 12 });
    }
  }, [stations, networkType, viewMode, mapReady, lstGrid]);

  const heatMin = heatRange?.min ?? null;
  const heatMax = heatRange?.max ?? null;
  const heatMiddle = heatMin != null && heatMax != null ? (heatMin + heatMax) / 2 : null;

  return (
    <div className="relative h-full min-h-[680px] overflow-hidden bg-slate-100">
      <div ref={containerRef} className="absolute inset-0" />
      {mapError && <div className="absolute inset-0 z-[500] grid place-items-center bg-slate-100 p-6 text-sm font-bold text-slate-600">{mapError}</div>}
      {lstLoading && <div className="absolute inset-0 z-[600] grid place-items-center bg-slate-950/25"><div className="flex items-center gap-3 rounded-xl bg-white px-5 py-4 text-sm font-extrabold text-slate-800 shadow-2xl"><RefreshCw className="size-5 animate-spin text-sky-600" />LST 격자를 지도에 표시하는 중...</div></div>}
      {lstGrid && <div className="pointer-events-none absolute left-1/2 top-5 z-[500] -translate-x-1/2 rounded-xl border border-white/80 bg-slate-950/90 px-4 py-3 text-center text-white shadow-xl"><strong className="block text-sm">천리안 2A 지표면온도(LST)</strong><span className="mt-1 block text-[11px] text-slate-300">{lstKstLabel(lstGrid.date)} KST · 경기도 · 2km 원본 격자</span></div>}
      {!lstGrid && viewMode === 'heatmap' && <div className="pointer-events-none absolute left-1/2 top-5 z-[500] -translate-x-1/2 rounded-xl border border-white/80 bg-slate-950/90 px-4 py-3 text-center text-white shadow-xl"><strong className="block text-sm">AWS 기온 IDW 보간</strong><span className="mt-1 block text-[11px] text-slate-300">{formatObservedAt(stations[0]?.observation.observedAt)} · 입력 {stations.length}개 지점</span></div>}
      {(lstGrid || viewMode === 'heatmap') && <div className="pointer-events-none absolute bottom-5 right-5 z-[500] w-56 rounded-xl border border-white/80 bg-white/95 p-3 text-xs text-slate-700 shadow-xl"><div className="flex items-center justify-between"><strong>{lstGrid ? 'LST 범례' : '기온 범례'}</strong><span className="text-[10px] text-slate-500">{lstGrid ? '원본 관측값' : '수원시 내부 추정값'}</span></div><div className="mt-2 h-3 rounded-full border border-white shadow-inner" style={{ background: 'linear-gradient(90deg, hsl(220 82% 49%), hsl(165 82% 49%), hsl(110 82% 49%), hsl(55 82% 49%), hsl(0 82% 49%))' }} /><div className="mt-1 flex justify-between font-extrabold"><span>{heatMin == null ? '—' : `${heatMin.toFixed(1)}℃`}</span><span>{heatMiddle == null ? '—' : `${heatMiddle.toFixed(1)}℃`}</span><span>{heatMax == null ? '—' : `${heatMax.toFixed(1)}℃`}</span></div><div className="mt-1 flex justify-between text-[9px] text-slate-400"><span>낮음</span><span>중간</span><span>높음</span></div></div>}
      <div className="pointer-events-none absolute bottom-5 left-5 z-[500] rounded-lg border border-white/80 bg-white/95 px-3 py-2 text-xs font-bold text-slate-700 shadow-lg">
        {viewMode === 'stations' ? <><span className="flex items-center gap-2"><i className="size-3 rounded-full border-2 border-white bg-orange-500 shadow" />{networkType.toUpperCase()} 관측점</span><span className="mt-2 flex items-center gap-2"><i className="h-3 w-5 rounded-sm border-2 border-emerald-700 bg-emerald-500/10" />수원시 구 경계</span></> : <><span className="flex items-center gap-2"><Flame className="size-4 text-orange-600" />AWS 기온 IDW 보간</span><span className="mt-1 block text-[10px] font-medium text-slate-500">주변 AWS 입력 · 수원 내부 색상 정규화</span></>}
      </div>
    </div>
  );
}

export function WeatherAnalysisPage() {
  const [activeType, setActiveType] = useState<NetworkType>('aws');
  const [viewMode, setViewMode] = useState<ViewMode>('heatmap');
  const [networks, setNetworks] = useState<Partial<Record<NetworkType, NetworkResponse>>>({});
  const [availability, setAvailability] = useState<ArchiveAvailability | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedHour, setSelectedHour] = useState(15);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lstGrid, setLstGrid] = useState<LstGrid | null>(null);
  const [lstLoading, setLstLoading] = useState(false);
  const [lstError, setLstError] = useState('');

  const handleLstGridChange = (grid: LstGrid | null, isLoading: boolean, gridError = '') => {
    setLstGrid(grid);
    setLstLoading(isLoading);
    setLstError(gridError);
  };

  const loadAsos = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/kma-network?type=asos&radiusKm=35');
      if (!response.ok) throw new Error('ASOS 관측망 응답 오류');
      const asos = await response.json();
      setNetworks((current) => ({ ...current, asos }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'ASOS 관측망을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const loadArchive = async (date: string, hour: number) => {
    if (!date) return;
    setLoading(true);
    setError('');
    try {
      const aws = await fetchWeatherArchive({ action: 'map', date, hour });
      setNetworks((current) => ({ ...current, aws }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '저장된 AWS 자료를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadAvailability = async () => {
      setLoading(true);
      try {
        const result = await fetchWeatherArchive({ action: 'availability' }) as ArchiveAvailability;
        setAvailability(result);
        setSelectedDate(result.maxDate);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : '저장자료 기간을 확인하지 못했습니다.');
        setLoading(false);
      }
    };
    void loadAvailability();
  }, []);

  useEffect(() => {
    if (selectedDate) void loadArchive(selectedDate, selectedHour);
  }, [selectedDate, selectedHour]);

  const selectNetwork = (type: NetworkType) => {
    setActiveType(type);
    if (type === 'asos') {
      setViewMode('stations');
      if (!networks.asos) void loadAsos();
    } else {
      setViewMode('heatmap');
      if (!networks.aws && selectedDate) void loadArchive(selectedDate, selectedHour);
    }
  };

  const refresh = () => activeType === 'aws' ? loadArchive(selectedDate, selectedHour) : loadAsos();
  const activeNetwork = networks[activeType];
  const stations = activeNetwork?.stations ?? [];
  const temperatureRange = useMemo(() => {
    const values = stations.map((station) => station.observation.temperature).filter((value): value is number => value != null);
    return values.length ? `${Math.min(...values).toFixed(1)}–${Math.max(...values).toFixed(1)}℃` : '—';
  }, [stations]);
  const [selectedYear = '', selectedMonth = '', selectedDay = ''] = selectedDate.split('-');
  const availableYears = useMemo(() => [...new Set((availability?.availableDates ?? []).map((date) => date.slice(0, 4)))].sort().reverse(), [availability]);
  const availableMonths = useMemo(() => [...new Set((availability?.availableDates ?? []).filter((date) => date.startsWith(`${selectedYear}-`)).map((date) => date.slice(5, 7)))].sort(), [availability, selectedYear]);
  const availableDays = useMemo(() => (availability?.availableDates ?? []).filter((date) => date.startsWith(`${selectedYear}-${selectedMonth}-`)).map((date) => date.slice(8, 10)), [availability, selectedYear, selectedMonth]);

  const selectYear = (year: string) => {
    const candidates = (availability?.availableDates ?? []).filter((date) => date.startsWith(`${year}-`));
    if (candidates.length) setSelectedDate(candidates[candidates.length - 1]);
  };
  const selectMonth = (month: string) => {
    const candidates = (availability?.availableDates ?? []).filter((date) => date.startsWith(`${selectedYear}-${month}-`));
    if (candidates.length) setSelectedDate(candidates[candidates.length - 1]);
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      <main className="flex-1">
        <div className="border-b border-slate-200 bg-white">
          <div className="container mx-auto flex flex-wrap items-center justify-between gap-4 px-4 py-5">
            <div className="flex items-center gap-4">
              <Link to="/tools" aria-label="지원도구로 돌아가기" className="grid size-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><ArrowLeft className="size-4" /></Link>
              <div><h1 className="text-2xl font-extrabold tracking-tight text-slate-950">기상데이터 분석</h1><p className="mt-1 text-sm text-slate-500">2020~2026 여름철 저장자료 · 수원 중심 35km AWS 보간</p></div>
            </div>
            <div className="flex items-center gap-3">
              {activeType === 'aws' && availability && <span className="hidden rounded-full bg-blue-50 px-3 py-2 text-xs font-extrabold text-blue-700 sm:inline">저장자료 {availability.dateCount}일</span>}
              <span className={`flex items-center gap-2 rounded-full px-3 py-2 text-xs font-extrabold ${error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}><i className={`size-2 rounded-full ${error ? 'bg-rose-500' : 'bg-emerald-500'}`} />{loading ? '자료 불러오는 중' : error ? '자료 없음' : `${stations.length}개 관측소`}</span>
              <button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"><RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />새로고침</button>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-5">
          <div className="mb-4 space-y-3" aria-label="기상 데이터 확보 목록">
            <LstVerificationPanel onGridChange={handleLstGridChange} />
            <LstCatalogPanel onGridChange={handleLstGridChange} />
          </div>
          {lstError && <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">{lstError}</div>}
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              {(['asos', 'aws'] as NetworkType[]).map((type) => (
                <button key={type} type="button" onClick={() => selectNetwork(type)} className={`rounded-lg px-5 py-2.5 text-sm font-extrabold transition ${activeType === type ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{type.toUpperCase()} <span className="ml-1 opacity-60">{networks[type]?.count ?? 0}</span></button>
              ))}
            </div>

            {activeType === 'aws' && availability && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
              <div className="flex items-center gap-1.5 pl-2 text-xs font-extrabold text-slate-600"><CalendarDays className="mr-1 size-4 text-blue-600" /><span className="sr-only">날짜 선택</span>
                <label><span className="sr-only">연도</span><select aria-label="연도" value={selectedYear} onChange={(event) => selectYear(event.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm font-bold text-slate-800 outline-none focus:border-blue-500">{availableYears.map((year) => <option key={year} value={year}>{year}년</option>)}</select></label>
                <label><span className="sr-only">월</span><select aria-label="월" value={selectedMonth} onChange={(event) => selectMonth(event.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm font-bold text-slate-800 outline-none focus:border-blue-500">{availableMonths.map((month) => <option key={month} value={month}>{Number(month)}월</option>)}</select></label>
                <label><span className="sr-only">일</span><select aria-label="일" value={selectedDay} onChange={(event) => setSelectedDate(`${selectedYear}-${selectedMonth}-${event.target.value}`)} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm font-bold text-slate-800 outline-none focus:border-blue-500">{availableDays.map((day) => <option key={day} value={day}>{Number(day)}일</option>)}</select></label>
              </div>
              <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
                {availability.hours.map((hour) => <button key={hour} type="button" onClick={() => setSelectedHour(hour)} className={`rounded-md px-3 py-1.5 text-xs font-extrabold ${selectedHour === hour ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}>{hour}시</button>)}
              </div>
              <button type="button" onClick={() => { setSelectedDate(availability.maxDate); setSelectedHour(15); }} className="rounded-lg px-3 py-2 text-xs font-extrabold text-blue-700 hover:bg-blue-50">최신 저장자료</button>
            </div>}

            <div className="ml-auto inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              <button type="button" onClick={() => setViewMode('stations')} className={`rounded-lg px-4 py-2 text-sm font-bold ${viewMode === 'stations' ? 'bg-emerald-700 text-white' : 'text-slate-600'}`}><MapPin className="mr-1.5 inline size-4" />관측점</button>
              <button type="button" onClick={() => { setActiveType('aws'); setViewMode('heatmap'); }} className={`rounded-lg px-4 py-2 text-sm font-bold ${viewMode === 'heatmap' ? 'bg-orange-600 text-white' : 'text-slate-600'}`}><Flame className="mr-1.5 inline size-4" />보간지도</button>
            </div>
          </div>

          <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:grid-cols-[minmax(0,1fr)_380px]">
            <WeatherMap stations={stations} networkType={activeType} viewMode={viewMode} lstGrid={lstGrid} lstLoading={lstLoading} />
            <aside className="border-t border-slate-200 bg-white xl:border-l xl:border-t-0">
              <div className="border-b border-slate-200 p-5">
                <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-extrabold tracking-wider text-emerald-700">{activeType === 'aws' ? 'ARCHIVED AWS' : 'LIVE ASOS'}</p><h2 className="mt-1 text-xl font-extrabold text-slate-950">수원 주변 관측소</h2></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">반경 35km</span></div>
                <div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-lg bg-slate-50 p-3"><span className="block text-[11px] font-bold text-slate-500">분석 관측소</span><strong className="mt-1 block text-lg text-slate-950">{stations.length}개</strong></div><div className="rounded-lg bg-slate-50 p-3"><span className="block text-[11px] font-bold text-slate-500">기온 범위</span><strong className="mt-1 block text-lg text-slate-950">{temperatureRange}</strong></div></div>
                <p className="mt-3 text-xs font-bold text-slate-500">관측시각 {formatObservedAt(activeNetwork?.observedAt)}</p>
              </div>

              {error ? <div className="m-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : (
                <div className="max-h-[520px] divide-y divide-slate-100 overflow-y-auto">
                  {stations.map((station) => (
                    <div key={station.id} className="px-5 py-3.5 hover:bg-slate-50">
                      <div className="flex items-start justify-between gap-3"><div><strong className="text-sm text-slate-950">{station.name}</strong><span className="ml-2 text-[11px] font-bold text-slate-400">{station.id}</span></div><strong className="text-base" style={{ color: temperatureColor(station.observation.temperature) }}>{numberText(station.observation.temperature, '℃')}</strong></div>
                      <div className="mt-2 flex items-center gap-4 text-xs text-slate-500"><span><Droplets className="mr-1 inline size-3" />{numberText(station.observation.humidity, '%')}</span><span><Wind className="mr-1 inline size-3" />{numberText(station.observation.windSpeed, 'm/s')}</span><span>{station.distanceKm.toFixed(1)}km</span></div>
                    </div>
                  ))}
                  {!loading && !stations.length && <div className="p-8 text-center text-sm text-slate-500">선택한 시각의 유효 관측자료가 없습니다.</div>}
                </div>
              )}
              <div className="border-t border-slate-200 p-4 text-[11px] leading-5 text-slate-500"><ThermometerSun className="mr-1 inline size-3" />품질검사를 통과한 AWS 관측값을 거리 역제곱으로 가중하여 수원시 경계 내부 약 300m 격자에 보간합니다. 색상 범례는 선택 시각의 수원 내부 추정값으로 다시 계산됩니다.</div>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
