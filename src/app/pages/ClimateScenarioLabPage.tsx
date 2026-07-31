import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  CloudSun,
  Database,
  FlaskConical,
  Layers3,
  MapPinned,
  Satellite,
  ThermometerSun,
} from 'lucide-react';
import { Link } from 'react-router';
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

const DATA_URL = '/data/climate/ic4-admin-projections.json?v=20260731-current-baseline';
const BOUNDARY_URL = '/data/climate/admin-boundaries.geojson';
const LEAFLET_CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const SCENARIO_COLORS: Record<string, string> = {
  RCP26: '#10b981',
  RCP45: '#3b82f6',
  RCP60: '#f59e0b',
  RCP85: '#ef4444',
};
const FEATURED_METRICS = ['TA', 'HW33', 'TR25', 'SU25', 'TXx', 'TNx'];

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
        const featureValue = valuesByRegion.get(String(feature?.properties?.code ?? ''));
        return {
          color: '#ffffff',
          weight: 0.7,
          opacity: 0.8,
          fillColor: colorForValue(featureValue, min, max),
          fillOpacity: featureValue == null ? 0.12 : 0.72,
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
  }, [ready, region, metric, value, valuesByRegion, min, max, scenario, year]);

  return (
    <div className="relative h-[620px] overflow-hidden rounded-2xl bg-slate-200 lg:h-[690px]">
      <div ref={containerRef} className="absolute inset-0" />
      {error && <div className="absolute inset-0 z-[600] grid place-items-center bg-slate-100 p-6 text-sm font-bold text-slate-600">{error}</div>}
      <div className="pointer-events-none absolute left-5 top-5 z-[500] max-w-[280px] rounded-2xl border border-white/80 bg-slate-950/90 p-4 text-white shadow-xl backdrop-blur">
        <div className="flex items-center gap-2 text-[11px] font-extrabold tracking-wider text-emerald-300"><MapPinned className="size-4" />선택 행정구역</div>
        <strong className="mt-2 block text-lg">{region?.name}</strong>
        <span className="mt-1 block text-xs text-slate-300">{scenario} · {year}년 · 약 1km 격자 {region?.cellCount.toLocaleString()}개</span>
      </div>
      <div className="pointer-events-none absolute bottom-5 right-5 z-[500] w-56 rounded-2xl border border-white/80 bg-white/95 p-4 text-slate-800 shadow-xl">
        <div className="flex items-center justify-between gap-3 text-xs"><strong>{metric?.label}</strong><span className="text-slate-500">전국 시군구 분포</span></div>
        <strong className="mt-2 block text-xl">{valueText(value, metric?.unit ?? '')}</strong>
        <div className="mt-3 h-2.5 rounded-full" style={{ background: 'linear-gradient(90deg,hsl(215 82% 50%),hsl(110 82% 50%),hsl(5 82% 50%))' }} />
        <div className="mt-1 flex justify-between text-[10px] font-bold text-slate-500"><span>{valueText(min, metric?.unit ?? '')}</span><span>{valueText(max, metric?.unit ?? '')}</span></div>
      </div>
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
  const [selectedChartMetric, setSelectedChartMetric] = useState('TA');

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
  const chartMetric = metricByCode.get(selectedChartMetric);
  const trendData = useMemo(
    () => (catalog?.periods ?? []).map((period) => ({
      year: period.targetYear,
      ...Object.fromEntries((catalog?.scenarios ?? []).map((scenario) => [
        scenario,
        catalog?.data[selectedRegionCode]?.[scenario]?.[String(period.targetYear)]?.[selectedChartMetric] ?? null,
      ])),
    })),
    [catalog, selectedChartMetric, selectedRegionCode],
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
            <>
              <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
                  <label className="text-xs font-bold text-slate-500">시도<select aria-label="시도" value={selectedSido} onChange={(event) => changeSido(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-900">{sidoOptions.map((sido) => <option key={sido}>{sido}</option>)}</select></label>
                  <label className="text-xs font-bold text-slate-500">시군구<select aria-label="시군구" value={selectedRegionCode} onChange={(event) => setSelectedRegionCode(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-900">{regionOptions.map((region) => <option key={region.code} value={region.code}>{shortRegionName(region)}</option>)}</select></label>
                  <label className="text-xs font-bold text-slate-500">배출 시나리오<select aria-label="배출 시나리오" value={selectedScenario} onChange={(event) => setSelectedScenario(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-900">{catalog.scenarios.map((scenario) => <option key={scenario}>{scenario}</option>)}</select></label>
                  <label className="text-xs font-bold text-slate-500">분석시점<select aria-label="분석시점" value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-900">{catalog.periods.map((period) => <option key={period.targetYear} value={period.targetYear}>{period.targetYear === 2020 ? '2020년 · 현재 기준' : `${period.targetYear}년 · 미래`}</option>)}</select></label>
                  <label className="text-xs font-bold text-slate-500">지도 표시지표<select aria-label="지도 표시지표" value={selectedMapMetric} onChange={(event) => setSelectedMapMetric(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-900">{catalog.metrics.map((metric) => <option key={metric.code} value={metric.code}>{metric.label}</option>)}</select></label>
                </div>
              </section>

              <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
                <ClimateProjectionMap region={selectedRegion} metric={mapMetric} value={selectedValues[selectedMapMetric]} valuesByRegion={mapValuesByRegion} min={mapRange.min} max={mapRange.max} scenario={selectedScenario} year={selectedYear} />
                <aside className="grid content-start gap-3">
                  <div className="rounded-2xl bg-gradient-to-br from-emerald-950 to-slate-900 p-5 text-white shadow-lg">
                    <p className="flex items-center gap-2 text-xs font-extrabold tracking-wider text-emerald-300"><Layers3 className="size-4" />IC4 미래전망</p>
                    <h2 className="mt-2 text-xl font-black">{selectedRegion?.name}</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-300">행정구역 코드 {selectedRegion?.code}<br />{selectedScenario} · {selectedYear}년</p>
                  </div>
                  {FEATURED_METRICS.map((code) => {
                    const metric = metricByCode.get(code);
                    if (!metric) return null;
                    return <article key={code} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-500">{metric.label}</span><ThermometerSun className="size-4 text-orange-500" /></div><strong className="mt-2 block text-xl font-black">{valueText(selectedValues[code], metric.unit)}</strong></article>;
                  })}
                </aside>
              </section>

              <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,.65fr)]">
                <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-extrabold tracking-wider text-blue-700">TIME SERIES</p><h3 className="mt-1 text-lg font-black">현재 기준~2100년 시나리오별 변화</h3></div><label className="text-xs font-bold text-slate-500">비교 지표<select aria-label="비교 지표" value={selectedChartMetric} onChange={(event) => setSelectedChartMetric(event.target.value)} className="ml-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900">{catalog.metrics.map((metric) => <option key={metric.code} value={metric.code}>{metric.label}</option>)}</select></label></div>
                  <div className="mt-4 h-[340px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={trendData} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}><CartesianGrid stroke="#e2e8f0" vertical={false} /><XAxis dataKey="year" stroke="#64748b" tickLine={false} axisLine={false} /><YAxis stroke="#64748b" tickLine={false} axisLine={false} unit={chartMetric?.unit} width={58} /><Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12 }} labelFormatter={(item) => `${item}년`} /><Legend />{catalog.scenarios.map((scenario) => <Line key={scenario} type="monotone" dataKey={scenario} stroke={SCENARIO_COLORS[scenario]} strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />)}</LineChart></ResponsiveContainer></div>
                </article>
                <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 p-5"><p className="text-xs font-extrabold tracking-wider text-amber-600">ALL INDICATORS</p><h3 className="mt-1 text-lg font-black">{selectedYear}년 전체 전망정보</h3></div><div className="max-h-[385px] overflow-y-auto">{catalog.metrics.map((metric) => <div key={metric.code} className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-3 last:border-0"><div><strong className="block text-sm">{metric.label}</strong><span className="text-[11px] text-slate-400">{metric.code} · {metric.frequency === 'monthly' ? '월자료 기반' : '연지수'}</span></div><strong className="text-sm">{valueText(selectedValues[metric.code], metric.unit)}</strong></div>)}</div></article>
              </section>

              <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-500 shadow-sm"><div className="flex items-start gap-3"><Database className="mt-1 size-5 shrink-0 text-emerald-600" /><div><strong className="text-slate-800">자료 해석 안내</strong><p className="mt-1">이 화면은 장기 기후전망을 행정구역별로 탐색하는 실험입니다. 2020년은 IC4 모형자료의 현재 비교 기준이며 실시간 관측값은 아닙니다. 지도 색은 각 시군구에 포함된 약 1km 격자의 평균값을 나타냅니다.</p><p className="mt-1 text-xs">{catalog.meta.source} · 생성 {new Date(catalog.meta.generatedAt).toLocaleString('ko-KR')}</p></div></div></section>
            </>
          )}
        </main>
      )}
    </div>
  );
}
