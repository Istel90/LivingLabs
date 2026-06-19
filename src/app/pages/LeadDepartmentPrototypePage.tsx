import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  ChevronLeft,
  Database,
  Eye,
  Layers,
  MapPin,
  MousePointer2,
  PanelRightOpen,
  Route,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  createVWorldWmsOptions,
  hasVWorldApiKey,
  VWORLD_WMS_LAYERS,
  VWORLD_WMS_URL,
} from '../../../shared/map/vworld.js';
import SIGUNGU_BOUNDARY_GEOJSON from '../../../shared/data/administrative-regions/boundaries/sigungu.geojson?raw';
import DOWNLOADS_SIGUNGU_BOUNDARIES from '../../../shared/data/administrative-regions/boundaries/downloads-sigungu-boundaries.json?raw';
import {
  getLeadDepartmentGateway,
  type LeadDepartmentRisk,
  type LeadDepartmentScenario,
  type LeadDepartmentScenarioPlan,
  type LeadDepartmentSnapshot,
} from '../lib/adapters/leadDepartmentData';

type LeafletGlobal = any;
type LayerVisibility = Record<string, boolean>;
type RightMode = 'overall' | 'sector' | 'execution';
type EditMode = 'none' | 'add' | 'remove';
type BaseMapId = 'vworld-base' | 'vworld-white' | 'vworld-satellite' | 'osm';
type GeoJsonFeature = {
  type: 'Feature';
  properties?: Record<string, string>;
  geometry?: {
    type: string;
    coordinates: unknown;
  };
};

declare global {
  interface Window {
    L?: LeafletGlobal;
  }
}

const LEAFLET_CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

const statusLabels: Record<LeadDepartmentScenario['status'], string> = {
  draft: '검토중',
  active: '진행중',
  completed: '완료',
};

const sectors = [
  { title: '건강', disabled: false, children: ['가로수', '그늘막'] },
  { title: '교육/홍보', disabled: true, children: [] },
  { title: '국토/연안', disabled: true, children: [] },
  { title: '기후감시예측', disabled: true, children: [] },
  { title: '물관리', disabled: false, children: ['배수시설'] },
  { title: '산림/생태계', disabled: true, children: [] },
  { title: '산업/에너지', disabled: true, children: [] },
  { title: '인프라/국제협력', disabled: true, children: [] },
  { title: '재난/재해', disabled: true, children: [] },
  { title: '적응기반', disabled: true, children: [] },
  { title: '해양/수산', disabled: true, children: [] },
];

const scenarioList = ['기준연도', '2030 저성장', '2030 기준성장', '2030 고성장'];
const scenarioUpList = ['2026년도 증가', '2027년도 증가', '2028년도 증가', '2029년도 증가', '2030년도 증가'];
const yearList = ['2026', '2027', '2028', '2029', '2030'];

const baseMapOptions: { id: BaseMapId; label: string }[] = [
  { id: 'vworld-base', label: '일반' },
  { id: 'vworld-white', label: '백지도' },
  { id: 'vworld-satellite', label: '위성' },
  { id: 'osm', label: 'OSM' },
];

const yearColors: Record<string, string> = {
  '2026': '#f9c00c',
  '2027': '#00b9f1',
  '2028': '#7200da',
  '2029': '#f9320c',
  '2030': '#00c853',
};

const localBoundaryFeatures: GeoJsonFeature[] = parseLocalBoundaryFeatures();
const downloadedSigunguBoundaries = parseDownloadedSigunguBoundaryFeatures();

export function LeadDepartmentPrototypePage() {
  const gateway = useMemo(() => getLeadDepartmentGateway(), []);
  const [snapshot, setSnapshot] = useState<LeadDepartmentSnapshot | null>(null);
  const [selectedSido, setSelectedSido] = useState('11');
  const [selectedSgg, setSelectedSgg] = useState('11230');
  const [selectedSector, setSelectedSector] = useState('건강');
  const [selectedBusiness, setSelectedBusiness] = useState('가로수');
  const [selectedScenario, setSelectedScenario] = useState('기준연도');
  const [selectedScenarioUp, setSelectedScenarioUp] = useState('2026년도 증가');
  const [selectedYear, setSelectedYear] = useState('2026');
  const [selectedRisk, setSelectedRisk] = useState('폭염으로 인한 건강 취약계층 피해');
  const [rightMode, setRightMode] = useState<RightMode>('overall');
  const [editMode, setEditMode] = useState<EditMode>('none');
  const [baseMap, setBaseMap] = useState<BaseMapId>('vworld-base');
  const [riskDialogOpen, setRiskDialogOpen] = useState(false);
  const [riskScope, setRiskScope] = useState<'local' | 'national'>('local');
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>({});
  const [plans, setPlans] = useState<LeadDepartmentScenarioPlan[]>([]);

  useEffect(() => {
    gateway.getSnapshot(selectedSgg).then((result) => {
      setSnapshot(result);
      setLayerVisibility(Object.fromEntries(result.layers.map((layer) => [layer.id, layer.enabled])));
      setPlans(result.scenarioPlans);
      const firstLocalRisk = result.risks.find((risk) => risk.admCode === selectedSgg) ?? result.risks[0];
      setSelectedRisk(firstLocalRisk.riskName);
    });
  }, [gateway, selectedSgg]);

  const availableSidos = useMemo(() => {
    if (!snapshot) return [];
    return Array.from(new Map(snapshot.regions.map((region) => [region.sidoCode, region.sidoName])).entries());
  }, [snapshot]);

  const availableSggs = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.regions.filter((region) => region.sidoCode === selectedSido);
  }, [snapshot, selectedSido]);

  const businessOptions = useMemo(() => {
    return sectors.find((sector) => sector.title === selectedSector)?.children ?? [];
  }, [selectedSector]);

  const filteredPlans = useMemo(() => {
    return plans.filter((plan) => plan.sector === selectedSector && plan.business === selectedBusiness && plan.scenario === selectedScenario);
  }, [plans, selectedBusiness, selectedScenario, selectedSector]);

  const riskItems = useMemo(() => {
    if (!snapshot) return [];
    const local = snapshot.risks.filter((risk) => risk.admCode === selectedSgg);
    return riskScope === 'local' && local.length > 0
      ? local
      : snapshot.risks.filter((risk) => risk.scope === 'national');
  }, [riskScope, selectedSgg, snapshot]);

  const sectorScoreChart = useMemo(() => {
    if (!snapshot) return [];
    return yearList.map((year) => {
      const byScenario: Record<string, number | string> = { year };
      scenarioUpList.forEach((scenarioUp) => {
        const items = snapshot.sectorScores.filter((score) => {
          return score.year === year && score.scenarioUp === scenarioUp && score.sector === selectedSector && score.kind === '적응효과';
        });
        byScenario[scenarioUp] = average(items.map((item) => item.value));
      });
      return byScenario;
    });
  }, [selectedSector, snapshot]);

  const scenarioMatrix = useMemo(() => {
    return scenarioUpList.map((scenarioUp) => ({
      scenarioUp,
      values: yearList.map((year) => {
        const matched = plans.filter((plan) => {
          return plan.business === selectedBusiness && plan.scenarioUp === scenarioUp && plan.year === year;
        });
        return {
          year,
          goal: sum(matched.map((plan) => plan.goal)),
          count: sum(matched.map((plan) => plan.count || 1)),
        };
      }),
    }));
  }, [plans, selectedBusiness]);

  const selectedRegionName = snapshot?.region.name ?? '';
  const selectedSggName = snapshot?.region.sggName ?? '';

  const handleSidoChange = (sidoCode: string) => {
    setSelectedSido(sidoCode);
    const firstSgg = snapshot?.regions.find((region) => region.sidoCode === sidoCode);
    if (firstSgg) setSelectedSgg(firstSgg.sggCode);
  };

  const handleSectorChange = (sectorTitle: string) => {
    setSelectedSector(sectorTitle);
    const nextBusiness = sectors.find((sector) => sector.title === sectorTitle)?.children[0] ?? '';
    setSelectedBusiness(nextBusiness);
  };

  const toggleLayer = (layerId: string) => {
    setLayerVisibility((current) => ({ ...current, [layerId]: !current[layerId] }));
  };

  const savePendingPlans = () => {
    setPlans((current) => current.map((plan) => plan.status === 'pending' ? { ...plan, status: 'saved' } : plan));
    setEditMode('none');
  };

  const cancelPendingPlans = () => {
    setPlans((current) => current.filter((plan) => plan.status !== 'pending'));
    setEditMode('none');
  };

  if (!snapshot) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#10233f] text-white">
        <p className="rounded-2xl bg-white/10 px-5 py-3 font-bold">주관부서 지원도구를 불러오는 중입니다.</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#10233f] text-slate-900">
      <header className="flex h-14 items-center justify-between bg-[#233447] px-5 text-white shadow-xl shadow-slate-950/25">
        <div className="flex items-center gap-3">
          <Link to="/tools#adaptation-support-tools" className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-slate-100">
            <ChevronLeft className="size-4" />
            지원도구 페이지로 돌아가기
          </Link>
          <div className="grid size-9 place-items-center rounded-xl bg-emerald-400/20 text-emerald-100">
            <Route className="size-5" />
          </div>
          <div>
            <strong className="block text-sm">주관부서 적응대책 지원도구</strong>
            <span className="text-xs text-slate-300">원본 Java/PostGIS 도구 흐름을 정적 시연 형태로 구현</span>
          </div>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-bold text-slate-200 md:flex">
          <Database className="size-4 text-emerald-200" />
          Java API / Supabase 교체 가능 구조
        </div>
      </header>

      <div className="grid h-[calc(100vh-56px)] grid-cols-[286px_minmax(560px,1fr)_420px] gap-1 p-1">
        <aside className="overflow-auto rounded-lg bg-[#f4f5f6] p-4 shadow-lg">
          <h1 className="text-lg font-extrabold text-slate-900">세부 사업리스트</h1>

          <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-extrabold">1. 지역</h2>
            <label className="mt-3 block text-xs font-bold text-slate-600">
              시도
              <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold" value={selectedSido} onChange={(event) => handleSidoChange(event.target.value)}>
                {availableSidos.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select>
            </label>
            <label className="mt-3 block text-xs font-bold text-slate-600">
              시군구
              <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold" value={selectedSgg} onChange={(event) => setSelectedSgg(event.target.value)}>
                {availableSggs.map((region) => <option key={region.sggCode} value={region.sggCode}>{region.sggName}</option>)}
              </select>
            </label>
            <p className="mt-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-500">
              현재 대상지역: <strong className="text-slate-800">{selectedRegionName}</strong>
            </p>
          </section>

          <button
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#10233f] px-3 py-3 text-sm font-extrabold text-white"
            onClick={() => setRiskDialogOpen(true)}
          >
            <Eye className="size-4" />
            리스크 보기
          </button>

          <section className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-extrabold">2. 부문 선택</h2>
            <label className="mt-3 block text-xs font-bold text-slate-600">
              부문
              <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold" value={selectedSector} onChange={(event) => handleSectorChange(event.target.value)}>
                {sectors.map((sector) => (
                  <option
                    key={sector.title}
                    value={sector.title}
                    disabled={sector.disabled}
                    className={sector.disabled ? 'text-slate-400' : 'text-slate-900'}
                  >
                    {sector.title}{sector.disabled ? ' (준비중)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-xs font-bold text-slate-600">
              사업
              <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold" value={selectedBusiness} onChange={(event) => setSelectedBusiness(event.target.value)}>
                {businessOptions.map((business) => <option key={business} value={business}>{business}</option>)}
              </select>
            </label>
            <label className="mt-3 block text-xs font-bold text-slate-600">
              평가 시나리오
              <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold" value={selectedScenario} onChange={(event) => setSelectedScenario(event.target.value)}>
                {scenarioList.map((scenario) => <option key={scenario}>{scenario}</option>)}
              </select>
            </label>
            <label className="mt-3 block text-xs font-bold text-slate-600">
              상승시기 시나리오
              <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold" value={selectedScenarioUp} onChange={(event) => setSelectedScenarioUp(event.target.value)}>
                {scenarioUpList.map((scenario) => <option key={scenario}>{scenario}</option>)}
              </select>
            </label>
            <button
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-3 text-sm font-extrabold text-white"
              onClick={() => setRightMode('sector')}
            >
              <Search className="size-4" />
              검색
            </button>
          </section>

          <section className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-extrabold">3. 지도 데이터 편집</h2>
            <p className="mt-2 text-xs leading-5 text-slate-500">원본의 `poi_scenario_up` 점 추가·삭제·저장 흐름을 정적 데이터로 시연합니다.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button className={`rounded-lg px-2 py-2 text-xs font-extrabold ${editMode === 'add' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}`} onClick={() => setEditMode(editMode === 'add' ? 'none' : 'add')}>추가</button>
              <button className={`rounded-lg px-2 py-2 text-xs font-extrabold ${editMode === 'remove' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-700'}`} onClick={() => setEditMode(editMode === 'remove' ? 'none' : 'remove')}>삭제</button>
              <button className="rounded-lg bg-[#10233f] px-2 py-2 text-xs font-extrabold text-white" onClick={savePendingPlans}>저장</button>
              <button className="rounded-lg bg-slate-200 px-2 py-2 text-xs font-extrabold text-slate-700" onClick={cancelPendingPlans}>취소</button>
            </div>
            <label className="mt-3 block text-xs font-bold text-slate-600">
              기준연도
              <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold" value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)}>
                {yearList.map((year) => <option key={year}>{year}</option>)}
              </select>
            </label>
          </section>
        </aside>

        <main className="relative overflow-hidden rounded-lg bg-[#d8f0ef]">
          <LeadDepartmentMap
            snapshot={snapshot}
            layerVisibility={layerVisibility}
            onToggleLayer={toggleLayer}
            plans={plans}
            setPlans={setPlans}
            selectedSector={selectedSector}
            selectedBusiness={selectedBusiness}
            selectedScenario={selectedScenario}
            selectedScenarioUp={selectedScenarioUp}
            selectedYear={selectedYear}
            editMode={editMode}
            setEditMode={setEditMode}
            baseMap={baseMap}
            setBaseMap={setBaseMap}
          />
        </main>

        <aside className="overflow-auto rounded-lg bg-white p-4 shadow-lg">
          <button className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#10233f] px-3 py-3 text-sm font-extrabold text-white">
            <PanelRightOpen className="size-4" />
            평가 패널
          </button>
          <div className="grid grid-cols-3 gap-2">
            {[
              ['overall', '전체현황'],
              ['sector', '부문평가'],
              ['execution', '이행평가'],
            ].map(([id, label]) => (
              <button
                key={id}
                className={`rounded-lg px-2 py-2 text-xs font-extrabold ${rightMode === id ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                onClick={() => setRightMode(id as RightMode)}
              >
                {label}
              </button>
            ))}
          </div>

          {rightMode === 'overall' && (
            <OverallPanel snapshot={snapshot} sggName={selectedSggName} />
          )}

          {rightMode === 'sector' && (
            <SectorPanel
              snapshot={snapshot}
              sggName={selectedSggName}
              sector={selectedSector}
              business={selectedBusiness}
              scenario={selectedScenario}
              scenarioChart={sectorScoreChart}
              scenarioMatrix={scenarioMatrix}
            />
          )}

          {rightMode === 'execution' && (
            <ExecutionPanel plans={filteredPlans} business={selectedBusiness} />
          )}

          <section className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
            <div className="flex items-center gap-2 text-sm font-extrabold text-emerald-900">
              <MapPin className="size-4" />
              API 연결 메모
            </div>
            <p className="mt-2 text-xs leading-5 text-emerald-900/75">
              원본 API 구조는 `util/risk/scenario/evaluation`으로 나뉘어 있습니다. 현재는 정적 데이터로 동일한 응답 형태를 흉내 내고, 이후 Java API나 Supabase로 교체하면 됩니다.
            </p>
          </section>
        </aside>
      </div>

      {riskDialogOpen && (
        <RiskDialog
          risks={riskItems}
          scope={riskScope}
          setScope={setRiskScope}
          regionName={selectedRegionName}
          selectedRisk={selectedRisk}
          onSelectRisk={setSelectedRisk}
          onClose={() => setRiskDialogOpen(false)}
        />
      )}
    </div>
  );
}

function LeadDepartmentMap({
  snapshot,
  layerVisibility,
  onToggleLayer,
  plans,
  setPlans,
  selectedSector,
  selectedBusiness,
  selectedScenario,
  selectedScenarioUp,
  selectedYear,
  editMode,
  setEditMode,
  baseMap,
  setBaseMap,
}: {
  snapshot: LeadDepartmentSnapshot;
  layerVisibility: LayerVisibility;
  onToggleLayer: (layerId: string) => void;
  plans: LeadDepartmentScenarioPlan[];
  setPlans: React.Dispatch<React.SetStateAction<LeadDepartmentScenarioPlan[]>>;
  selectedSector: string;
  selectedBusiness: string;
  selectedScenario: string;
  selectedScenarioUp: string;
  selectedYear: string;
  editMode: EditMode;
  setEditMode: (mode: EditMode) => void;
  baseMap: BaseMapId;
  setBaseMap: (baseMap: BaseMapId) => void;
}) {
  const mapElement = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletGlobal | null>(null);
  const leafletRef = useRef<LeafletGlobal | null>(null);
  const baseLayersRef = useRef<Record<string, LeafletGlobal>>({});
  const overlaysRef = useRef<Record<string, LeafletGlobal>>({});
  const scenarioLayerRef = useRef<LeafletGlobal | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [leafletError, setLeafletError] = useState('');

  useEffect(() => {
    let cancelled = false;

    loadLeaflet()
      .then((L) => {
        if (cancelled || !mapElement.current) return;
        leafletRef.current = L;

        const map = L.map(mapElement.current, { zoomControl: true, preferCanvas: true })
          .setView(snapshot.region.center, 12);
        mapRef.current = map;

        baseLayersRef.current = createBaseLayers(L);
        baseLayersRef.current[baseMap].addTo(map);

        overlaysRef.current = createStaticLayers(L, map, snapshot);
        Object.entries(overlaysRef.current).forEach(([id, layer]) => {
          if (layerVisibility[id]) layer.addTo(map);
        });

        scenarioLayerRef.current = L.layerGroup();
        if (layerVisibility['scenario-poi']) scenarioLayerRef.current.addTo(map);
        fitSelectedRegion(L, map, snapshot.region);
        map.on('click', (event: any) => {
          if (editModeRef.current !== 'add') return;
          const newPlan: LeadDepartmentScenarioPlan = {
            id: `temp-${Date.now()}`,
            sector: selectedSectorRef.current,
            business: selectedBusinessRef.current,
            tableName: selectedBusinessRef.current === '그늘막' ? 'poi_shadeinfra' : selectedBusinessRef.current === '배수시설' ? 'poi_drainage' : 'poi_street_tree',
            scenario: selectedScenarioRef.current,
            scenarioUp: selectedScenarioUpRef.current,
            year: selectedYearRef.current,
            goal: selectedBusinessRef.current === '그늘막' ? 35 : 100,
            count: 1,
            lat: event.latlng.lat,
            lng: event.latlng.lng,
            status: 'pending',
          };
          setPlans((current) => current.concat(newPlan));
        });
        L.control.scale({ imperial: false }).addTo(map);
        setMapReady(true);
      })
      .catch(() => {
        setLeafletError('Leaflet 지도를 불러오지 못했습니다. 네트워크 연결이나 CDN 접근을 확인하세요.');
      });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      overlaysRef.current = {};
      scenarioLayerRef.current = null;
      setMapReady(false);
    };
  }, [snapshot.region.code]);

  const editModeRef = useLatest(editMode);
  const selectedSectorRef = useLatest(selectedSector);
  const selectedBusinessRef = useLatest(selectedBusiness);
  const selectedScenarioRef = useLatest(selectedScenario);
  const selectedScenarioUpRef = useLatest(selectedScenarioUp);
  const selectedYearRef = useLatest(selectedYear);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    Object.entries(baseLayersRef.current).forEach(([id, layer]) => {
      const isVisible = map.hasLayer(layer);
      if (id === baseMap && !isVisible) layer.addTo(map);
      if (id !== baseMap && isVisible) map.removeLayer(layer);
    });
  }, [baseMap, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    Object.entries(overlaysRef.current).forEach(([id, layer]) => {
      const shouldShow = Boolean(layerVisibility[id]);
      const isShown = map.hasLayer(layer);
      if (shouldShow && !isShown) layer.addTo(map);
      if (!shouldShow && isShown) map.removeLayer(layer);
    });
  }, [layerVisibility, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = scenarioLayerRef.current;
    if (!map || !layer || !mapReady) return;

    const shouldShow = Boolean(layerVisibility['scenario-poi']);
    const isShown = map.hasLayer(layer);
    if (shouldShow && !isShown) layer.addTo(map);
    if (!shouldShow && isShown) map.removeLayer(layer);
  }, [layerVisibility, mapReady]);

  useEffect(() => {
    const L = leafletRef.current;
    const layer = scenarioLayerRef.current;
    if (!L || !layer || !mapReady) return;
    layer.clearLayers();

    plans
      .filter((plan) => plan.scenario === selectedScenario)
      .forEach((plan) => {
        const marker = createScenarioMarker(L, plan, plan.id === selectedPlanId);
        marker.on('click', () => {
          if (editModeRef.current === 'remove') setSelectedPlanId(plan.id);
        });
        marker.addTo(layer);
      });
  }, [editModeRef, mapReady, plans, selectedPlanId, selectedScenario]);

  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId);
  const pendingCount = plans.filter((plan) => plan.status === 'pending').length;

  const deleteSelectedPlan = () => {
    if (!selectedPlanId) return;
    setPlans((current) => current.filter((plan) => plan.id !== selectedPlanId));
    setSelectedPlanId('');
  };

  return (
    <>
      <div ref={mapElement} className="absolute inset-0 z-0" />
      {leafletError && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-slate-100 p-8 text-center">
          <p className="rounded-2xl bg-white px-5 py-4 text-sm font-bold text-slate-700 shadow">{leafletError}</p>
        </div>
      )}

      <div className="absolute left-4 top-4 z-[500] rounded-2xl bg-white/90 p-4 shadow-lg backdrop-blur">
        <p className="text-xs font-bold text-slate-500">선택 지역</p>
        <strong>{snapshot.region.name}</strong>
        <p className="mt-1 text-xs text-slate-500">
          {snapshot.region.extentLabel} · 행정코드 {snapshot.region.code}
        </p>
      </div>

      <div className="absolute left-4 top-32 z-[500] grid gap-2 rounded-2xl bg-white/90 p-3 text-xs shadow-lg backdrop-blur">
        <a
          className="rounded-full bg-[#10233f] px-3 py-2 text-center font-extrabold text-white"
          href="http://wpsol3.mangosystem.com/"
          target="_blank"
          rel="noreferrer"
        >
          공간분석 데모
        </a>
        <div className="grid gap-1">
          <strong className="text-slate-700">기준연도 범례</strong>
          {Object.entries(yearColors).map(([year, color]) => (
            <span key={year} className="flex items-center gap-2 text-slate-600">
              <i className="size-3 rounded-full border border-slate-900/20" style={{ backgroundColor: color }} />
              {year}년
            </span>
          ))}
        </div>
      </div>

      <div className="absolute right-4 top-4 z-[500] w-72 rounded-2xl border border-white/70 bg-white/90 p-4 shadow-lg backdrop-blur">
        <div className="flex items-center gap-2 text-sm font-extrabold">
          <Layers className="size-4 text-emerald-700" />
          지도 레이어
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1">
          {baseMapOptions.map((option) => (
            <button
              key={option.id}
              className={`rounded-lg px-2 py-1.5 text-[11px] font-extrabold ${baseMap === option.id ? 'bg-[#10233f] text-white' : 'bg-slate-100 text-slate-600'}`}
              onClick={() => setBaseMap(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-2 text-xs font-bold text-slate-600">
          {snapshot.layers.map((layer) => (
            <label key={layer.id} className="flex items-start gap-2 rounded-lg bg-slate-50 px-2 py-2">
              <input type="checkbox" checked={Boolean(layerVisibility[layer.id])} onChange={() => onToggleLayer(layer.id)} />
              <span>
                <span className="block text-slate-800">{layer.name}</span>
                <small className="block pt-0.5 text-[10px] font-medium leading-4 text-slate-500">{layer.source}</small>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-4 text-slate-500">
          {hasVWorldApiKey()
            ? 'VWorld 행정경계·읍면동경계·연속지적도 레이어를 사용할 수 있습니다.'
            : 'VWorld API 키가 없으면 공식 WMS 레이어는 비활성화되고 로컬 예시 경계를 표시합니다.'}
        </p>
      </div>

      <div className="absolute bottom-4 left-4 right-4 z-[500] rounded-2xl border border-white/70 bg-white/90 p-3 shadow-lg backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-slate-500">지도 편집 상태</p>
            <strong className="text-sm">
              {editMode === 'add' ? '지도 클릭으로 사업 후보지를 추가합니다.' : editMode === 'remove' ? '삭제할 후보지를 지도에서 선택하세요.' : '왼쪽에서 추가/삭제 모드를 선택하세요.'}
            </strong>
            <p className="text-xs text-slate-500">
              {selectedBusiness} · {selectedScenarioUp} · {selectedYear}년 · 임시 {pendingCount}개
              {selectedPlan ? ` · 선택: ${selectedPlan.business} ${selectedPlan.year}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={`inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-extrabold ${editMode === 'add' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}`} onClick={() => setEditMode(editMode === 'add' ? 'none' : 'add')}>
              <MousePointer2 className="size-3.5" />
              추가 모드
            </button>
            <button className={`inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-extrabold ${editMode === 'remove' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-700'}`} onClick={() => setEditMode(editMode === 'remove' ? 'none' : 'remove')}>
              <Trash2 className="size-3.5" />
              삭제 선택
            </button>
            <button className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-2 text-xs font-extrabold text-rose-700 disabled:opacity-40" disabled={!selectedPlanId} onClick={deleteSelectedPlan}>
              선택 삭제
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function OverallPanel({ snapshot, sggName }: { snapshot: LeadDepartmentSnapshot; sggName: string }) {
  const sequenceBreaks = snapshot.urbanIndex.filter((row, index, rows) => index === 0 || row.sequence !== rows[index - 1].sequence);

  return (
    <section className="mt-4 rounded-xl border border-slate-200 p-4">
      <h2 className="text-lg font-extrabold">{sggName} 전체현황 평가</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">연도별 종합평가 수치와 거버넌스·적응효과·만족도 지표를 확인합니다.</p>
      <div className="mt-4 h-64 rounded-xl bg-slate-50 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={snapshot.urbanIndex}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="year" />
            <YAxis domain={[0, 5]} />
            <Tooltip />
            {sequenceBreaks.map((row) => <ReferenceLine key={row.year} x={row.year} stroke="#ef4444" strokeDasharray="4 3" label={row.sequence} />)}
            <Line type="monotone" dataKey="total" name="종합수치" stroke="#111827" strokeWidth={2.5} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 h-72 rounded-xl bg-slate-50 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={snapshot.urbanIndex}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="year" />
            <YAxis domain={[0, 5]} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="governance" name="거버넌스" stroke="#30a9de" strokeWidth={2} />
            <Line type="monotone" dataKey="adaptationEffect" name="적응효과" stroke="#eab308" strokeWidth={2} />
            <Line type="monotone" dataKey="satisfaction" name="만족도" stroke="#ef4444" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function SectorPanel({
  snapshot,
  sggName,
  sector,
  business,
  scenario,
  scenarioChart,
  scenarioMatrix,
}: {
  snapshot: LeadDepartmentSnapshot;
  sggName: string;
  sector: string;
  business: string;
  scenario: string;
  scenarioChart: Record<string, number | string>[];
  scenarioMatrix: { scenarioUp: string; values: { year: string; goal: number; count: number }[] }[];
}) {
  const colors = ['#e11d48', '#059669', '#2563eb', '#ea580c', '#7c3aed'];

  return (
    <section className="mt-4 rounded-xl border border-slate-200 p-4">
      <h2 className="text-lg font-extrabold">{sggName} {sector}부문 평가</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{scenario} · {business} · 연도별 적응효과 평가와 목표/이행량 표입니다.</p>
      <div className="mt-4 h-80 rounded-xl bg-slate-50 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={scenarioChart}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="year" />
            <YAxis domain={[0, 5]} />
            <Tooltip />
            <Legend />
            {scenarioUpList.map((scenarioUp, index) => (
              <Line key={scenarioUp} type="monotone" dataKey={scenarioUp} stroke={colors[index]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 overflow-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead className="bg-[#10233f] text-white">
            <tr>
              <th className="px-3 py-2">상승시기 시나리오</th>
              {yearList.map((year) => <th key={year} className="px-3 py-2 text-center">{year}</th>)}
            </tr>
          </thead>
          <tbody>
            {scenarioMatrix.map((row) => (
              <tr key={row.scenarioUp} className="border-t border-slate-100">
                <td className="px-3 py-2 font-bold">{row.scenarioUp}</td>
                {row.values.map((value) => (
                  <td key={value.year} className="px-3 py-2 text-center">
                    {value.goal > 0 ? `${value.count}/${value.goal}` : '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 grid gap-3">
        {snapshot.scenarios.filter((item) => item.sector === sector).map((item) => (
          <article key={item.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <strong className="text-slate-900">{item.name}</strong>
                <p className="mt-1 text-xs text-slate-500">{item.intervention} · 목표 {item.quantity.toLocaleString()}{item.unit}</p>
              </div>
              <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700">{statusLabels[item.status]}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ExecutionPanel({ plans, business }: { plans: LeadDepartmentScenarioPlan[]; business: string }) {
  const saved = plans.filter((plan) => plan.status === 'saved');
  const pending = plans.filter((plan) => plan.status === 'pending');
  const goal = sum(saved.map((plan) => plan.goal));
  const count = sum(saved.map((plan) => plan.count));
  const rate = Math.min(100, Math.round((count / Math.max(goal, 1)) * 100));
  const tempReduction = Number((count * (business === '그늘막' ? 0.018 : 0.012)).toFixed(2));

  return (
    <section className="mt-4 rounded-xl border border-slate-200 p-4">
      <h2 className="text-lg font-extrabold">사업 이행평가</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">지도에 배치한 사업 후보지를 기준으로 이행량과 임시 적응효과를 계산합니다.</p>
      <div className="mt-4 grid gap-3">
        <MetricBar label={`${business} 이행률`} value={rate} />
        <div className="rounded-xl bg-emerald-50 p-4">
          <p className="text-xs font-bold text-emerald-700">저장된 사업</p>
          <strong className="mt-1 block text-2xl text-emerald-950">{saved.length}개 지점</strong>
          <p className="mt-1 text-xs text-emerald-800">임시 지점 {pending.length}개 · 저장 전에는 평가에 반영하지 않습니다.</p>
        </div>
        <div className="rounded-xl bg-orange-50 p-4">
          <p className="text-xs font-bold text-orange-700">기온 저감 효과 추정</p>
          <strong className="mt-1 block text-2xl text-orange-950">{tempReduction}℃</strong>
          <p className="mt-1 text-xs text-orange-800">현재는 시연용 계수입니다. 향후 사업소관부서 계산식과 연결합니다.</p>
        </div>
      </div>
    </section>
  );
}

function RiskDialog({
  risks,
  scope,
  setScope,
  regionName,
  selectedRisk,
  onSelectRisk,
  onClose,
}: {
  risks: LeadDepartmentRisk[];
  scope: 'local' | 'national';
  setScope: (scope: 'local' | 'national') => void;
  regionName: string;
  selectedRisk: string;
  onSelectRisk: (riskName: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[3000] grid place-items-center bg-slate-950/60 p-4">
      <section className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <div>
            <h2 className="text-xl font-extrabold">리스크 목록</h2>
            <p className="mt-1 text-sm text-slate-500">{scope === 'local' ? regionName : '전국'} 기준 리스크를 확인합니다.</p>
          </div>
          <button className="rounded-full bg-slate-100 p-2" onClick={onClose}><X className="size-5" /></button>
        </div>
        <div className="flex gap-2 p-4">
          <button className={`rounded-full px-4 py-2 text-sm font-extrabold ${scope === 'local' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`} onClick={() => setScope('local')}>선택지역</button>
          <button className={`rounded-full px-4 py-2 text-sm font-extrabold ${scope === 'national' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`} onClick={() => setScope('national')}>전국</button>
        </div>
        <div className="max-h-[420px] overflow-auto px-4 pb-4">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-[#10233f] text-white">
              <tr>
                <th className="px-3 py-2">부문</th>
                <th className="px-3 py-2 text-center">리스크 코드</th>
                <th className="px-3 py-2">리스크 명칭</th>
              </tr>
            </thead>
            <tbody>
              {risks.map((risk) => (
                <tr
                  key={`${risk.admCode}-${risk.riskCode}`}
                  className={`cursor-pointer border-b border-slate-100 hover:bg-emerald-50 ${selectedRisk === risk.riskName ? 'bg-emerald-50' : ''}`}
                  onClick={() => onSelectRisk(risk.riskName)}
                >
                  <td className="px-3 py-2 font-bold">{risk.sector}</td>
                  <td className="px-3 py-2 text-center">{risk.riskCode}</td>
                  <td className="px-3 py-2">{risk.riskName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function createBaseLayers(L: LeafletGlobal) {
  return {
    'vworld-base': L.tileLayer('https://xdworld.vworld.kr/2d/Base/service/{z}/{x}/{y}.png', {
      attribution: '&copy; VWorld',
      maxZoom: 19,
    }),
    'vworld-white': L.tileLayer('https://xdworld.vworld.kr/2d/white/service/{z}/{x}/{y}.png', {
      attribution: '&copy; VWorld',
      maxZoom: 19,
    }),
    'vworld-satellite': L.tileLayer('https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg', {
      attribution: '&copy; VWorld',
      maxZoom: 19,
    }),
    osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }),
  };
}

function createStaticLayers(L: LeafletGlobal, map: LeafletGlobal, snapshot: LeadDepartmentSnapshot) {
  const layers: Record<string, LeafletGlobal> = {};

  if (!map.getPane('selectedBoundary')) {
    map.createPane('selectedBoundary');
    map.getPane('selectedBoundary').style.zIndex = 650;
  }

  const downloadedBoundaryLayer = createDownloadedSigunguBoundaryLayer(L, snapshot.region);
  const selectedBoundaryLayer = downloadedBoundaryLayer ? L.layerGroup([downloadedBoundaryLayer]) : L.layerGroup();

  if (hasVWorldApiKey()) {
    layers['admin-boundary'] = L.layerGroup([
      L.tileLayer.wms(VWORLD_WMS_URL, createVWorldWmsOptions(VWORLD_WMS_LAYERS.sidoBoundary, { opacity: 0.45 })),
      L.tileLayer.wms(VWORLD_WMS_URL, createVWorldWmsOptions(VWORLD_WMS_LAYERS.sigunguBoundary, { opacity: 0.85 })),
      selectedBoundaryLayer,
    ]);
    layers['emd-boundary'] = L.tileLayer.wms(
      VWORLD_WMS_URL,
      createVWorldWmsOptions(VWORLD_WMS_LAYERS.emdBoundary, { opacity: 0.65 })
    );
    layers.cadastral = L.tileLayer.wms(
      VWORLD_WMS_URL,
      createVWorldWmsOptions(VWORLD_WMS_LAYERS.cadastral, { opacity: 0.55 })
    );
  } else {
    layers['admin-boundary'] = selectedBoundaryLayer;
  }

  layers['risk-index'] = L.layerGroup([
    L.circle(offset(snapshot.region.center, 0.002, 0.009), {
      radius: 540,
      color: '#ef4444',
      fillColor: '#ef4444',
      fillOpacity: 0.25,
      weight: 2,
    }).bindTooltip('폭염 취약 집중 검토구역'),
    L.circle(offset(snapshot.region.center, 0.010, -0.004), {
      radius: 430,
      color: '#f59e0b',
      fillColor: '#f59e0b',
      fillOpacity: 0.23,
      weight: 2,
    }).bindTooltip('고령인구·보행노출 중첩'),
    L.polyline(
      [
        offset(snapshot.region.center, -0.010, -0.011),
        offset(snapshot.region.center, -0.003, 0.000),
        offset(snapshot.region.center, 0.006, 0.010),
        offset(snapshot.region.center, 0.017, 0.020),
      ],
      { color: '#dc2626', weight: 5, opacity: 0.78, dashArray: '10 8' }
    ).bindTooltip('우선 보행축 후보'),
  ]);

  layers['vulnerable-population'] = L.layerGroup([
    L.circle(offset(snapshot.region.center, 0.005, 0.017), {
      radius: 650,
      color: '#7c3aed',
      fillColor: '#7c3aed',
      fillOpacity: 0.18,
      weight: 2,
    }).bindTooltip('취약계층 분포 예시'),
    L.circle(offset(snapshot.region.center, -0.008, 0.006), {
      radius: 510,
      color: '#7c3aed',
      fillColor: '#7c3aed',
      fillOpacity: 0.16,
      weight: 2,
    }).bindTooltip('취약계층 분포 예시'),
  ]);

  return layers;
}

function createLocalBoundaryLayer(L: LeafletGlobal, region: LeadDepartmentSnapshot['region']) {
  const features = findLocalBoundaryFeatures(region);
  if (features.length > 0) {
    const label = features.map((feature) => feature.properties?.name).filter(Boolean).join(', ');
    return L.geoJSON(
      { type: 'FeatureCollection', features },
      {
        pane: 'selectedBoundary',
        interactive: false,
        style: {
          color: '#be123c',
          fillColor: '#fb7185',
          fillOpacity: 0.06,
          opacity: 1,
          weight: 4,
        },
      }
    ).bindTooltip(`${region.name} 행정경계${label && label !== region.sggName ? ` (${label})` : ''}`);
  }

  return L.polygon(region.boundary, {
    pane: 'selectedBoundary',
    interactive: false,
    color: '#be123c',
    fillColor: '#fb7185',
    fillOpacity: 0.05,
    weight: 4,
  }).bindTooltip(`${region.name} 행정경계 대체 표시`);
}

function createDownloadedSigunguBoundaryLayer(L: LeafletGlobal, region: LeadDepartmentSnapshot['region']) {
  const features = getDownloadedBoundaryFeatures(region);
  if (features.length === 0) return null;

  return createBoundaryLayer(L, features, `${region.name} 행정경계`, false) || L.geoJSON(
    { type: 'FeatureCollection', features },
    {
      pane: 'selectedBoundary',
      interactive: false,
      style: {
        color: '#2563eb',
        fillColor: '#60a5fa',
        fillOpacity: 0.18,
        opacity: 1,
        weight: 3,
      },
    }
  ).bindTooltip(`${region.name} 행정경계`);
}

function createBoundaryLayer(
  L: LeafletGlobal,
  features: GeoJsonFeature[],
  tooltip: string,
  interactive = true
) {
  const polygons = features
    .map((feature) => toLeafletLatLngs(feature.geometry?.coordinates))
    .filter((latLngs) => Array.isArray(latLngs) && latLngs.length > 0)
    .map((latLngs) =>
      L.polygon(latLngs, {
        pane: 'selectedBoundary',
        interactive,
        color: '#2563eb',
        fillColor: '#60a5fa',
        fillOpacity: 0.18,
        opacity: 1,
        weight: 3,
      })
    );

  if (polygons.length === 0) return null;
  return L.featureGroup(polygons).bindTooltip(tooltip);
}

function toLeafletLatLngs(value: unknown): unknown[] {
  if (Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number') {
    return [Number(value[1]), Number(value[0])];
  }
  if (Array.isArray(value)) return value.map(toLeafletLatLngs).filter((item) => Array.isArray(item) && item.length > 0);
  return [];
}

function fitRegionBounds(L: LeafletGlobal, map: LeafletGlobal, boundary: [number, number][]) {
  const bounds = L.latLngBounds(boundary);
  if (bounds?.isValid?.()) {
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 14 });
  }
}

function fitSelectedRegion(L: LeafletGlobal, map: LeafletGlobal, region: LeadDepartmentSnapshot['region']) {
  const downloadedFeatures = getDownloadedBoundaryFeatures(region);
  if (downloadedFeatures.length > 0) {
    const layer = createBoundaryLayer(L, downloadedFeatures, `${region.name} 행정경계`, false);
    if (layer) fitLayerBounds(map, layer);
    return;
  }

  const features = findLocalBoundaryFeatures(region);
  if (features.length > 0) {
    const layer = L.geoJSON({ type: 'FeatureCollection', features });
    fitLayerBounds(map, layer);
    return;
  }
  fitRegionBounds(L, map, region.boundary);
}

function fitLayerBounds(map: LeafletGlobal, layer: LeafletGlobal) {
  const bounds = layer?.getBounds?.();
  if (bounds?.isValid?.()) {
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 14 });
  }
}

function parseLocalBoundaryFeatures() {
  try {
    const parsed = JSON.parse(SIGUNGU_BOUNDARY_GEOJSON);
    return Array.isArray(parsed?.features) ? parsed.features : [];
  } catch {
    return [];
  }
}

function parseDownloadedSigunguBoundaryFeatures(): Record<string, GeoJsonFeature> {
  try {
    const parsed = JSON.parse(DOWNLOADS_SIGUNGU_BOUNDARIES);
    return parsed?.featuresByCode && typeof parsed.featuresByCode === 'object' ? parsed.featuresByCode : {};
  } catch {
    return {};
  }
}

function getDownloadedBoundaryFeatures(region: LeadDepartmentSnapshot['region']) {
  const directFeature = downloadedSigunguBoundaries[region.code];
  if (directFeature) return [directFeature];

  return region.cdList
    .map((code) => downloadedSigunguBoundaries[code])
    .filter((feature): feature is GeoJsonFeature => Boolean(feature));
}

function findLocalBoundaryFeatures(region: LeadDepartmentSnapshot['region']) {
  const localName = normalizeRegionName(region.sggName);
  const compactName = normalizeRegionName(region.name.replace(region.sidoName, ''));
  const nameCandidates = [
    localName,
    compactName,
    normalizeRegionName(localName.split(' ').at(-1) ?? localName),
    normalizeRegionName(localName.split(' ')[0] ?? localName),
  ].filter(Boolean);

  let matches = localBoundaryFeatures.filter((feature) => {
    const featureName = normalizeRegionName(feature.properties?.name ?? '');
    return nameCandidates.some((candidate) => featureName === candidate || featureName.endsWith(candidate));
  });

  if (matches.length === 0 && localName.includes(' ')) {
    const parentName = normalizeRegionName(localName.split(' ')[0]);
    matches = localBoundaryFeatures.filter((feature) => normalizeRegionName(feature.properties?.name ?? '') === parentName);
  }

  if (matches.length <= 1) return matches;

  return [
    matches.sort((a, b) => {
      const aCenter = featureCenter(a);
      const bCenter = featureCenter(b);
      return distanceFromRegionCenter(aCenter, region.center) - distanceFromRegionCenter(bCenter, region.center);
    })[0],
  ];
}

function normalizeRegionName(value: string) {
  return value.replace(/\s/g, '');
}

function featureCenter(feature: GeoJsonFeature) {
  const points: number[][] = [];
  const collect = (value: unknown) => {
    if (Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number') {
      points.push(value as number[]);
      return;
    }
    if (Array.isArray(value)) value.forEach(collect);
  };
  collect(feature.geometry?.coordinates);

  if (points.length === 0) return { lat: 0, lng: 0 };

  return points.reduce(
    (result, point) => ({
      lat: result.lat + Number(point[1]) / points.length,
      lng: result.lng + Number(point[0]) / points.length,
    }),
    { lat: 0, lng: 0 }
  );
}

function distanceFromRegionCenter(center: { lat: number; lng: number }, regionCenter: [number, number]) {
  return Math.hypot(center.lat - regionCenter[0], center.lng - regionCenter[1]);
}

function createScenarioMarker(L: LeafletGlobal, plan: LeadDepartmentScenarioPlan, selected: boolean) {
  const color = yearColors[plan.year] ?? '#059669';
  const iconText = plan.business === '가로수' ? '수' : plan.business === '그늘막' ? '막' : '배';
  const opacity = plan.status === 'pending' ? 0.65 : 1;
  return L.marker([plan.lat, plan.lng], {
    icon: L.divIcon({
      className: '',
      html: `<span style="display:grid;place-items:center;width:${selected ? 38 : 30}px;height:${selected ? 38 : 30}px;border-radius:999px;background:${color};opacity:${opacity};color:white;font-weight:900;font-size:12px;box-shadow:0 8px 18px rgba(15,23,42,.25);border:${selected ? 4 : 2}px solid ${selected ? '#fbbf24' : 'white'}">${iconText}</span>`,
      iconSize: [selected ? 38 : 30, selected ? 38 : 30],
      iconAnchor: [selected ? 19 : 15, selected ? 19 : 15],
    }),
  }).bindTooltip(`${plan.business} · ${plan.scenarioUp} · ${plan.year}년 · ${plan.status === 'pending' ? '임시' : '저장'}`);
}

function loadLeaflet(): Promise<LeafletGlobal> {
  if (window.L) return Promise.resolve(window.L);

  if (!document.querySelector(`link[href="${LEAFLET_CSS_URL}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = LEAFLET_CSS_URL;
    document.head.appendChild(link);
  }

  const existingScript = document.querySelector<HTMLScriptElement>('script[data-leaflet="true"]');
  if (existingScript) {
    return new Promise((resolve, reject) => {
      existingScript.addEventListener('load', () => resolve(window.L));
      existingScript.addEventListener('error', reject);
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = LEAFLET_JS_URL;
    script.async = true;
    script.dataset.leaflet = 'true';
    script.onload = () => resolve(window.L);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function MetricBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="flex items-center justify-between text-xs font-bold text-slate-600">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
        <i className="block h-full rounded-full bg-emerald-500" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

function createRegionBoundary(center: [number, number]): [number, number][] {
  return [
    offset(center, 0.030, -0.014),
    offset(center, 0.034, 0.018),
    offset(center, 0.018, 0.034),
    offset(center, -0.006, 0.031),
    offset(center, -0.019, 0.010),
    offset(center, -0.006, -0.014),
    offset(center, 0.014, -0.020),
  ];
}

function offset(center: [number, number], lat: number, lng: number): [number, number] {
  return [center[0] + lat, center[1] + lng];
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return Number((sum(values) / values.length).toFixed(1));
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}
