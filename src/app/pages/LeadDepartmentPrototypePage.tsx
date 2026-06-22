import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  Bell,
  ChevronDown,
  ChevronLeft,
  CheckCircle2,
  ClipboardList,
  Database,
  Eye,
  Layers,
  MapPin,
  PanelRightOpen,
  Route,
  Search,
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
  VWORLD_DATASETS,
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
type RightMode = 'status-target' | 'execution' | 'adaptation-effect';
type EditMode = 'none' | 'add' | 'remove';
type BaseMapId = 'vworld-base' | 'vworld-white' | 'vworld-satellite' | 'osm';
type GeoJsonFeature = {
  type: 'Feature';
  properties?: Record<string, any>;
  geometry?: {
    type: string;
    coordinates: unknown;
  };
};

type PriorityCandidateBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

type PriorityCandidate = {
  id?: string;
  alternativeId?: string;
  alternativeName?: string;
  rank?: number;
  name?: string;
  area?: string;
  risk?: number;
  h?: number;
  e?: number;
  v?: number;
  score?: number;
  reason?: string;
  basis?: string;
  parcelCount?: number;
  hotspotCount?: number;
  pnuList?: string[];
  center?: { lat: number; lng: number } | null;
  bounds?: PriorityCandidateBounds | null;
  features?: GeoJsonFeature[];
  scores?: {
    risk?: number;
    h?: number;
    e?: number;
    v?: number;
    score?: number;
  };
  attributes?: {
    area?: string;
    reason?: string;
    basis?: string;
    parcelCount?: number;
    hotspotCount?: number;
    pnuList?: string[];
    featureLimit?: number;
    featureTotal?: number;
  };
  geometry?: {
    center?: { lat: number; lng: number } | null;
    bounds?: PriorityCandidateBounds | null;
    features?: GeoJsonFeature[];
  };
};

type PriorityAlternative = {
  id: string;
  name: string;
  status?: string;
  description?: string;
  gridUnit?: string;
  analysisMessage?: string;
  summary?: {
    candidateCount?: number;
    averageRisk?: number | null;
    maxRisk?: number | null;
  };
  candidates: PriorityCandidate[];
};

type PriorityHandoffPayload = {
  packageId?: string;
  schemaVersion?: string;
  source?: string;
  target?: string;
  createdAt?: string;
  deliveredToLeadAt?: string;
  deliveryStatus?: string;
  projectName?: string;
  hazardLabel?: string;
  region?: string;
  regionCode?: string;
  candidateBundle?: {
    model?: string;
    alternativeCount?: number;
    candidateCount?: number;
  };
  alternatives?: PriorityAlternative[];
};

type CandidateReviewState = Record<string, '검토대기' | '검토중' | '확인'>;
type PriorityRequestStatus = '신규' | '검토중' | '전달완료' | '보관';
type PriorityRequestLifecycle = Record<string, {
  status: PriorityRequestStatus;
  updatedAt?: string;
  archivedAt?: string;
  sentAt?: string;
}>;
type AdaptationProjectGeometry = 'point' | 'line' | 'polygon';
type AdaptationProjectPlan = {
  id: string;
  title: string;
  part: string;
  item: string;
  geometryType: AdaptationProjectGeometry;
  goal: number;
};
type AdaptationProjectDraft = Omit<AdaptationProjectPlan, 'id'>;
type AdaptationPlacement = {
  id: string;
  projectId: string;
  projectTitle: string;
  item: string;
  geometryType: AdaptationProjectGeometry;
  points: Array<{ lat: number; lng: number }>;
  createdAt: string;
};
type AdaptationPlacementScore = {
  total: number;
  inside: number;
  target: number;
  unit: string;
  implementedValue: number;
  insideValue: number;
  implementationScore: number;
  citizenScore: number;
  percent: number;
};

declare global {
  interface Window {
    L?: LeafletGlobal;
  }
}

const LEAFLET_CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const PRIORITY_HANDOFF_KEY = 'livinglabs.priorityManagementHandoff';
const PRIORITY_HANDOFF_RECALL_KEY = `${PRIORITY_HANDOFF_KEY}:recall`;
const PRIORITY_HANDOFF_CHANNEL = 'livinglabs.priorityManagementHandoffChannel';
const PRIORITY_HANDOFF_INBOX_URL = import.meta.env.VITE_PRIORITY_HANDOFF_INBOX_URL || '/priority-handoff';
const RESPONSIBLE_HANDOFF_INBOX_URL = import.meta.env.VITE_RESPONSIBLE_HANDOFF_INBOX_URL || '/responsible-handoff';
const RESPONSIBLE_REVIEW_INBOX_URL = import.meta.env.VITE_RESPONSIBLE_REVIEW_INBOX_URL || '/responsible-review-response';
const RESPONSIBLE_HANDOFF_KEY = 'livinglabs.responsibleDepartmentHandoff';
const LEAD_REVIEW_STATE_KEY = 'livinglabs.leadDepartmentPriorityReviewState';
const LEAD_REQUEST_LIFECYCLE_KEY = 'livinglabs.leadDepartmentPriorityRequestLifecycle';
const LEAD_ADAPTATION_PLACEMENT_KEY = 'livinglabs.leadDepartmentAdaptationPlacementDraft';
const DEFAULT_LEAD_REGION_CODE = '41110';
const responsibleDepartmentToolUrl = import.meta.env.VITE_RESPONSIBLE_DEPARTMENT_TOOL_URL || 'http://127.0.0.1:4175/responsible-department';
const initialSearchParams = new URLSearchParams(window.location.search);
const initialPriorityRegionCode = initialSearchParams.get('regionCode') || DEFAULT_LEAD_REGION_CODE;
const initialWorkspaceView = initialSearchParams.get('view') === 'workspace';

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

const sectorDisplayName = (title: string) => title === '건강' ? '건강(폭염)' : title;

const geometryOptions: Array<{ id: AdaptationProjectGeometry; label: string; unit: string }> = [
  { id: 'point', label: '점형', unit: '개소' },
  { id: 'line', label: '선형', unit: '개소' },
  { id: 'polygon', label: '면형', unit: '㎡' },
];

const defaultAdaptationProjects: AdaptationProjectPlan[] = [
  {
    id: 'default-shade',
    title: '폭염 취약지역 그늘막 설치',
    part: '건강',
    item: '그늘막',
    geometryType: 'point',
    goal: 30,
  },
  {
    id: 'default-tree',
    title: '폭염 대응 가로수 조성',
    part: '건강',
    item: '가로수',
    geometryType: 'line',
    goal: 20,
  },
];

const defaultAdaptationProjectDraft = (): AdaptationProjectDraft => ({
  title: '',
  part: '건강',
  item: '그늘막',
  geometryType: 'point',
  goal: 30,
});

const scenarioList = ['기준연도', '2030 저성장', '2030 기준성장', '2030 고성장'];
const scenarioUpList = ['2026년도 증가', '2027년도 증가', '2028년도 증가', '2029년도 증가', '2030년도 증가'];
const yearList = ['2026', '2027', '2028', '2029', '2030'];

const baseMapOptions: { id: BaseMapId; label: string }[] = [
  { id: 'vworld-base', label: '일반' },
  { id: 'vworld-white', label: '백지도' },
  { id: 'vworld-satellite', label: '위성' },
  { id: 'osm', label: 'OSM' },
];

const yearColors: Record<string, string> = {};

const localBoundaryFeatures: GeoJsonFeature[] = parseLocalBoundaryFeatures();
const downloadedSigunguBoundaries = parseDownloadedSigunguBoundaryFeatures();

export function LeadDepartmentPrototypePage() {
  const gateway = useMemo(() => getLeadDepartmentGateway(), []);
  const [snapshot, setSnapshot] = useState<LeadDepartmentSnapshot | null>(null);
  const [selectedSido, setSelectedSido] = useState(initialPriorityRegionCode.slice(0, 2));
  const [selectedSgg, setSelectedSgg] = useState(initialPriorityRegionCode);
  const [selectedSector, setSelectedSector] = useState('건강');
  const [selectedBusiness, setSelectedBusiness] = useState('그늘막');
  const [selectedScenario, setSelectedScenario] = useState('기준연도');
  const [selectedScenarioUp, setSelectedScenarioUp] = useState('2026년도 증가');
  const [selectedYear, setSelectedYear] = useState('2026');
  const [selectedRisk, setSelectedRisk] = useState('폭염으로 인한 건강 취약계층 피해');
  const [rightMode, setRightMode] = useState<RightMode>('status-target');
  const [evaluationPanelOpen, setEvaluationPanelOpen] = useState(false);
  const [adaptationGoalPlanningOpen, setAdaptationGoalPlanningOpen] = useState(false);
  const [adaptationPlanningOpen, setAdaptationPlanningOpen] = useState(false);
  const [adaptationProjects, setAdaptationProjects] = useState<AdaptationProjectPlan[]>(defaultAdaptationProjects);
  const [adaptationPlacements, setAdaptationPlacements] = useState<AdaptationPlacement[]>([]);
  const [activeAdaptationProjectId, setActiveAdaptationProjectId] = useState(defaultAdaptationProjects[0].id);
  const [projectDesignerOpen, setProjectDesignerOpen] = useState(false);
  const [projectDraft, setProjectDraft] = useState<AdaptationProjectDraft>(defaultAdaptationProjectDraft);
  const [editMode, setEditMode] = useState<EditMode>('none');
  const [baseMap, setBaseMap] = useState<BaseMapId>('vworld-base');
  const [riskDialogOpen, setRiskDialogOpen] = useState(false);
  const [riskScope, setRiskScope] = useState<'local' | 'national'>('local');
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>({});
  const [plans, setPlans] = useState<LeadDepartmentScenarioPlan[]>([]);
  const [priorityHandoff, setPriorityHandoff] = useState<PriorityHandoffPayload | null>(null);
  const [priorityReviewOpen, setPriorityReviewOpen] = useState(false);
  const [priorityNoticeOpen, setPriorityNoticeOpen] = useState(false);
  const [activePriorityAlternativeId, setActivePriorityAlternativeId] = useState('');
  const [activePriorityCandidateId, setActivePriorityCandidateId] = useState('');
  const [selectedPriorityAlternativeIds, setSelectedPriorityAlternativeIds] = useState<string[]>([]);
  const [candidateReviewState, setCandidateReviewState] = useState<CandidateReviewState>({});
  const [priorityRequestLifecycle, setPriorityRequestLifecycle] = useState<PriorityRequestLifecycle>({});
  const [responsibleHandoffMessage, setResponsibleHandoffMessage] = useState('검토한 대안을 사업소관부서 지원도구로 전달할 수 있습니다.');
  const [responsibleReviewResponse, setResponsibleReviewResponse] = useState<any | null>(null);
  const [placementDraftMessage, setPlacementDraftMessage] = useState('지도에 배치한 사업 공간배치 제안을 저장하거나 불러올 수 있습니다.');
  const [workspaceView, setWorkspaceView] = useState(initialWorkspaceView);
  const noticeShownRef = useRef(false);

  useEffect(() => {
    gateway.getSnapshot(selectedSgg).then((result) => {
      setSnapshot(result);
      setLayerVisibility(Object.fromEntries(result.layers.map((layer) => [layer.id, layer.enabled])));
      setPlans(result.scenarioPlans);
      const firstLocalRisk = result.risks.find((risk) => risk.admCode === selectedSgg) ?? result.risks[0];
      setSelectedRisk(firstLocalRisk.riskName);
    });
  }, [gateway, selectedSgg]);

  useEffect(() => {
    const applyPriorityPayload = (payloadCandidate: PriorityHandoffPayload | null) => {
      const payload = isDeliveredPriorityHandoff(payloadCandidate) ? payloadCandidate : null;
      if (payload) {
        setPriorityHandoff(payload);
        const key = priorityRequestKey(payload);
        if (key) {
          setPriorityRequestLifecycle((current) => ({
            ...current,
            [key]: {
              status: current[key]?.status && current[key].status !== '보관' ? current[key].status : '신규',
              updatedAt: current[key]?.updatedAt ?? new Date().toISOString(),
            },
          }));
        }
        if (payload.regionCode) {
          setSelectedSido(payload.regionCode.slice(0, 2));
          setSelectedSgg(payload.regionCode);
        }
      } else {
        setPriorityHandoff(null);
      }
    };

    const applyPriorityRecall = (packageId?: string, regionCode?: string) => {
      markPriorityHandoffRecalled(packageId, regionCode);
      clearPriorityHandoffPayload();
      applyPriorityPayload(null);
    };

    const handlePriorityMessage = (event: MessageEvent) => {
      if (isPriorityHandoffRecallMessage(event.data)) {
        const recall = event.data as { packageId?: string; regionCode?: string };
        applyPriorityRecall(recall.packageId, recall.regionCode);
        if (event.source && 'postMessage' in event.source) {
          (event.source as Window).postMessage({
            type: `${PRIORITY_HANDOFF_KEY}:recall:ack`,
            packageId: recall.packageId,
            regionCode: recall.regionCode,
          }, event.origin);
        }
        return;
      }

      const payload = priorityPayloadFromMessage(event.data);
      if (!isDeliveredPriorityHandoff(payload)) return;

      persistPriorityHandoffPayload(payload);
      applyPriorityPayload(payload);
      broadcastPriorityPayload(payload);

      if (event.source && 'postMessage' in event.source) {
        (event.source as Window).postMessage({
          type: `${PRIORITY_HANDOFF_KEY}:ack`,
          packageId: payload.packageId,
        }, event.origin);
      }
    };

    const handlePriorityStorage = (event: StorageEvent) => {
      if ((event.key === PRIORITY_HANDOFF_RECALL_KEY && event.newValue) || (event.key === PRIORITY_HANDOFF_KEY && event.newValue === null)) {
        applyPriorityRecall();
        return;
      }
      if (event.key !== PRIORITY_HANDOFF_KEY) return;
      applyPriorityPayload(readPriorityHandoffPayload());
    };

    const recallFromUrl = priorityRecallFromUrl();
    if (recallFromUrl) {
      applyPriorityRecall(recallFromUrl.packageId, recallFromUrl.regionCode);
      broadcastPriorityRecall(recallFromUrl.packageId, recallFromUrl.regionCode);
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: `${PRIORITY_HANDOFF_KEY}:recall:ack`,
          packageId: recallFromUrl.packageId,
          regionCode: recallFromUrl.regionCode,
        }, '*');
      }
    }

    setPriorityRequestLifecycle(readPriorityRequestLifecycle());
    applyPriorityPayload(readPriorityHandoffPayload());

    const handoffChannel = createPriorityHandoffChannel();
    if (handoffChannel) {
      handoffChannel.onmessage = (event) => {
        if (isPriorityHandoffRecallMessage(event.data)) {
          const recall = event.data as { packageId?: string; regionCode?: string };
          applyPriorityRecall(recall.packageId, recall.regionCode);
          return;
        }

        const payload = priorityPayloadFromMessage(event.data);
        if (!isDeliveredPriorityHandoff(payload)) return;
        persistPriorityHandoffPayload(payload);
        applyPriorityPayload(payload);
      };
    }

    try {
      const savedState = window.localStorage.getItem(LEAD_REVIEW_STATE_KEY);
      if (savedState) setCandidateReviewState(JSON.parse(savedState));
    } catch {
      setCandidateReviewState({});
    }
    window.addEventListener('message', handlePriorityMessage);
    window.addEventListener('storage', handlePriorityStorage);

    return () => {
      window.removeEventListener('message', handlePriorityMessage);
      window.removeEventListener('storage', handlePriorityStorage);
      handoffChannel?.close();
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(LEAD_REVIEW_STATE_KEY, JSON.stringify(candidateReviewState));
    } catch {
      // Local review state is a convenience cache; the UI still works without it.
    }
  }, [candidateReviewState]);

  useEffect(() => {
    try {
      window.localStorage.setItem(LEAD_REQUEST_LIFECYCLE_KEY, JSON.stringify(priorityRequestLifecycle));
    } catch {
      // Request lifecycle is local UI state; the request payload still remains readable.
    }
  }, [priorityRequestLifecycle]);

  useEffect(() => {
    let cancelled = false;

    const loadInboxPayload = async () => {
      const payload = await fetchPriorityHandoffFromInbox(selectedSgg);
      if (cancelled || !isDeliveredPriorityHandoff(payload)) return;
      persistPriorityHandoffPayload(payload);
      setPriorityHandoff((current) => (
        current?.packageId === payload.packageId ? current : payload
      ));
      const key = priorityRequestKey(payload);
      if (key) {
        setPriorityRequestLifecycle((current) => ({
          ...current,
          [key]: {
            status: current[key]?.status && current[key].status !== '보관' ? current[key].status : '신규',
            updatedAt: current[key]?.updatedAt ?? new Date().toISOString(),
          },
        }));
      }
      if (payload.regionCode && payload.regionCode !== selectedSgg) {
        setSelectedSido(payload.regionCode.slice(0, 2));
        setSelectedSgg(payload.regionCode);
      }
    };

    loadInboxPayload();
    const timer = window.setInterval(loadInboxPayload, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selectedSgg]);

  useEffect(() => {
    let cancelled = false;

    const loadResponsibleResponse = async () => {
      const payload = await fetchResponsibleReviewResponse(selectedSgg);
      if (cancelled) return;
      setResponsibleReviewResponse(payload);
    };

    loadResponsibleResponse();
    const timer = window.setInterval(loadResponsibleResponse, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selectedSgg]);

  const availableSidos = useMemo(() => {
    if (!snapshot) return [];
    return Array.from(new Map(snapshot.regions.map((region) => [region.sidoCode, region.sidoName])).entries());
  }, [snapshot]);

  const availableSggs = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.regions.filter((region) => region.sidoCode === selectedSido);
  }, [snapshot, selectedSido]);

  const projectDraftBusinessOptions = useMemo(() => {
    return sectors.find((sector) => sector.title === projectDraft.part)?.children ?? [];
  }, [projectDraft.part]);
  const activeAdaptationProject = useMemo(() => {
    return adaptationProjects.find((project) => project.id === activeAdaptationProjectId) ?? adaptationProjects[0] ?? null;
  }, [activeAdaptationProjectId, adaptationProjects]);
  const sectorAdaptationProjects = useMemo(() => {
    return adaptationProjects.filter((project) => project.part === selectedSector);
  }, [adaptationProjects, selectedSector]);

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
  const activeRegionHandoff = useMemo(() => {
    if (!priorityHandoff || !snapshot) return null;
    return priorityHandoffMatchesRegion(priorityHandoff, selectedSgg, snapshot.region) ? priorityHandoff : null;
  }, [priorityHandoff, selectedSgg, snapshot]);
  const activePriorityRequestKey = useMemo(() => priorityRequestKey(activeRegionHandoff), [activeRegionHandoff]);
  const activePriorityRequestStatus = activePriorityRequestKey
    ? priorityRequestLifecycle[activePriorityRequestKey]?.status ?? '신규'
    : '신규';
  const activePriorityRequestInInbox = activePriorityRequestStatus !== '보관' && activePriorityRequestStatus !== '전달완료';
  const inboxPriorityHandoff = activePriorityRequestInInbox ? activeRegionHandoff : null;
  const priorityAlternatives = useMemo(() => {
    if (!activePriorityRequestInInbox) return [];
    return (activeRegionHandoff?.alternatives ?? []).filter((alternative) => alternative.candidates?.length);
  }, [activePriorityRequestInInbox, activeRegionHandoff]);
  const priorityCandidateCount = useMemo(() => {
    return priorityAlternatives.reduce((sum, alternative) => sum + (alternative.candidates?.length ?? 0), 0);
  }, [priorityAlternatives]);
  const selectedPriorityAlternatives = useMemo(() => {
    const selectedIds = new Set(selectedPriorityAlternativeIds);
    return priorityAlternatives.filter((alternative) => selectedIds.has(alternative.id));
  }, [priorityAlternatives, selectedPriorityAlternativeIds]);
  const selectedPriorityCandidateCount = useMemo(() => {
    return selectedPriorityAlternatives.reduce((sum, alternative) => sum + (alternative.candidates?.length ?? 0), 0);
  }, [selectedPriorityAlternatives]);
  const activePriorityAlternative = useMemo(() => {
    return priorityAlternatives.find((alternative) => alternative.id === activePriorityAlternativeId) ?? priorityAlternatives[0] ?? null;
  }, [activePriorityAlternativeId, priorityAlternatives]);
  const activePriorityCandidate = useMemo(() => {
    return activePriorityAlternative?.candidates.find((candidate) => candidateKey(candidate) === activePriorityCandidateId)
      ?? activePriorityAlternative?.candidates[0]
      ?? null;
  }, [activePriorityAlternative, activePriorityCandidateId]);
  const activePriorityCandidates = activePriorityAlternative?.candidates ?? [];
  const activeAdaptationPlacements = useMemo(() => {
    return adaptationPlacements.filter((placement) => placement.projectId === activeAdaptationProject?.id);
  }, [activeAdaptationProject?.id, adaptationPlacements]);
  const activeAdaptationPlacementScore = useMemo(() => {
    return calculateAdaptationPlacementScore(activeAdaptationProject, activeAdaptationPlacements, activePriorityCandidates);
  }, [activeAdaptationPlacements, activeAdaptationProject, activePriorityCandidates]);

  useEffect(() => {
    if (!priorityAlternatives.length) {
      setPriorityReviewOpen(false);
      setActivePriorityAlternativeId('');
      setActivePriorityCandidateId('');
      setSelectedPriorityAlternativeIds([]);
      noticeShownRef.current = false;
      return;
    }

    setSelectedPriorityAlternativeIds((current) => {
      const validIds = new Set(priorityAlternatives.map((alternative) => alternative.id));
      return current.filter((id) => validIds.has(id));
    });

    if (!activePriorityAlternativeId || !priorityAlternatives.some((alternative) => alternative.id === activePriorityAlternativeId)) {
      setActivePriorityAlternativeId(priorityAlternatives[0].id);
    }

    if (workspaceView && !noticeShownRef.current) {
      setPriorityReviewOpen(false);
      setPriorityNoticeOpen(false);
      noticeShownRef.current = true;
    }
  }, [activePriorityAlternativeId, priorityAlternatives, priorityReviewOpen, workspaceView]);

  useEffect(() => {
    if (!activePriorityAlternative?.candidates.length) return;
    if (!activePriorityCandidateId || !activePriorityAlternative.candidates.some((candidate) => candidateKey(candidate) === activePriorityCandidateId)) {
      setActivePriorityCandidateId(candidateKey(activePriorityAlternative.candidates[0]));
    }
  }, [activePriorityAlternative, activePriorityCandidateId]);

  const handleSidoChange = (sidoCode: string) => {
    setSelectedSido(sidoCode);
    const firstSgg = snapshot?.regions.find((region) => region.sidoCode === sidoCode);
    if (firstSgg) setSelectedSgg(firstSgg.sggCode);
  };

  const handleSectorChange = (sectorTitle: string) => {
    setSelectedSector(sectorTitle);
    const nextProject = adaptationProjects.find((project) => project.part === sectorTitle);
    if (nextProject) {
      setActiveAdaptationProjectId(nextProject.id);
      setSelectedBusiness(nextProject.item);
    } else {
      const nextBusiness = sectors.find((sector) => sector.title === sectorTitle)?.children[0] ?? '';
      setSelectedBusiness(nextBusiness);
    }
  };

  const selectAdaptationProject = (project: AdaptationProjectPlan) => {
    setActiveAdaptationProjectId(project.id);
    setSelectedSector(project.part);
    setSelectedBusiness(project.item);
    setRightMode('execution');
  };

  const updateProjectDraftPart = (part: string) => {
    const firstItem = sectors.find((sector) => sector.title === part)?.children[0] ?? '';
    setProjectDraft((current) => ({
      ...current,
      part,
      item: firstItem,
    }));
  };

  const addAdaptationProject = () => {
    const item = projectDraft.item || projectDraftBusinessOptions[0] || '';
    if (!item) return;
    const project: AdaptationProjectPlan = {
      ...projectDraft,
      id: `lead-project-${Date.now()}`,
      item,
      title: projectDraft.title.trim() || `${sectorDisplayName(projectDraft.part)} ${item} 계획`,
      goal: Number(projectDraft.goal) || 0,
    };
    setAdaptationProjects((current) => current.concat(project));
    selectAdaptationProject(project);
    setProjectDraft(defaultAdaptationProjectDraft());
    setProjectDesignerOpen(false);
  };

  const removeAdaptationProject = (projectId: string) => {
    setAdaptationProjects((current) => {
      if (current.length <= 1) return current;
      const next = current.filter((project) => project.id !== projectId);
      if (!next.some((project) => project.id === activeAdaptationProjectId)) {
        window.setTimeout(() => selectAdaptationProject(next[0]), 0);
      }
      return next;
    });
    setAdaptationPlacements((current) => current.filter((placement) => placement.projectId !== projectId));
  };

  const addAdaptationPlacement = (placement: AdaptationPlacement) => {
    setAdaptationPlacements((current) => current.concat(placement));
    setRightMode('execution');
  };

  const removeAdaptationPlacement = (placementId: string) => {
    setAdaptationPlacements((current) => current.filter((placement) => placement.id !== placementId));
  };

  const clearActiveAdaptationPlacements = () => {
    if (!activeAdaptationProject) return;
    setAdaptationPlacements((current) => current.filter((placement) => placement.projectId !== activeAdaptationProject.id));
  };

  const saveAdaptationPlacementDraft = () => {
    const payload = {
      schemaVersion: 'lead-adaptation-placement-draft/v1',
      regionCode: selectedSgg,
      region: selectedRegionName,
      packageId: activeRegionHandoff?.packageId ?? activeRegionHandoff?.createdAt ?? 'local',
      savedAt: new Date().toISOString(),
      activeProjectId: activeAdaptationProjectId,
      projects: adaptationProjects,
      placements: adaptationPlacements,
    };
    try {
      window.localStorage.setItem(adaptationPlacementStorageKey(selectedSgg, activeRegionHandoff), JSON.stringify(payload));
      setPlacementDraftMessage(`공간배치 제안 ${adaptationPlacements.length.toLocaleString()}건을 저장했습니다.`);
    } catch {
      setPlacementDraftMessage('브라우저 저장소에 공간배치 제안을 저장하지 못했습니다.');
    }
  };

  const loadAdaptationPlacementDraft = () => {
    try {
      const raw = window.localStorage.getItem(adaptationPlacementStorageKey(selectedSgg, activeRegionHandoff));
      if (!raw) {
        setPlacementDraftMessage('불러올 저장된 공간배치 제안이 없습니다.');
        return;
      }
      const parsed = JSON.parse(raw);
      const nextProjects = Array.isArray(parsed?.projects) ? parsed.projects : [];
      const nextPlacements = Array.isArray(parsed?.placements) ? parsed.placements : [];
      if (nextProjects.length) setAdaptationProjects(nextProjects);
      setAdaptationPlacements(nextPlacements);
      if (parsed?.activeProjectId) setActiveAdaptationProjectId(parsed.activeProjectId);
      setPlacementDraftMessage(`저장된 공간배치 제안 ${nextPlacements.length.toLocaleString()}건을 불러왔습니다.`);
    } catch {
      setPlacementDraftMessage('저장된 공간배치 제안을 불러오지 못했습니다.');
    }
  };

  const toggleLayer = (layerId: string) => {
    setLayerVisibility((current) => ({ ...current, [layerId]: !current[layerId] }));
  };

  const startPriorityReview = () => {
    if (!priorityAlternatives.length) return;
    setActivePriorityRequestStatus('검토중');
    setPriorityNoticeOpen(false);
    setPriorityReviewOpen(true);
    setRightMode('status-target');
    setActivePriorityAlternativeId(activePriorityAlternative?.id ?? priorityAlternatives[0].id);
    const firstCandidate = activePriorityAlternative?.candidates[0] ?? priorityAlternatives[0].candidates[0];
    if (firstCandidate) setActivePriorityCandidateId(candidateKey(firstCandidate));
  };

  const enterWorkspace = (openPriorityReview = false) => {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('regionCode', selectedSgg);
    nextUrl.searchParams.set('view', 'workspace');
    if (activeRegionHandoff) {
      nextUrl.searchParams.set('handoff', 'priority-management');
    } else {
      nextUrl.searchParams.delete('handoff');
    }
    window.history.pushState({}, '', nextUrl.toString());
    setWorkspaceView(true);
    if (openPriorityReview && priorityCandidateCount) {
      window.setTimeout(() => startPriorityReview(), 0);
    }
  };

  const updateCandidateReview = (candidate: PriorityCandidate, state: CandidateReviewState[string]) => {
    const key = `${activeRegionHandoff?.packageId ?? activeRegionHandoff?.createdAt ?? 'priority'}:${candidate.alternativeId ?? activePriorityAlternative?.id}:${candidateKey(candidate)}`;
    setCandidateReviewState((current) => ({ ...current, [key]: state }));
  };

  const getCandidateReviewState = (candidate: PriorityCandidate) => {
    const key = `${activeRegionHandoff?.packageId ?? activeRegionHandoff?.createdAt ?? 'priority'}:${candidate.alternativeId ?? activePriorityAlternative?.id}:${candidateKey(candidate)}`;
    return candidateReviewState[key] ?? '검토대기';
  };

  const togglePriorityAlternativeSelection = (alternativeId: string) => {
    setSelectedPriorityAlternativeIds((current) => (
      current.includes(alternativeId)
        ? current.filter((id) => id !== alternativeId)
        : [...current, alternativeId]
    ));
  };

  const setActivePriorityRequestStatus = (status: PriorityRequestStatus) => {
    if (!activePriorityRequestKey) return;
    const now = new Date().toISOString();
    setPriorityRequestLifecycle((current) => ({
      ...current,
      [activePriorityRequestKey]: {
        ...(current[activePriorityRequestKey] ?? {}),
        status,
        updatedAt: now,
        archivedAt: status === '보관' ? now : current[activePriorityRequestKey]?.archivedAt,
        sentAt: status === '전달완료' ? now : current[activePriorityRequestKey]?.sentAt,
      },
    }));
  };

  const archiveActivePriorityRequest = () => {
    setActivePriorityRequestStatus('보관');
    setPriorityReviewOpen(false);
    setPriorityNoticeOpen(false);
  };

  const clearActivePriorityRequest = () => {
    const keyToRemove = activePriorityRequestKey;
    markPriorityHandoffRecalled(activeRegionHandoff?.packageId, activeRegionHandoff?.regionCode ?? selectedSgg);
    broadcastPriorityRecall(activeRegionHandoff?.packageId, activeRegionHandoff?.regionCode ?? selectedSgg);
    clearPriorityHandoffPayload();
    setPriorityHandoff(null);
    setPriorityReviewOpen(false);
    setPriorityNoticeOpen(false);
    setActivePriorityAlternativeId('');
    setActivePriorityCandidateId('');
    setSelectedPriorityAlternativeIds([]);
    if (keyToRemove) {
      setPriorityRequestLifecycle((current) => {
        const next = { ...current };
        delete next[keyToRemove];
        return next;
      });
    }
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete('handoff');
    window.history.replaceState({}, '', nextUrl.toString());
  };

  const handoffToResponsibleDepartment = async () => {
    if (!activeRegionHandoff || !priorityAlternatives.length) {
      setResponsibleHandoffMessage('사업소관부서로 전달할 중점관리구역 대안이 없습니다.');
      return;
    }

    const alternativesForHandoff = selectedPriorityAlternatives;
    if (!alternativesForHandoff.length) {
      setResponsibleHandoffMessage('전달 전 확인: 사업소관부서로 보낼 대안을 먼저 선택하세요. 대안 선택은 필수입니다.');
      return;
    }

    const packageKey = activeRegionHandoff.packageId ?? activeRegionHandoff.createdAt ?? 'priority';
    const alternatives = alternativesForHandoff.map((alternative) => ({
      ...alternative,
      status: '사업소관부서 검토요청',
      candidates: alternative.candidates.map((candidate) => ({
        ...candidate,
        leadReviewState: candidateReviewState[
          `${packageKey}:${candidate.alternativeId ?? alternative.id}:${candidateKey(candidate)}`
        ] ?? '검토대기',
      })),
    }));
    const candidateCount = alternatives.reduce((sum, alternative) => sum + alternative.candidates.length, 0);
    const placementSuggestion = {
      status: adaptationPlacements.length ? 'included' : 'not-provided',
      label: '사업 공간배치 제안',
      required: false,
      note: adaptationPlacements.length
        ? '주관부서가 검토 과정에서 제안한 사업 공간배치입니다. 사업소관부서에서 열람·수정할 수 있습니다.'
        : '사업 공간배치 제안은 선택 권고 항목이므로, 대안만 먼저 전달할 수 있습니다.',
      projectCount: adaptationProjects.length,
      placementCount: adaptationPlacements.length,
    };
    const payload = {
      ...activeRegionHandoff,
      schemaVersion: 'lead-to-responsible-handoff/v1',
      source: 'lead-department-tool',
      target: 'responsible-department-tool',
      leadReviewedAt: new Date().toISOString(),
      regionCode: activeRegionHandoff.regionCode ?? selectedSgg,
      region: activeRegionHandoff.region ?? selectedRegionName,
      candidateBundle: {
        ...(activeRegionHandoff.candidateBundle ?? {}),
        alternativeCount: alternatives.length,
        candidateCount,
        reviewedBy: 'lead-department-tool',
      },
      adaptationProjects,
      adaptationPlacements,
      placementSuggestion,
      alternatives,
    };

    const serialized = JSON.stringify(payload);
    try {
      window.localStorage.setItem(RESPONSIBLE_HANDOFF_KEY, serialized);
    } catch {
      window.sessionStorage.setItem(RESPONSIBLE_HANDOFF_KEY, serialized);
    }
    window.name = JSON.stringify({ type: RESPONSIBLE_HANDOFF_KEY, payload });
    const inboxOk = await saveResponsibleHandoffToInbox(payload);
    if (!inboxOk) {
      setResponsibleHandoffMessage('현재 브라우저에는 저장했지만 사업소관부서 인박스 저장에 실패했습니다. 4176 프록시 상태를 확인하세요.');
      return;
    }
    setResponsibleHandoffMessage(
      adaptationPlacements.length
        ? `${alternatives.length}개 선택 대안 · ${candidateCount}개 후보 · 사업 공간배치 제안 ${adaptationPlacements.length}건을 사업소관부서 지원도구로 전달했습니다.`
        : `${alternatives.length}개 선택 대안 · ${candidateCount}개 후보를 전달했습니다. 사업 공간배치 제안은 포함되지 않았습니다.`
    );
    setActivePriorityRequestStatus('전달완료');
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

  if (!workspaceView) {
    return (
      <LeadDepartmentEntryPage
        selectedSido={selectedSido}
        selectedSgg={selectedSgg}
        selectedRegionName={selectedRegionName}
        availableSidos={availableSidos}
        availableSggs={availableSggs}
        onSidoChange={handleSidoChange}
        onSggChange={setSelectedSgg}
        handoff={inboxPriorityHandoff}
        alternativeCount={priorityAlternatives.length}
        candidateCount={priorityCandidateCount}
        onEnter={() => enterWorkspace(false)}
        onClearRequest={clearActivePriorityRequest}
      />
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

      <div className="grid h-[calc(100vh-56px)] grid-cols-[250px_minmax(500px,1fr)_460px] gap-1 p-1">
        <aside className="overflow-auto rounded-lg bg-[#f4f5f6] p-3 shadow-lg">
          <h1 className="text-base font-extrabold text-slate-900">사업 검토 설정</h1>

          <section className="mt-3 rounded-xl border border-slate-200 bg-white p-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-extrabold text-slate-900">알림</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold text-slate-500">
                {(priorityCandidateCount ? 1 : 0) + (responsibleReviewResponse ? 1 : 0)}건
              </span>
            </div>
            <p className="mt-1 truncate text-[11px] font-bold text-slate-500">
              선택 지역 기준 · {selectedRegionName || selectedSgg}
            </p>

            <button
              className={`mt-2 flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left transition ${priorityCandidateCount ? 'border-orange-200 bg-orange-50 text-orange-950' : 'border-slate-100 bg-slate-50 text-slate-500'}`}
              disabled={!priorityCandidateCount}
              onClick={startPriorityReview}
            >
              <span className={`grid size-7 shrink-0 place-items-center rounded-lg ${priorityCandidateCount ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                <ClipboardList className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-extrabold">중점관리구역 요청</span>
                <span className="block truncate text-[11px] font-bold opacity-80">
                  {priorityCandidateCount ? `${priorityAlternatives.length}개 대안 · ${priorityCandidateCount}개 후보` : '대기 요청 없음'}
                </span>
              </span>
              {priorityCandidateCount ? (
                <span className="rounded-full bg-white px-2 py-1 text-[10px] font-extrabold text-orange-700">열기</span>
              ) : null}
            </button>

            <button
              className={`mt-1.5 flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left ${responsibleReviewResponse ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-slate-100 bg-slate-50 text-slate-500'}`}
              disabled={!responsibleReviewResponse}
              onClick={() => setEvaluationPanelOpen(true)}
            >
              <span className={`grid size-7 shrink-0 place-items-center rounded-lg ${responsibleReviewResponse ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                <Route className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-extrabold">사업소관부서 요청</span>
                <span className="block truncate text-[11px] font-bold opacity-80">
                  {responsibleReviewResponse ? '수정 검토 요청 1건' : '대기 요청 없음'}
                </span>
              </span>
              {responsibleReviewResponse ? (
                <span className="rounded-full bg-white px-2 py-1 text-[10px] font-extrabold text-emerald-700">열기</span>
              ) : null}
            </button>
          </section>

          <section className="hidden">
            <div className="flex items-start gap-2">
              <div className={`grid size-8 shrink-0 place-items-center rounded-lg ${priorityCandidateCount ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                <ClipboardList className="size-4" />
              </div>
              <div>
                <h2 className="text-xs font-extrabold text-slate-900">중점관리구역 검토</h2>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  {priorityCandidateCount
                    ? `${priorityAlternatives.length}개 대안 · ${priorityCandidateCount}개 후보`
                    : '전달된 대안 0건'}
                </p>
              </div>
            </div>
            {activeRegionHandoff && (
              <p className="mt-2 rounded-lg bg-white/80 p-2 text-[11px] font-bold leading-4 text-orange-900">
                {activeRegionHandoff.projectName ?? '중점관리구역 선정지원도구'} · {activeRegionHandoff.hazardLabel ?? '재해'} · {activeRegionHandoff.region ?? selectedRegionName}
              </p>
            )}
            <button
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-xs font-extrabold text-white disabled:bg-slate-200 disabled:text-slate-500"
              disabled={!priorityCandidateCount}
              onClick={startPriorityReview}
            >
              <Bell className="size-4" />
              검토 시작
            </button>
          </section>

          <section className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left"
              onClick={() => setAdaptationGoalPlanningOpen((current) => !current)}
            >
              <span>
                <span className="block text-xs font-extrabold text-slate-900">적응 목표 계획하기</span>
                <span className="mt-0.5 block text-[11px] font-bold text-slate-500">
                  {sectorDisplayName(selectedSector)} · {selectedScenarioUp}
                </span>
              </span>
              <ChevronDown className={`size-4 text-slate-500 transition-transform ${adaptationGoalPlanningOpen ? 'rotate-180' : ''}`} />
            </button>
            {adaptationGoalPlanningOpen && (
              <div className="border-t border-slate-100 px-3 pb-3">
                <label className="mt-3 block text-xs font-bold text-slate-600">
                  부문
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold"
                    value={selectedSector}
                    onChange={(event) => handleSectorChange(event.target.value)}
                  >
                    {sectors.map((sector) => (
                      <option
                        key={sector.title}
                        value={sector.title}
                        disabled={sector.disabled}
                        className={sector.disabled ? 'text-slate-400' : 'text-slate-900'}
                      >
                        {sectorDisplayName(sector.title)}{sector.disabled ? ' (준비중)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="mt-2 text-[11px] font-bold leading-4 text-slate-500">
                  현황과 부문별 목표를 확인하고, 상승시기 시나리오별 필요 이행목표를 계획합니다.
                </p>
                <label className="mt-3 block text-xs font-bold text-slate-600">
                  평가 시나리오
                  <select className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold" value={selectedScenario} onChange={(event) => setSelectedScenario(event.target.value)}>
                    {scenarioList.map((scenario) => <option key={scenario}>{scenario}</option>)}
                  </select>
                </label>
                <label className="mt-3 block text-xs font-bold text-slate-600">
                  상승시기 시나리오
                  <select className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold" value={selectedScenarioUp} onChange={(event) => setSelectedScenarioUp(event.target.value)}>
                    {scenarioUpList.map((scenario) => <option key={scenario}>{scenario}</option>)}
                  </select>
                </label>
                <button
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-extrabold text-white"
                  onClick={() => {
                    setEvaluationPanelOpen(true);
                    setRightMode('status-target');
                  }}
                >
                  <Search className="size-4" />
                  현황 및 목표 보기
                </button>
              </div>
            )}
          </section>

          <section className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left"
              onClick={() => setAdaptationPlanningOpen((current) => !current)}
            >
              <span>
                <span className="block text-xs font-extrabold text-slate-900">적응 사업 계획하기</span>
                <span className="mt-0.5 block text-[11px] font-bold text-slate-500">
                  {sectorDisplayName(selectedSector)} · {sectorAdaptationProjects.length}개 사업
                </span>
              </span>
              <ChevronDown className={`size-4 text-slate-500 transition-transform ${adaptationPlanningOpen ? 'rotate-180' : ''}`} />
            </button>
            {adaptationPlanningOpen && (
              <div className="border-t border-slate-100 px-3 pb-3">
                <label className="mt-3 block text-xs font-bold text-slate-600">
                  부문
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold"
                    value={selectedSector}
                    onChange={(event) => handleSectorChange(event.target.value)}
                  >
                    {sectors.map((sector) => (
                      <option
                        key={sector.title}
                        value={sector.title}
                        disabled={sector.disabled}
                        className={sector.disabled ? 'text-slate-400' : 'text-slate-900'}
                      >
                        {sectorDisplayName(sector.title)}{sector.disabled ? ' (준비중)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="mt-2 text-[11px] font-bold text-slate-500">
                  선택 부문에 연결된 사업을 검토하고 신규 사업을 추가합니다.
                </p>
                <div className="mt-3 grid gap-2">
                  {sectorAdaptationProjects.map((project) => {
                    const active = project.id === activeAdaptationProjectId;
                    const geometry = geometryOptions.find((item) => item.id === project.geometryType);
                    return (
                      <article
                        key={project.id}
                        className={`rounded-lg border p-2 ${active ? 'border-emerald-500 bg-emerald-50' : 'border-slate-100 bg-slate-50'}`}
                      >
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => selectAdaptationProject(project)}
                        >
                          <span className="block truncate text-xs font-extrabold text-slate-900">{project.title}</span>
                          <span className="mt-1 block text-[11px] font-bold text-slate-500">
                            {sectorDisplayName(project.part)} · {project.item} · {geometry?.label ?? '공간유형'} · 목표 {project.goal.toLocaleString()}{geometry?.unit ?? ''}
                          </span>
                        </button>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className={`rounded-full px-2 py-1 text-[10px] font-extrabold ${active ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500'}`}>
                            {active ? '선택됨' : '계획'}
                          </span>
                          <button
                            type="button"
                            className="text-[10px] font-extrabold text-rose-500 disabled:text-slate-300"
                            disabled={adaptationProjects.length <= 1}
                            onClick={() => removeAdaptationProject(project.id)}
                          >
                            삭제
                          </button>
                        </div>
                      </article>
                    );
                  })}
                  {!sectorAdaptationProjects.length && (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-500">
                      선택한 부문에 등록된 사업이 없습니다.
                    </div>
                  )}
                </div>

                {activeAdaptationProject && (
                  <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-extrabold uppercase tracking-wide text-emerald-700">MAP PLACEMENT</p>
                        <strong className="mt-1 block text-xs text-slate-950">{activeAdaptationProject.title}</strong>
                        <span className="mt-1 block text-[11px] font-bold leading-4 text-slate-600">
                          지도 클릭으로 배치점을 추가합니다. 배치점을 다시 누르면 삭제됩니다.
                        </span>
                      </div>
                      <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-extrabold text-emerald-700">
                        목표 {activeAdaptationProject.goal.toLocaleString()}{geometryOptions.find((geometry) => geometry.id === activeAdaptationProject.geometryType)?.unit ?? ''}
                      </span>
                    </div>
                    <p className="mt-2 rounded-lg bg-white px-2 py-2 text-[11px] font-bold leading-4 text-slate-600">
                      현재 배치 {activeAdaptationPlacementScore.total.toLocaleString()}개 · 설치/중점관리구역 점수는 오른쪽 평가 패널의 이행평가에서 계산합니다.
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  className="mt-3 w-full rounded-lg bg-slate-100 px-3 py-2 text-xs font-extrabold text-slate-700"
                  onClick={() => {
                    if (!projectDesignerOpen) {
                      const firstItem = sectors.find((sector) => sector.title === selectedSector)?.children[0] ?? '';
                      setProjectDraft((current) => ({
                        ...current,
                        part: selectedSector,
                        item: firstItem,
                      }));
                    }
                    setProjectDesignerOpen((current) => !current);
                  }}
                >
                  + 사업 계획 추가
                </button>

                {projectDesignerOpen && (
                  <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 p-3">
                    <label className="block text-xs font-bold text-slate-600">
                      사업 제목
                      <input
                        className="mt-1 w-full rounded-lg border border-emerald-100 px-2 py-1.5 text-xs font-bold"
                        value={projectDraft.title}
                        placeholder="예: 폭염 취약지역 그늘막 설치"
                        onChange={(event) => setProjectDraft((current) => ({ ...current, title: event.target.value }))}
                      />
                    </label>
                    <label className="mt-2 block text-xs font-bold text-slate-600">
                      부문
                      <select
                        className="mt-1 w-full rounded-lg border border-emerald-100 px-2 py-1.5 text-xs font-bold"
                        value={projectDraft.part}
                        onChange={(event) => updateProjectDraftPart(event.target.value)}
                      >
                        {sectors.map((sector) => (
                          <option key={sector.title} value={sector.title} disabled={sector.disabled}>
                            {sectorDisplayName(sector.title)}{sector.disabled ? ' (준비중)' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="mt-2 block text-xs font-bold text-slate-600">
                      사업
                      <select
                        className="mt-1 w-full rounded-lg border border-emerald-100 px-2 py-1.5 text-xs font-bold"
                        value={projectDraft.item}
                        onChange={(event) => setProjectDraft((current) => ({ ...current, item: event.target.value }))}
                      >
                        {projectDraftBusinessOptions.map((business) => <option key={business} value={business}>{business}</option>)}
                      </select>
                    </label>
                    <label className="mt-2 block text-xs font-bold text-slate-600">
                      사업 공간유형
                      <select
                        className="mt-1 w-full rounded-lg border border-emerald-100 px-2 py-1.5 text-xs font-bold"
                        value={projectDraft.geometryType}
                        onChange={(event) => setProjectDraft((current) => ({ ...current, geometryType: event.target.value as AdaptationProjectGeometry }))}
                      >
                        {geometryOptions.map((geometry) => <option key={geometry.id} value={geometry.id}>{geometry.label} · 목표 단위 {geometry.unit}</option>)}
                      </select>
                    </label>
                    <label className="mt-2 block text-xs font-bold text-slate-600">
                      사업 목표 물량
                      <input
                        className="mt-1 w-full rounded-lg border border-emerald-100 px-2 py-1.5 text-xs font-bold"
                        type="number"
                        min="0"
                        step="1"
                        value={projectDraft.goal}
                        onChange={(event) => setProjectDraft((current) => ({ ...current, goal: Number(event.target.value) }))}
                      />
                    </label>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-extrabold text-white"
                        onClick={addAdaptationProject}
                      >
                        계획 추가
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-white px-3 py-2 text-xs font-extrabold text-slate-600"
                        onClick={() => {
                          setProjectDraft(defaultAdaptationProjectDraft());
                          setProjectDesignerOpen(false);
                        }}
                      >
                        취소
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs font-bold text-slate-500">
              선택 지역
              <strong className="mt-1 block text-sm text-slate-900">{selectedRegionName}</strong>
              <span className="mt-0.5 block text-[11px]">행정코드 {selectedSgg}</span>
            </p>
            <button
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#10233f] px-3 py-2.5 text-xs font-extrabold text-white"
              onClick={() => setRiskDialogOpen(true)}
            >
              <Eye className="size-4" />
              리스크 보기
            </button>
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
            priorityReviewOpen={priorityReviewOpen}
            priorityAlternatives={priorityAlternatives}
            activePriorityAlternativeId={activePriorityAlternative?.id ?? ''}
            activePriorityCandidateId={activePriorityCandidate ? candidateKey(activePriorityCandidate) : ''}
            onSelectPriorityCandidate={setActivePriorityCandidateId}
            activeAdaptationProject={activeAdaptationProject}
            adaptationPlacements={adaptationPlacements}
            onAddAdaptationPlacement={addAdaptationPlacement}
            onRemoveAdaptationPlacement={removeAdaptationPlacement}
            onSaveAdaptationPlacements={saveAdaptationPlacementDraft}
            onLoadAdaptationPlacements={loadAdaptationPlacementDraft}
            placementDraftMessage={placementDraftMessage}
          />
        </main>

        <aside className="overflow-auto rounded-lg bg-white p-3 shadow-lg">
          <PriorityReviewRequestSection
            hasRequest={Boolean(inboxPriorityHandoff && priorityCandidateCount)}
            open={priorityReviewOpen}
            alternativeCount={priorityAlternatives.length}
            candidateCount={priorityCandidateCount}
            regionName={inboxPriorityHandoff?.region ?? selectedRegionName}
            projectName={inboxPriorityHandoff?.projectName}
            hazardLabel={inboxPriorityHandoff?.hazardLabel}
            requestStatus={activePriorityRequestStatus}
            onToggle={() => {
              if (!priorityCandidateCount) return;
              if (priorityReviewOpen) {
                setPriorityReviewOpen(false);
              } else {
                startPriorityReview();
              }
            }}
            onArchive={archiveActivePriorityRequest}
            onClear={clearActivePriorityRequest}
            onReactivate={() => {
              setActivePriorityRequestStatus('검토중');
              startPriorityReview();
            }}
          >
            {inboxPriorityHandoff && activePriorityAlternative && (
              <PriorityAlternativeReviewPanel
                handoff={inboxPriorityHandoff}
                alternatives={priorityAlternatives}
                activeAlternative={activePriorityAlternative}
                activeCandidate={activePriorityCandidate}
                selectedAlternativeIds={selectedPriorityAlternativeIds}
                selectedAlternativeCount={selectedPriorityAlternatives.length}
                selectedCandidateCount={selectedPriorityCandidateCount}
                setActiveAlternativeId={setActivePriorityAlternativeId}
                setActiveCandidateId={setActivePriorityCandidateId}
                onToggleAlternativeSelection={togglePriorityAlternativeSelection}
                getReviewState={getCandidateReviewState}
                updateReviewState={updateCandidateReview}
                onHandoffToResponsible={handoffToResponsibleDepartment}
                responsibleHandoffMessage={responsibleHandoffMessage}
                onClose={() => setPriorityReviewOpen(false)}
              />
            )}
          </PriorityReviewRequestSection>

          <button
            className="mt-3 flex w-full items-center justify-between gap-2 rounded-lg bg-[#10233f] px-3 py-2.5 text-sm font-extrabold text-white"
            onClick={() => setEvaluationPanelOpen((current) => !current)}
          >
            <span className="inline-flex items-center gap-2">
              <PanelRightOpen className="size-4" />
              평가 패널
            </span>
            <ChevronDown className={`size-4 transition-transform ${evaluationPanelOpen ? 'rotate-180' : ''}`} />
          </button>
          {evaluationPanelOpen ? (
            <>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {[
                  ['status-target', '현황 및 목표'],
                  ['execution', '이행평가'],
                  ['adaptation-effect', '적응효과평가'],
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

              {rightMode === 'status-target' && (
                <StatusTargetPanel
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
                <ExecutionPanel
                  project={activeAdaptationProject}
                  placements={activeAdaptationPlacements}
                  score={activeAdaptationPlacementScore}
                />
              )}

              {rightMode === 'adaptation-effect' && (
                <AdaptationEffectPanel
                  project={activeAdaptationProject}
                  score={activeAdaptationPlacementScore}
                />
              )}
            </>
          ) : (
            <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold leading-5 text-slate-500">
              평가 패널이 접혀 있습니다. 버튼을 다시 누르면 현황 및 목표, 이행평가, 적응효과평가를 확인할 수 있습니다.
            </div>
          )}

          {evaluationPanelOpen && (
            <section className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
              <div className="flex items-center gap-2 text-sm font-extrabold text-emerald-900">
                <MapPin className="size-4" />
                API 연결 메모
              </div>
              <p className="mt-2 text-xs leading-5 text-emerald-900/75">
                원본 API 구조는 `util/risk/scenario/evaluation`으로 나뉘어 있습니다. 현재는 정적 데이터로 동일한 응답 형태를 흉내 내고, 이후 Java API나 Supabase로 교체하면 됩니다.
              </p>
            </section>
          )}
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

      {priorityNoticeOpen && inboxPriorityHandoff && (
        <PriorityReviewNotice
          handoff={inboxPriorityHandoff}
          alternativeCount={priorityAlternatives.length}
          candidateCount={priorityCandidateCount}
          onStart={startPriorityReview}
          onClose={() => setPriorityNoticeOpen(false)}
        />
      )}
    </div>
  );
}

function LeadDepartmentEntryPage({
  selectedSido,
  selectedSgg,
  selectedRegionName,
  availableSidos,
  availableSggs,
  onSidoChange,
  onSggChange,
  handoff,
  alternativeCount,
  candidateCount,
  onEnter,
  onClearRequest,
}: {
  selectedSido: string;
  selectedSgg: string;
  selectedRegionName: string;
  availableSidos: [string, string][];
  availableSggs: LeadDepartmentSnapshot['regions'];
  onSidoChange: (sidoCode: string) => void;
  onSggChange: (sggCode: string) => void;
  handoff: PriorityHandoffPayload | null;
  alternativeCount: number;
  candidateCount: number;
  onEnter: () => void;
  onClearRequest: () => void;
}) {
  return (
    <main className="min-h-screen bg-[#10233f] text-slate-900">
      <header className="flex h-14 items-center justify-between bg-[#233447] px-5 text-white shadow-xl shadow-slate-950/25">
        <div className="flex items-center gap-3">
          <Link to="/tools#adaptation-support-tools" className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-slate-100">
            <ChevronLeft className="size-4" />
            지원도구 페이지로 돌아가기
          </Link>
          <div>
            <strong className="block text-sm">주관부서 적응대책 지원도구</strong>
            <span className="text-xs text-slate-300">지역을 먼저 선택한 뒤 검토 업무로 들어갑니다.</span>
          </div>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-bold text-slate-200 md:flex">
          <ClipboardList className="size-4 text-emerald-200" />
          중점관리구역 검토 요청
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-5 px-6 py-8 lg:grid-cols-[420px_minmax(0,1fr)]">
        <div className="rounded-2xl bg-white p-5 shadow-xl">
          <p className="text-xs font-extrabold text-emerald-700">REGION SELECT</p>
          <h1 className="mt-2 text-2xl font-black text-slate-950">검토 지역 선택</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            지역을 선택하면 중점관리구역 선정지원도구에서 전달된 검토 요청 건수를 확인할 수 있습니다.
          </p>

          <label className="mt-5 block text-xs font-bold text-slate-600">
            시도
            <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold" value={selectedSido} onChange={(event) => onSidoChange(event.target.value)}>
              {availableSidos.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
          </label>
          <label className="mt-3 block text-xs font-bold text-slate-600">
            시군구
            <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold" value={selectedSgg} onChange={(event) => onSggChange(event.target.value)}>
              {availableSggs.map((region) => <option key={region.sggCode} value={region.sggCode}>{region.sggName}</option>)}
            </select>
          </label>

          <div className="mt-4 rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-bold text-slate-500">선택 지역</p>
            <strong className="mt-1 block text-lg text-slate-950">{selectedRegionName}</strong>
            <span className="text-xs font-bold text-slate-500">행정코드 {selectedSgg}</span>
          </div>

          <button className="mt-5 w-full rounded-lg bg-[#10233f] px-4 py-3 text-sm font-extrabold text-white" onClick={onEnter}>
            주관부서 도구 입장
          </button>
        </div>

        <div className={`rounded-2xl border p-5 shadow-xl ${candidateCount ? 'border-orange-200 bg-orange-50' : 'border-white/10 bg-white'}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold text-orange-700">중점관리구역 검토 요청</p>
              <h2 className="mt-2 text-2xl font-black text-slate-950">요청 건수</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                중점관리구역 선정지원도구에서 주관부서 지원도구로 전달한 요청만 표시합니다.
              </p>
            </div>
            <div className={`grid size-14 place-items-center rounded-2xl ${candidateCount ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
              <Bell className="size-6" />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white p-4">
              <p className="text-xs font-bold text-slate-500">대안</p>
              <strong className="mt-1 block text-3xl text-slate-950">{alternativeCount}</strong>
            </div>
            <div className="rounded-xl bg-white p-4">
              <p className="text-xs font-bold text-slate-500">후보지</p>
              <strong className="mt-1 block text-3xl text-slate-950">{candidateCount}</strong>
            </div>
          </div>

          {handoff ? (
            <div className="mt-4 rounded-xl bg-white p-4">
              <p className="text-xs font-bold text-slate-500">전달 패키지</p>
              <strong className="mt-1 block text-slate-950">{handoff.projectName ?? '중점관리구역 선정지원도구'}</strong>
              <span className="mt-1 block text-xs font-bold text-slate-500">
                {handoff.hazardLabel ?? '재해'} · {handoff.region ?? selectedRegionName}
              </span>
              <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs font-bold leading-5 text-slate-600">
                데이터 구조: 대안 패키지 → 대안 → 여러 후보지 → 후보지별 점수/속성/필지자료
              </p>
            </div>
          ) : (
            <div className="mt-4 rounded-xl bg-white p-4 text-sm font-bold text-slate-500">
              선택 지역에 전달된 중점관리구역 대안이 없습니다.
            </div>
          )}

          {candidateCount ? (
            <div className="mt-4 grid gap-2">
            <p className="rounded-xl bg-orange-100 px-4 py-3 text-xs font-extrabold leading-5 text-orange-800">
              주관부서 도구 입장 후 지도와 평가 패널에서 요청 내용을 검토합니다.
            </p>
            <button type="button" className="rounded-lg border border-orange-200 bg-white px-4 py-2.5 text-xs font-extrabold text-rose-600 shadow-sm transition hover:border-rose-200 hover:bg-rose-50" onClick={onClearRequest}>
              현재 검토 요청 비우기
            </button>
            </div>
          ) : null}
        </div>
      </section>
    </main>
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
  priorityReviewOpen,
  priorityAlternatives,
  activePriorityAlternativeId,
  activePriorityCandidateId,
  onSelectPriorityCandidate,
  activeAdaptationProject,
  adaptationPlacements,
  onAddAdaptationPlacement,
  onRemoveAdaptationPlacement,
  onSaveAdaptationPlacements,
  onLoadAdaptationPlacements,
  placementDraftMessage,
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
  priorityReviewOpen: boolean;
  priorityAlternatives: PriorityAlternative[];
  activePriorityAlternativeId: string;
  activePriorityCandidateId: string;
  onSelectPriorityCandidate: (candidateId: string) => void;
  activeAdaptationProject: AdaptationProjectPlan | null;
  adaptationPlacements: AdaptationPlacement[];
  onAddAdaptationPlacement: (placement: AdaptationPlacement) => void;
  onRemoveAdaptationPlacement: (placementId: string) => void;
  onSaveAdaptationPlacements: () => void;
  onLoadAdaptationPlacements: () => void;
  placementDraftMessage: string;
}) {
  const mapElement = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletGlobal | null>(null);
  const leafletRef = useRef<LeafletGlobal | null>(null);
  const baseLayersRef = useRef<Record<string, LeafletGlobal>>({});
  const overlaysRef = useRef<Record<string, LeafletGlobal>>({});
  const priorityCandidateLayerRef = useRef<LeafletGlobal | null>(null);
  const adaptationPlacementLayerRef = useRef<LeafletGlobal | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [leafletError, setLeafletError] = useState('');
  const [priorityGeometryCache, setPriorityGeometryCache] = useState<Record<string, GeoJsonFeature[]>>({});
  const [priorityMapStatus, setPriorityMapStatus] = useState('');
  const [selectedAdaptationPlacementId, setSelectedAdaptationPlacementId] = useState('');
  const activeProjectPlacements = adaptationPlacements.filter((placement) => placement.projectId === activeAdaptationProject?.id);
  const selectedAdaptationPlacement = adaptationPlacements.find((placement) => placement.id === selectedAdaptationPlacementId) ?? null;

  useEffect(() => {
    let cancelled = false;

    loadLeaflet()
      .then((L) => {
        if (cancelled || !mapElement.current) return;
        leafletRef.current = L;

        const map = L.map(mapElement.current, { zoomControl: true, preferCanvas: true })
          .setView(snapshot.region.center, 12);
        mapRef.current = map;
        if (!map.getPane('priorityCandidate')) {
          map.createPane('priorityCandidate');
        }
        map.getPane('priorityCandidate').style.zIndex = 780;
        if (!map.getPane('priorityCandidateMarker')) {
          map.createPane('priorityCandidateMarker');
        }
        map.getPane('priorityCandidateMarker').style.zIndex = 920;
        if (!map.getPane('adaptationPlacement')) {
          map.createPane('adaptationPlacement');
        }
        map.getPane('adaptationPlacement').style.zIndex = 900;
        if (!map.getPane('adaptationPlacementMarker')) {
          map.createPane('adaptationPlacementMarker');
        }
        map.getPane('adaptationPlacementMarker').style.zIndex = 960;

        baseLayersRef.current = createBaseLayers(L);
        baseLayersRef.current[baseMap].addTo(map);

        overlaysRef.current = createStaticLayers(L, map, snapshot);
        Object.entries(overlaysRef.current).forEach(([id, layer]) => {
          if (layerVisibility[id]) layer.addTo(map);
        });

        priorityCandidateLayerRef.current = L.featureGroup().addTo(map);
        adaptationPlacementLayerRef.current = L.featureGroup().addTo(map);
        fitSelectedRegion(L, map, snapshot.region);
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
      priorityCandidateLayerRef.current = null;
      adaptationPlacementLayerRef.current = null;
      setMapReady(false);
    };
  }, [snapshot.region.code]);

  const editModeRef = useLatest(editMode);
  const selectedSectorRef = useLatest(selectedSector);
  const selectedBusinessRef = useLatest(selectedBusiness);
  const selectedScenarioRef = useLatest(selectedScenario);
  const selectedScenarioUpRef = useLatest(selectedScenarioUp);
  const selectedYearRef = useLatest(selectedYear);
  const activeAdaptationProjectRef = useLatest(activeAdaptationProject);
  const onAddAdaptationPlacementRef = useLatest(onAddAdaptationPlacement);

  useEffect(() => {
    if (!selectedAdaptationPlacementId) return;
    if (!adaptationPlacements.some((placement) => placement.id === selectedAdaptationPlacementId)) {
      setSelectedAdaptationPlacementId('');
    }
  }, [adaptationPlacements, selectedAdaptationPlacementId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const pointerEvents = editMode === 'add' ? 'none' : 'auto';
    ['priorityCandidate', 'priorityCandidateMarker'].forEach((paneName) => {
      const pane = map.getPane?.(paneName);
      if (pane) pane.style.pointerEvents = pointerEvents;
    });
  }, [editMode, mapReady]);

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
    if (!map || !mapReady) return;

    const handleMapClick = (event: any) => {
      if (editModeRef.current !== 'add') return;
      const project = activeAdaptationProjectRef.current;
      if (!project) return;
      const lat = Number(event.latlng?.lat);
      const lng = Number(event.latlng?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const placementId = `adaptation-placement-${Date.now()}-${Math.round(Math.random() * 100000)}`;

      onAddAdaptationPlacementRef.current({
        id: placementId,
        projectId: project.id,
        projectTitle: project.title,
        item: project.item,
        geometryType: project.geometryType,
        points: [{ lat, lng }],
        createdAt: new Date().toISOString(),
      });
      setSelectedAdaptationPlacementId(placementId);
    };

    map.on('click', handleMapClick);
    return () => {
      map.off('click', handleMapClick);
    };
  }, [activeAdaptationProjectRef, mapReady, onAddAdaptationPlacementRef]);

  useEffect(() => {
    const L = leafletRef.current;
    const layer = adaptationPlacementLayerRef.current;
    if (!L || !layer || !mapReady) return;

    layer.clearLayers();
    const activeProjectPlacements = adaptationPlacements.filter((placement) => placement.projectId === activeAdaptationProject?.id);
    const activePoints = activeProjectPlacements
      .map((placement) => placement.points[0])
      .filter((point): point is { lat: number; lng: number } => Boolean(point));

    if (activeAdaptationProject?.geometryType === 'line' && activePoints.length > 1) {
      L.polyline(activePoints.map((point) => [point.lat, point.lng]), {
        pane: 'adaptationPlacement',
        color: '#059669',
        opacity: 0.78,
        weight: 5,
      }).bindTooltip(`${activeAdaptationProject.title} 배치 경로`).addTo(layer);
    }

    if (activeAdaptationProject?.geometryType === 'polygon' && activePoints.length > 2) {
      L.polygon(activePoints.map((point) => [point.lat, point.lng]), {
        pane: 'adaptationPlacement',
        color: '#059669',
        fillColor: '#10b981',
        fillOpacity: 0.18,
        opacity: 0.9,
        weight: 3,
      }).bindTooltip(`${activeAdaptationProject.title} 배치 면`).addTo(layer);
    }

    adaptationPlacements.forEach((placement) => {
      const placementLayer = createAdaptationPlacementMapLayer(
        L,
        placement,
        placement.projectId === activeAdaptationProject?.id,
        placement.id === selectedAdaptationPlacementId,
        setSelectedAdaptationPlacementId
      );
      if (placementLayer) placementLayer.addTo(layer);
    });
  }, [activeAdaptationProject?.id, adaptationPlacements, mapReady, selectedAdaptationPlacementId]);

  useEffect(() => {
    if (!priorityReviewOpen || !mapReady) {
      setPriorityMapStatus('');
      return;
    }

    const activeAlternative = priorityAlternatives.find((alternative) => alternative.id === activePriorityAlternativeId) ?? priorityAlternatives[0];
    const candidates = activeAlternative?.candidates ?? [];
    const missingCandidates = candidates.filter((candidate) => {
      if (priorityCandidateFeatures(candidate).length) return false;
      if (priorityGeometryCache[candidateKey(candidate)]?.length) return false;
      return priorityCandidatePnuList(candidate).length > 0;
    });

    if (!missingCandidates.length) return;

    let cancelled = false;
    setPriorityMapStatus(`PNU 기반 필지 geometry 보완 중 · ${missingCandidates.length}개 후보`);

    (async () => {
      const entries: Array<[string, GeoJsonFeature[]]> = [];
      for (const candidate of missingCandidates.slice(0, 10)) {
        const features = await fetchCandidateFeaturesByPnu(candidate);
        if (features.length) entries.push([candidateKey(candidate), features]);
      }

      if (cancelled) return;
      setPriorityGeometryCache((current) => {
        const next = { ...current };
        entries.forEach(([key, features]) => {
          next[key] = features;
        });
        return next;
      });
      setPriorityMapStatus(entries.length
        ? `${entries.length}개 후보 필지 geometry 보완 완료`
        : 'PNU 재조회 결과가 없어 후보 위치를 지도에 표시하지 못했습니다.'
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activePriorityAlternativeId,
    mapReady,
    priorityAlternatives,
    priorityGeometryCache,
    priorityReviewOpen,
  ]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = priorityCandidateLayerRef.current;
    if (!L || !map || !layer || !mapReady) return;

    layer.clearLayers();
    if (!priorityReviewOpen) return;

    const activeAlternative = priorityAlternatives.find((alternative) => alternative.id === activePriorityAlternativeId) ?? priorityAlternatives[0];
    const candidates = activeAlternative?.candidates ?? [];
    const activeCandidate = candidates.find((candidate) => candidateKey(candidate) === activePriorityCandidateId) ?? candidates[0];
    const candidatesToRender = activeCandidate ? [activeCandidate] : candidates;

    candidatesToRender.forEach((candidate) => {
      const hydratedCandidate = withHydratedPriorityGeometry(candidate, priorityGeometryCache);
      const candidateLayer = createPriorityCandidateMapLayer(L, hydratedCandidate, true);
      if (!candidateLayer) return;
      candidateLayer.on?.('click', (event: any) => {
        if (editModeRef.current === 'add') return;
        L.DomEvent?.stopPropagation?.(event);
        onSelectPriorityCandidate(candidateKey(candidate));
      });
      candidateLayer.addTo(layer);
    });

    const activeLayer = activeCandidate ? createPriorityCandidateMapLayer(L, withHydratedPriorityGeometry(activeCandidate, priorityGeometryCache), true) : null;
    const bounds = activeLayer?.getBounds?.();
    if (bounds?.isValid?.()) {
      map.fitBounds(bounds, { padding: [42, 42], maxZoom: 17 });
    } else {
      const center = priorityCandidateCenter(activeCandidate);
      if (center) map.setView([center.lat, center.lng], 16);
    }
  }, [
    activePriorityAlternativeId,
    activePriorityCandidateId,
    mapReady,
    onSelectPriorityCandidate,
    priorityAlternatives,
    priorityGeometryCache,
    priorityReviewOpen,
  ]);

  return (
    <>
      <div ref={mapElement} className="absolute inset-0 z-0" />
      {leafletError && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-slate-100 p-8 text-center">
          <p className="rounded-2xl bg-white px-5 py-4 text-sm font-bold text-slate-700 shadow">{leafletError}</p>
        </div>
      )}

      {priorityReviewOpen && (
        <div className="absolute left-4 top-32 z-[520] max-w-xs rounded-2xl border border-orange-200 bg-white/95 p-3 text-xs shadow-lg backdrop-blur">
          <div className="flex items-center gap-2 font-extrabold text-orange-900">
            <MapPin className="size-4" />
            중점관리 후보지 검토 중
          </div>
          <p className="mt-1 leading-5 text-orange-800">
            활성 대안의 후보지 필지 묶음을 지도에 표시합니다.
          </p>
          {priorityMapStatus && (
            <p className="mt-2 rounded-lg bg-orange-50 p-2 font-bold leading-4 text-orange-900">
              {priorityMapStatus}
            </p>
          )}
        </div>
      )}

      {activeAdaptationProject && (
        <div
          className="absolute bottom-4 left-1/2 z-[620] w-[min(620px,calc(100%-32px))] -translate-x-1/2 rounded-2xl border border-white/70 bg-white/95 p-3 shadow-2xl backdrop-blur"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-emerald-700">지도 배치 모드</p>
              <strong className="block truncate text-sm text-slate-950">{activeAdaptationProject.title}</strong>
              <span className="mt-0.5 block text-[11px] font-bold text-slate-500">
                지도 클릭으로 배치점을 추가합니다. 배치점 클릭 후 선택 삭제할 수 있습니다.
              </span>
              <span className="mt-1 block text-[11px] font-bold text-emerald-700">
                {placementDraftMessage}
              </span>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-extrabold text-slate-600">
                배치 {activeProjectPlacements.length.toLocaleString()}개
              </span>
              <button
                type="button"
                className={`rounded-lg px-3 py-2 text-xs font-extrabold ${editMode === 'add' ? 'bg-emerald-700 text-white' : 'bg-emerald-50 text-emerald-700'}`}
                onClick={() => setEditMode(editMode === 'add' ? 'none' : 'add')}
              >
                {editMode === 'add' ? '배치 추가 중지' : '배치 추가 시작'}
              </button>
              <button
                type="button"
                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-extrabold text-white"
                onClick={onSaveAdaptationPlacements}
              >
                배치 저장
              </button>
              <button
                type="button"
                className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-extrabold text-emerald-700"
                onClick={onLoadAdaptationPlacements}
              >
                저장 불러오기
              </button>
              <button
                type="button"
                className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-extrabold text-slate-700 disabled:text-slate-300"
                disabled={!activeProjectPlacements.length}
                onClick={() => {
                  const latest = activeProjectPlacements[activeProjectPlacements.length - 1];
                  if (!latest) return;
                  onRemoveAdaptationPlacement(latest.id);
                  if (selectedAdaptationPlacementId === latest.id) setSelectedAdaptationPlacementId('');
                }}
              >
                최근 배치 취소
              </button>
              <button
                type="button"
                className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-extrabold text-rose-600 disabled:text-slate-300"
                disabled={!selectedAdaptationPlacement}
                onClick={() => {
                  if (!selectedAdaptationPlacement) return;
                  onRemoveAdaptationPlacement(selectedAdaptationPlacement.id);
                  setSelectedAdaptationPlacementId('');
                }}
              >
                선택 삭제
              </button>
              <button
                type="button"
                className="rounded-lg bg-white px-3 py-2 text-xs font-extrabold text-slate-500 ring-1 ring-slate-100 disabled:text-slate-300"
                disabled={!selectedAdaptationPlacementId}
                onClick={() => setSelectedAdaptationPlacementId('')}
              >
                선택 해제
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="absolute right-4 top-4 z-[500] w-56 rounded-xl border border-white/70 bg-white/90 p-3 shadow-lg backdrop-blur">
        <div className="flex items-center gap-2 text-xs font-extrabold">
          <Layers className="size-4 text-emerald-700" />
          지도 레이어
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1">
          {baseMapOptions.map((option) => (
            <button
              key={option.id}
              className={`rounded-md px-1 py-1.5 text-[10px] font-extrabold ${baseMap === option.id ? 'bg-[#10233f] text-white' : 'bg-slate-100 text-slate-600'}`}
              onClick={() => setBaseMap(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="mt-2 grid gap-1 text-xs font-bold text-slate-600">
          {snapshot.layers.map((layer) => (
            <label key={layer.id} className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5">
              <input type="checkbox" checked={Boolean(layerVisibility[layer.id])} onChange={() => onToggleLayer(layer.id)} />
              <span className="truncate text-slate-800">{layer.name}</span>
            </label>
          ))}
        </div>
        <p className="hidden">
          {hasVWorldApiKey()
            ? 'VWorld 행정경계 레이어를 사용할 수 있습니다.'
            : 'VWorld API 키가 없으면 공식 WMS 레이어는 비활성화되고 로컬 예시 경계를 표시합니다.'}
        </p>
      </div>

    </>
  );
}

function PriorityReviewNotice({
  handoff,
  alternativeCount,
  candidateCount,
  onStart,
  onClose,
}: {
  handoff: PriorityHandoffPayload;
  alternativeCount: number;
  candidateCount: number;
  onStart: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[3000] grid place-items-center bg-slate-950/55 p-4">
      <section className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-orange-100 text-orange-700">
              <Bell className="size-5" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-950">검토할 중점관리구역 대안이 있습니다</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {handoff.region ?? '선택 지역'} 기준으로 {alternativeCount}개 대안, {candidateCount}개 후보지가 전달되었습니다.
              </p>
            </div>
          </div>
          <button className="rounded-full bg-slate-100 p-2" onClick={onClose}><X className="size-5" /></button>
        </div>
        <div className="mt-4 rounded-xl border border-orange-100 bg-orange-50 p-4 text-sm text-orange-950">
          <b className="block">{handoff.projectName ?? '중점관리구역 선정지원도구'}</b>
          <span className="mt-1 block text-xs font-bold text-orange-800">
            {handoff.hazardLabel ?? '재해'} · 패키지 {handoff.packageId ?? handoff.createdAt ?? 'local'}
          </span>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-extrabold text-slate-600" onClick={onClose}>나중에 보기</button>
          <button className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-extrabold text-white" onClick={onStart}>검토 시작</button>
        </div>
      </section>
    </div>
  );
}

function PriorityReviewRequestSection({
  hasRequest,
  open,
  alternativeCount,
  candidateCount,
  regionName,
  projectName,
  hazardLabel,
  requestStatus,
  onToggle,
  onArchive,
  onClear,
  onReactivate,
  children,
}: {
  hasRequest: boolean;
  open: boolean;
  alternativeCount: number;
  candidateCount: number;
  regionName: string;
  projectName?: string;
  hazardLabel?: string;
  requestStatus: PriorityRequestStatus;
  onToggle: () => void;
  onArchive: () => void;
  onClear: () => void;
  onReactivate: () => void;
  children: ReactNode;
}) {
  const archived = requestStatus === '보관';
  const statusClass = requestStatus === '전달완료'
    ? 'bg-emerald-100 text-emerald-700'
    : requestStatus === '검토중'
      ? 'bg-sky-100 text-sky-700'
      : archived
        ? 'bg-slate-200 text-slate-600'
        : 'bg-orange-100 text-orange-700';

  return (
    <section className={`rounded-xl border p-2.5 ${hasRequest ? 'border-orange-200 bg-orange-50' : 'border-slate-200 bg-slate-50'}`}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={hasRequest && !archived ? onToggle : undefined}
      >
        <div className="flex min-w-0 items-center gap-2">
          <div className={`grid size-8 shrink-0 place-items-center rounded-lg ${hasRequest ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
            <ClipboardList className="size-3.5" />
          </div>
          <div className="min-w-0">
            <p className={`text-xs font-extrabold ${hasRequest ? 'text-orange-700' : 'text-slate-500'}`}>중점관리구역 검토 요청</p>
            <h2 className="truncate text-sm font-extrabold text-slate-950">
              {hasRequest ? `${regionName || '선택 지역'} 대안 검토` : '검토 요청 없음'}
            </h2>
            <p className="text-[11px] font-bold leading-4 text-slate-600">
              {hasRequest
                ? `${alternativeCount}개 대안 · ${candidateCount}개 후보`
                : '전달된 중점관리구역 대안 요청이 없습니다.'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {hasRequest ? (
            <span className={`rounded-full px-2 py-1 text-[10px] font-extrabold ${statusClass}`}>
              {requestStatus}
            </span>
          ) : null}
          {hasRequest && !archived ? (
            <ChevronDown className={`size-4 text-orange-700 transition-transform ${open ? 'rotate-180' : ''}`} />
          ) : null}
        </div>
      </button>

      {hasRequest ? (
        <div className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-[11px] font-bold leading-4 text-orange-900">
          <span className="block truncate">{projectName ?? '중점관리구역 선정지원도구'}</span>
          <span className="block truncate text-orange-700">{hazardLabel ?? '재해'} · {regionName || '선택 지역'}</span>
        </div>
      ) : (
        <div className="mt-2 rounded-lg bg-white px-3 py-2 text-[11px] font-bold leading-4 text-slate-500">
          중점관리구역 선정지원도구에서 대안을 전달하면 이 영역이 열리고 후보지 검토를 시작할 수 있습니다.
        </div>
      )}

      {hasRequest && !open && (
        archived ? (
          <button
            type="button"
            className="mt-2 w-full rounded-lg bg-white px-3 py-2 text-xs font-extrabold text-slate-700 shadow-sm"
            onClick={onReactivate}
          >
            보관 요청 다시 활성화
          </button>
        ) : (
          <button
            type="button"
            className="mt-2 w-full rounded-lg bg-white px-3 py-2 text-xs font-extrabold text-orange-700 shadow-sm"
            onClick={onToggle}
          >
            대안 검토 펼치기
          </button>
        )
      )}

      {hasRequest && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="rounded-lg bg-white px-2 py-2 text-[11px] font-extrabold text-slate-600 shadow-sm"
            onClick={archived ? onReactivate : onArchive}
          >
            {archived ? '다시 활성화' : '요청 보관'}
          </button>
          <button
            type="button"
            className="rounded-lg bg-white px-2 py-2 text-[11px] font-extrabold text-rose-600 shadow-sm"
            onClick={onClear}
          >
            요청 초기화
          </button>
        </div>
      )}

      {hasRequest && open && !archived ? children : null}
    </section>
  );
}

function PriorityAlternativeReviewPanel({
  handoff,
  alternatives,
  activeAlternative,
  activeCandidate,
  selectedAlternativeIds,
  selectedAlternativeCount,
  selectedCandidateCount,
  setActiveAlternativeId,
  setActiveCandidateId,
  onToggleAlternativeSelection,
  getReviewState,
  updateReviewState,
  onHandoffToResponsible,
  responsibleHandoffMessage,
  onClose,
}: {
  handoff: PriorityHandoffPayload;
  alternatives: PriorityAlternative[];
  activeAlternative: PriorityAlternative;
  activeCandidate: PriorityCandidate | null;
  selectedAlternativeIds: string[];
  selectedAlternativeCount: number;
  selectedCandidateCount: number;
  setActiveAlternativeId: (id: string) => void;
  setActiveCandidateId: (id: string) => void;
  onToggleAlternativeSelection: (alternativeId: string) => void;
  getReviewState: (candidate: PriorityCandidate) => CandidateReviewState[string];
  updateReviewState: (candidate: PriorityCandidate, state: CandidateReviewState[string]) => void;
  onHandoffToResponsible: () => void;
  responsibleHandoffMessage: string;
  onClose: () => void;
}) {
  const riskValues = activeAlternative.candidates
    .map((candidate) => Number(candidate.scores?.risk ?? candidate.risk))
    .filter(Number.isFinite);
  const averageRisk = activeAlternative.summary?.averageRisk ?? (riskValues.length ? riskValues.reduce((sum, value) => sum + value, 0) / riskValues.length : null);
  const maxRisk = activeAlternative.summary?.maxRisk ?? (riskValues.length ? Math.max(...riskValues) : null);

  return (
    <section className="mt-2 rounded-xl border border-orange-200 bg-orange-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold text-orange-700">중점관리구역 대안 패키지</p>
          <h2 className="mt-1 text-base font-extrabold text-slate-950">{handoff.region ?? '선택 지역'} 후보 검토</h2>
          <p className="mt-1 text-xs font-bold leading-5 text-orange-900">
            대안 → 후보지 → 점수/속성/필지자료 구조로 전달된 데이터 묶음입니다.
          </p>
        </div>
        <button className="rounded-full bg-white p-1.5 text-slate-500" onClick={onClose}><X className="size-4" /></button>
      </div>

      <div className="mt-2 rounded-xl border border-emerald-100 bg-emerald-50 p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="m-0 text-xs font-extrabold leading-5 text-emerald-900">
              전달 선택 {selectedAlternativeCount}개 대안 · {selectedCandidateCount}개 후보
            </p>
            <p className="m-0 text-[11px] font-bold leading-4 text-emerald-800">{responsibleHandoffMessage}</p>
          </div>
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-extrabold text-white disabled:bg-slate-200 disabled:text-slate-500"
            disabled={!selectedAlternativeCount}
            onClick={onHandoffToResponsible}
          >
            <Route className="size-3.5" />
            사업소관부서 지원도구로 전달
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {alternatives.map((alternative) => {
          const selectedForHandoff = selectedAlternativeIds.includes(alternative.id);
          return (
            <div
              key={alternative.id}
              className={`rounded-lg border p-2 ${activeAlternative.id === alternative.id ? 'border-orange-500 bg-orange-600 text-white' : 'border-orange-100 bg-white text-orange-900'}`}
            >
              <button
                className="w-full text-center text-xs font-extrabold"
                onClick={() => {
                  setActiveAlternativeId(alternative.id);
                  const firstCandidate = alternative.candidates[0];
                  if (firstCandidate) setActiveCandidateId(candidateKey(firstCandidate));
                }}
              >
                <span className="block truncate">{alternative.name}</span>
                <small className="block text-[10px] opacity-80">{alternative.candidates.length}개 후보</small>
              </button>
              <label className={`mt-2 flex items-center justify-center gap-1 rounded-md px-2 py-1 text-[10px] font-extrabold ${selectedForHandoff ? 'bg-emerald-600 text-white' : activeAlternative.id === alternative.id ? 'bg-white/15 text-white' : 'bg-slate-50 text-slate-600'}`}>
                <input
                  type="checkbox"
                  className="size-3"
                  checked={selectedForHandoff}
                  onChange={() => onToggleAlternativeSelection(alternative.id)}
                />
                전달 선택
              </label>
            </div>
          );
        })}
      </div>

      <div className="mt-3 rounded-xl bg-white p-3">
        <b className="text-sm text-slate-950">{activeAlternative.name}</b>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          {activeAlternative.description || activeAlternative.analysisMessage || '후보지 검토 대안입니다.'}
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px] font-extrabold">
          <span className="rounded-lg bg-slate-50 p-2">후보 {activeAlternative.candidates.length}개</span>
          <span className="rounded-lg bg-slate-50 p-2">평균 Risk {formatNullableScore(averageRisk)}</span>
          <span className="rounded-lg bg-slate-50 p-2">최대 Risk {formatNullableScore(maxRisk)}</span>
        </div>
      </div>

      <div className="mt-3 grid max-h-72 gap-2 overflow-auto pr-1">
        {activeAlternative.candidates.map((candidate) => {
          const selected = activeCandidate && candidateKey(candidate) === candidateKey(activeCandidate);
          const reviewState = getReviewState(candidate);
          return (
            <article key={candidateKey(candidate)} className={`rounded-xl border bg-white p-3 ${selected ? 'border-orange-500 shadow' : 'border-slate-100'}`}>
              <button className="w-full text-left" onClick={() => setActiveCandidateId(candidateKey(candidate))}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <b className="text-sm text-slate-950">{candidate.name ?? `후보 ${candidate.rank ?? ''}`}</b>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {candidate.attributes?.area ?? candidate.area ?? '-'} · {candidate.attributes?.parcelCount ?? candidate.parcelCount ?? 0}필지
                    </p>
                  </div>
                  <span className="rounded-full bg-orange-100 px-2 py-1 text-[11px] font-extrabold text-orange-700">
                    {reviewState}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-1 text-center text-[11px] font-extrabold">
                  <span className="rounded-lg bg-slate-50 p-2">Risk {formatNullableScore(candidate.scores?.risk ?? candidate.risk)}</span>
                  <span className="rounded-lg bg-slate-50 p-2">H {formatNullableScore(candidate.scores?.h ?? candidate.h)}</span>
                  <span className="rounded-lg bg-slate-50 p-2">E {formatNullableScore(candidate.scores?.e ?? candidate.e)}</span>
                  <span className="rounded-lg bg-slate-50 p-2">V {formatNullableScore(candidate.scores?.v ?? candidate.v)}</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600">{candidate.attributes?.reason ?? candidate.reason ?? '후보지 산출 사유가 전달되지 않았습니다.'}</p>
                <p className="mt-1 text-[11px] font-bold leading-4 text-slate-400">
                  PNU {(candidate.attributes?.pnuList ?? candidate.pnuList ?? []).slice(0, 3).join(', ') || '없음'}
                </p>
              </button>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button className="rounded-lg bg-slate-100 px-2 py-2 text-xs font-extrabold text-slate-700" onClick={() => updateReviewState(candidate, '검토중')}>검토중</button>
                <button className="inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-600 px-2 py-2 text-xs font-extrabold text-white" onClick={() => updateReviewState(candidate, '확인')}>
                  <CheckCircle2 className="size-3.5" />
                  확인
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function StatusTargetPanel({
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
  return (
    <div className="mt-4 grid gap-4">
      <OverallPanel snapshot={snapshot} sggName={sggName} />
      <SectorPanel
        snapshot={snapshot}
        sggName={sggName}
        sector={sector}
        business={business}
        scenario={scenario}
        scenarioChart={scenarioChart}
        scenarioMatrix={scenarioMatrix}
      />
    </div>
  );
}

function OverallPanel({ snapshot, sggName }: { snapshot: LeadDepartmentSnapshot; sggName: string }) {
  const sequenceBreaks = snapshot.urbanIndex.filter((row, index, rows) => index === 0 || row.sequence !== rows[index - 1].sequence);

  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <h2 className="text-lg font-extrabold">{sggName} 현황</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">연도별 종합평가 수치와 거버넌스·적응효과·만족도 지표를 목표 계획의 기준 현황으로 확인합니다.</p>
      <div className="mt-4 h-56 min-w-0 rounded-xl bg-slate-50 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={snapshot.urbanIndex} margin={{ top: 10, right: 8, left: -22, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="year" />
            <YAxis domain={[0, 5]} />
            <Tooltip />
            {sequenceBreaks.map((row) => <ReferenceLine key={row.year} x={row.year} stroke="#ef4444" strokeDasharray="4 3" label={row.sequence} />)}
            <Line type="stepAfter" dataKey="total" name="종합수치" stroke="#111827" strokeWidth={2.5} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 h-60 min-w-0 rounded-xl bg-slate-50 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={snapshot.urbanIndex} margin={{ top: 10, right: 8, left: -22, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="year" />
            <YAxis domain={[0, 5]} />
            <Tooltip />
            <Legend />
            <Line type="stepAfter" dataKey="governance" name="거버넌스" stroke="#30a9de" strokeWidth={2} />
            <Line type="stepAfter" dataKey="adaptationEffect" name="적응효과" stroke="#eab308" strokeWidth={2} />
            <Line type="stepAfter" dataKey="satisfaction" name="만족도" stroke="#ef4444" strokeWidth={2} />
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
    <section className="rounded-xl border border-slate-200 p-4">
      <h2 className="text-lg font-extrabold">{sggName} {sectorDisplayName(sector)} 목표 계획</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{scenario} · {business} · 상승시기 시나리오별 필요 목표와 기존 계획량을 비교합니다.</p>
      <div className="mt-4 h-60 min-w-0 rounded-xl bg-slate-50 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={scenarioChart} margin={{ top: 10, right: 8, left: -22, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="year" />
            <YAxis domain={[0, 5]} />
            <Tooltip />
            <Legend />
            {scenarioUpList.map((scenarioUp, index) => (
              <Line key={scenarioUp} type="stepAfter" dataKey={scenarioUp} stroke={colors[index]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full table-fixed text-left text-[11px]">
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

function ExecutionPanel({
  project,
  placements,
  score,
}: {
  project: AdaptationProjectPlan | null;
  placements: AdaptationPlacement[];
  score: AdaptationPlacementScore;
}) {
  const projectUnit = project ? geometryOptions.find((geometry) => geometry.id === project.geometryType)?.unit ?? score.unit : score.unit;
  const implementationPercent = Math.round(score.implementationScore * 100);
  const citizenPercent = Math.round(score.citizenScore * 100);

  return (
    <section className="mt-4 rounded-xl border border-slate-200 p-4">
      <h2 className="text-lg font-extrabold">사업 이행평가</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        선택한 사업의 목표 물량 대비 지도에 실제 배치된 물량을 이행점수로 계산합니다. 중점관리구역 내부 설치 비율은 시민 친화 이행점수로 별도 평가합니다.
      </p>
      <div className="mt-4 grid gap-3">
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-bold text-slate-500">선택 사업</p>
          <strong className="mt-1 block text-base text-slate-950">{project?.title ?? '사업을 선택하세요'}</strong>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {project ? `${sectorDisplayName(project.part)} · ${project.item} · ${geometryOptions.find((geometry) => geometry.id === project.geometryType)?.label}` : '왼쪽 적응 사업 계획하기에서 사업을 선택하면 평가가 활성화됩니다.'}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
            <p className="text-[11px] font-bold text-slate-500">목표</p>
            <strong className="mt-1 block text-xl text-slate-950">{score.target.toLocaleString()}</strong>
            <span className="text-[11px] font-bold text-slate-400">{projectUnit}</span>
          </div>
          <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
            <p className="text-[11px] font-bold text-slate-500">지도 배치</p>
            <strong className="mt-1 block text-xl text-slate-950">{formatExecutionValue(score.implementedValue)}</strong>
            <span className="text-[11px] font-bold text-slate-400">{projectUnit}</span>
          </div>
          <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
            <p className="text-[11px] font-bold text-slate-500">후보지 내부</p>
            <strong className="mt-1 block text-xl text-emerald-700">{formatExecutionValue(score.insideValue)}</strong>
            <span className="text-[11px] font-bold text-slate-400">{projectUnit}</span>
          </div>
        </div>
        <div className="rounded-xl bg-emerald-50 p-4">
          <div className="flex items-center justify-between text-xs font-bold text-emerald-800">
            <span>이행점수</span>
            <span>{score.implementationScore.toFixed(2)} / 1.00</span>
          </div>
          <MetricBar label="목표 대비 배치 비율" value={implementationPercent} />
        </div>
        <div className="rounded-xl bg-sky-50 p-4">
          <div className="flex items-center justify-between text-xs font-bold text-sky-800">
            <span>시민 친화 이행점수</span>
            <span>{score.citizenScore.toFixed(2)} / 1.00</span>
          </div>
          <MetricBar label="목표 대비 중점관리구역 내부 설치 비율" value={citizenPercent} />
          <p className="mt-2 text-xs font-bold leading-5 text-sky-800">
            중점관리구역 후보 필지 내부에 배치된 사업 물량만 별도로 계산합니다.
          </p>
        </div>
        {placements.length ? (
          <div className="max-h-48 overflow-auto rounded-xl border border-slate-100">
            {placements.slice().reverse().map((placement, index) => (
              <div key={placement.id} className="flex items-center justify-between border-t border-slate-100 px-3 py-2 first:border-t-0">
                <span className="text-xs font-bold text-slate-600">배치 {placements.length - index}</span>
                <span className="text-[11px] font-bold text-slate-400">
                  {placement.points[0]?.lat.toFixed(5)}, {placement.points[0]?.lng.toFixed(5)}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function AdaptationEffectPanel({
  project,
  score,
}: {
  project: AdaptationProjectPlan | null;
  score: AdaptationPlacementScore;
}) {
  const effect = estimateAdaptationEffect(project, score);

  return (
    <section className="mt-4 rounded-xl border border-slate-200 p-4">
      <h2 className="text-lg font-extrabold">적응효과평가</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        이행 여부와 분리해서 사업이 만들어내는 적응효과를 평가합니다. 현재는 업로드한 LH_EXEModel의 기온 모듈 구조를 반영한 간이 추정값입니다.
      </p>
      <div className="mt-4 grid gap-3">
        <div className="rounded-xl bg-orange-50 p-4">
          <p className="text-xs font-bold text-orange-700">기온 저감 효과 추정</p>
          <strong className="mt-1 block text-2xl text-orange-950">{effect.deltaTC.toFixed(3)}℃</strong>
          <p className="mt-1 text-xs leading-5 text-orange-800">
            ΔT = k_temp × ΔR_abs × canopy_block_factor × F_shadow 구조를 사용했습니다.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs font-bold">
          <div className="rounded-xl bg-slate-50 p-3">
            <span className="text-slate-500">추정 그림자율</span>
            <strong className="mt-1 block text-lg text-slate-950">{Math.round(effect.fShadow * 100)}%</strong>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <span className="text-slate-500">흡수 감소 에너지</span>
            <strong className="mt-1 block text-lg text-slate-950">{effect.deltaR.toFixed(1)} W/m²</strong>
          </div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-3 text-xs font-bold leading-5 text-slate-600">
          <span className="block text-slate-900">모델 연결 메모</span>
          zip의 `engines/engine/calculators/temperature/temper_calc.py`는 알베도, 일사량, 수관 차단계수, 그림자율로 기온 저감량을 계산하고, stage3에서는 격자별 ΔT GeoTIFF로 확장하는 구조입니다.
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

function readPriorityHandoffPayload(): PriorityHandoffPayload | null {
  const candidates: Array<string | null> = [];

  try {
    candidates.push(window.localStorage.getItem(PRIORITY_HANDOFF_KEY));
    candidates.push(window.sessionStorage.getItem(PRIORITY_HANDOFF_KEY));
  } catch {
    // Storage can be unavailable in some embedded browser modes.
  }

  candidates.push(window.name || null);

  for (const raw of candidates) {
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const payload = parsed?.type === PRIORITY_HANDOFF_KEY ? parsed.payload : parsed;
      if (payload?.schemaVersion === 'priority-management-handoff/v1' && Array.isArray(payload.alternatives)) {
        if (isRecalledPriorityHandoffPayload(payload)) {
          clearPriorityHandoffPayload();
          return null;
        }
        try {
          window.localStorage.setItem(PRIORITY_HANDOFF_KEY, JSON.stringify(payload));
        } catch {
          window.sessionStorage.setItem(PRIORITY_HANDOFF_KEY, JSON.stringify(payload));
        }
        return payload;
      }
    } catch {
      // Ignore non-handoff window.name or stale storage values.
    }
  }

  return null;
}

function isRecalledPriorityHandoffPayload(payload: PriorityHandoffPayload) {
  try {
    const raw = window.localStorage.getItem(PRIORITY_HANDOFF_RECALL_KEY);
    if (!raw) return false;
    const recall = JSON.parse(raw);
    if (!recall?.packageId && !recall?.regionCode) return true;
    if (recall?.packageId && recall.packageId === payload.packageId) return true;
    return Boolean(recall?.regionCode && payload.regionCode && recall.regionCode === payload.regionCode);
  } catch {
    return false;
  }
}

function priorityRecallFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('handoffRelay') !== 'priority-management') return null;
    if (params.get('handoffRecall') !== 'priority-management') return null;
    return {
      packageId: params.get('packageId') || undefined,
      regionCode: params.get('regionCode') || undefined,
    };
  } catch {
    return null;
  }
}

function markPriorityHandoffRecalled(packageId?: string, regionCode?: string) {
  try {
    window.localStorage.setItem(PRIORITY_HANDOFF_RECALL_KEY, JSON.stringify({
      packageId: packageId || null,
      regionCode: regionCode || null,
      recalledAt: new Date().toISOString(),
    }));
  } catch {
    // Recall markers are only used to suppress stale local demo payloads.
  }
}

function createPriorityHandoffChannel() {
  try {
    return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(PRIORITY_HANDOFF_CHANNEL);
  } catch {
    return null;
  }
}

function broadcastPriorityRecall(packageId?: string, regionCode?: string) {
  const channel = createPriorityHandoffChannel();
  if (!channel) return;
  try {
    channel.postMessage({
      type: `${PRIORITY_HANDOFF_KEY}:recall`,
      packageId,
      regionCode,
    });
  } finally {
    channel.close();
  }
}

function broadcastPriorityPayload(payload: PriorityHandoffPayload) {
  const channel = createPriorityHandoffChannel();
  if (!channel) return;
  try {
    channel.postMessage({
      type: PRIORITY_HANDOFF_KEY,
      payload,
    });
  } finally {
    channel.close();
  }
}

function readPriorityRequestLifecycle(): PriorityRequestLifecycle {
  try {
    const raw = window.localStorage.getItem(LEAD_REQUEST_LIFECYCLE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function priorityRequestKey(handoff?: PriorityHandoffPayload | null) {
  if (!handoff) return '';
  return String(
    handoff.packageId ||
    `${handoff.regionCode || 'region'}:${handoff.hazardLabel || 'hazard'}:${handoff.createdAt || handoff.deliveredToLeadAt || 'local'}`
  );
}

function adaptationPlacementStorageKey(regionCode: string, handoff?: PriorityHandoffPayload | null) {
  const requestKey = priorityRequestKey(handoff) || 'local';
  return `${LEAD_ADAPTATION_PLACEMENT_KEY}:${regionCode || 'region'}:${requestKey}`;
}

function clearPriorityHandoffPayload() {
  try {
    window.localStorage.removeItem(PRIORITY_HANDOFF_KEY);
  } catch {
    // Ignore storage cleanup failures in embedded browsers.
  }

  try {
    window.sessionStorage.removeItem(PRIORITY_HANDOFF_KEY);
  } catch {
    // Ignore storage cleanup failures in embedded browsers.
  }

  try {
    const parsed = JSON.parse(window.name || '{}');
    if (parsed?.type === PRIORITY_HANDOFF_KEY || parsed?.schemaVersion === 'priority-management-handoff/v1') window.name = '';
  } catch {
    // Leave unrelated window.name values untouched.
  }
}

function isPriorityHandoffRecallMessage(data: unknown): data is { type: string; packageId?: string; regionCode?: string } {
  return Boolean(data && typeof data === 'object' && (data as { type?: string }).type === `${PRIORITY_HANDOFF_KEY}:recall`);
}

function isDeliveredPriorityHandoff(payload?: PriorityHandoffPayload | null): payload is PriorityHandoffPayload {
  return Boolean(
    payload?.schemaVersion === 'priority-management-handoff/v1' &&
    Array.isArray(payload.alternatives) &&
    (payload.deliveryStatus === 'sent-to-lead' || payload.deliveredToLeadAt)
  );
}

function priorityPayloadFromMessage(data: unknown): PriorityHandoffPayload | null {
  if (!data || typeof data !== 'object') return null;
  const message = data as { type?: string; payload?: PriorityHandoffPayload } | PriorityHandoffPayload | null;
  const payload = message && 'type' in message && message.type === PRIORITY_HANDOFF_KEY
    ? message.payload
    : message;
  return payload?.schemaVersion === 'priority-management-handoff/v1' && Array.isArray(payload.alternatives)
    ? payload
    : null;
}

function persistPriorityHandoffPayload(payload: PriorityHandoffPayload) {
  try {
    window.localStorage.removeItem(PRIORITY_HANDOFF_RECALL_KEY);
    window.localStorage.setItem(PRIORITY_HANDOFF_KEY, JSON.stringify(payload));
  } catch {
    window.sessionStorage.setItem(PRIORITY_HANDOFF_KEY, JSON.stringify(payload));
  }
}

async function fetchPriorityHandoffFromInbox(regionCode: string): Promise<PriorityHandoffPayload | null> {
  try {
    const url = new URL(PRIORITY_HANDOFF_INBOX_URL, window.location.origin);
    url.searchParams.set('regionCode', regionCode);
    const response = await fetch(url.toString(), { cache: 'no-store' });
    if (!response.ok) return null;
    const result = await response.json();
    return priorityPayloadFromMessage(result?.payload);
  } catch {
    return null;
  }
}

async function saveResponsibleHandoffToInbox(payload: Record<string, any>) {
  try {
    const response = await fetch(RESPONSIBLE_HANDOFF_INBOX_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function fetchResponsibleReviewResponse(regionCode: string) {
  try {
    const url = new URL(RESPONSIBLE_REVIEW_INBOX_URL, window.location.origin);
    url.searchParams.set('regionCode', regionCode);
    const response = await fetch(url.toString(), { cache: 'no-store' });
    if (!response.ok) return null;
    const result = await response.json();
    const payload = result?.payload;
    return payload?.schemaVersion === 'responsible-to-lead-review/v1' ? payload : null;
  } catch {
    return null;
  }
}

function priorityHandoffMatchesRegion(
  handoff: PriorityHandoffPayload,
  selectedCode: string,
  region: LeadDepartmentSnapshot['region']
) {
  const handoffCode = handoff.regionCode;
  if (!handoffCode) return false;
  const selectedParentCode = selectedCode.length >= 4 ? `${selectedCode.slice(0, 4)}0` : selectedCode;
  const childParentCodes = region.cdList.map((code) => `${code.slice(0, 4)}0`);
  return (
    handoffCode === selectedCode ||
    handoffCode === selectedParentCode ||
    region.cdList.includes(handoffCode) ||
    childParentCodes.includes(handoffCode)
  );
}

function calculateAdaptationPlacementScore(
  project: AdaptationProjectPlan | null,
  placements: AdaptationPlacement[],
  candidates: PriorityCandidate[]
): AdaptationPlacementScore {
  const unit = project ? geometryOptions.find((geometry) => geometry.id === project.geometryType)?.unit ?? '개소' : '개소';
  const normalizedTarget = Math.max(0, Number(project?.goal ?? 0) || 0);
  const implementedValue = calculatePlacementExecutionValue(project, placements);
  const insidePlacements = placements.filter((placement) => isPlacementInsidePriorityCandidates(placement, candidates));
  const insideValue = project?.geometryType === 'polygon' && placements.length >= 3
    ? calculatePolygonAreaM2(placements.map((placement) => placement.points[0]).filter(Boolean)) * estimateInsidePlacementRatio(placements, candidates)
    : calculatePlacementExecutionValue(project, insidePlacements);
  const implementationScore = normalizedTarget > 0 ? Math.min(1, implementedValue / normalizedTarget) : 0;
  const citizenScore = normalizedTarget > 0 ? Math.min(1, insideValue / normalizedTarget) : 0;
  return {
    total: placements.length,
    inside: insidePlacements.length,
    target: normalizedTarget,
    unit,
    implementedValue,
    insideValue,
    implementationScore: Number(implementationScore.toFixed(3)),
    citizenScore: Number(citizenScore.toFixed(3)),
    percent: Math.round(citizenScore * 100),
  };
}

function calculatePlacementExecutionValue(project: AdaptationProjectPlan | null, placements: AdaptationPlacement[]) {
  if (project?.geometryType !== 'polygon') return placements.length;
  const points = placements.map((placement) => placement.points[0]).filter(Boolean);
  return points.length >= 3 ? calculatePolygonAreaM2(points) : 0;
}

function estimateInsidePlacementRatio(placements: AdaptationPlacement[], candidates: PriorityCandidate[]) {
  if (!placements.length) return 0;
  const inside = placements.filter((placement) => isPlacementInsidePriorityCandidates(placement, candidates)).length;
  return inside / placements.length;
}

function calculatePolygonAreaM2(points: Array<{ lat: number; lng: number }>) {
  if (points.length < 3) return 0;
  const meanLat = average(points.map((point) => point.lat));
  const metersPerLat = 111_320;
  const metersPerLng = 111_320 * Math.cos((meanLat * Math.PI) / 180);
  const projected = points.map((point) => ({
    x: point.lng * metersPerLng,
    y: point.lat * metersPerLat,
  }));

  let area = 0;
  for (let i = 0, j = projected.length - 1; i < projected.length; j = i++) {
    area += projected[j].x * projected[i].y - projected[i].x * projected[j].y;
  }

  return Math.abs(area / 2);
}

function formatExecutionValue(value: number) {
  if (!Number.isFinite(value)) return '0';
  if (value >= 100) return Math.round(value).toLocaleString();
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(value % 1 === 0 ? 0 : 2);
}

function estimateAdaptationEffect(project: AdaptationProjectPlan | null, score: AdaptationPlacementScore) {
  const item = project?.item ?? '';
  const maxShadowFactor = item.includes('가로수') ? 0.32 : item.includes('그늘') ? 0.2 : 0.14;
  const fShadow = Math.min(maxShadowFactor, maxShadowFactor * score.implementationScore);
  const albedoWeighted = item.includes('그늘') ? 0.28 : 0.25;
  const solarWm2 = 700;
  const kTemp = 0.0067;
  const canopyBlockFactor = item.includes('그늘') ? 0.72 : 0.63;
  const deltaR = (1 - albedoWeighted) * solarWm2;
  const deltaTC = kTemp * deltaR * canopyBlockFactor * fShadow;

  return {
    fShadow,
    deltaR,
    deltaTC,
  };
}

function isPlacementInsidePriorityCandidates(placement: AdaptationPlacement, candidates: PriorityCandidate[]) {
  return placement.points.some((point) =>
    candidates.some((candidate) => isPointInsidePriorityCandidate(point.lat, point.lng, candidate))
  );
}

function isPointInsidePriorityCandidate(lat: number, lng: number, candidate: PriorityCandidate) {
  const features = priorityCandidateFeatures(candidate);
  if (features.length) {
    return features.some((feature) => isPointInsideGeoJsonFeature(lat, lng, feature));
  }

  const bounds = priorityCandidateBounds(candidate);
  if (!bounds) return false;
  return lat >= bounds.south && lat <= bounds.north && lng >= bounds.west && lng <= bounds.east;
}

function isPointInsideGeoJsonFeature(lat: number, lng: number, feature: GeoJsonFeature) {
  const { geometry } = feature;
  if (!geometry) return false;
  const coordinates = geometry.coordinates as any;

  if (geometry.type === 'Polygon') {
    return isPointInsidePolygonCoordinates(lat, lng, coordinates);
  }

  if (geometry.type === 'MultiPolygon' && Array.isArray(coordinates)) {
    return coordinates.some((polygon) => isPointInsidePolygonCoordinates(lat, lng, polygon));
  }

  const bounds = featureCollectionBounds([feature]);
  if (!bounds) return false;
  return lat >= bounds.south && lat <= bounds.north && lng >= bounds.west && lng <= bounds.east;
}

function isPointInsidePolygonCoordinates(lat: number, lng: number, polygon: unknown) {
  if (!Array.isArray(polygon) || !Array.isArray(polygon[0])) return false;
  const outerRing = polygon[0];
  if (!isPointInsideRing(lat, lng, outerRing)) return false;

  const holes = polygon.slice(1);
  return !holes.some((ring) => isPointInsideRing(lat, lng, ring));
}

function isPointInsideRing(lat: number, lng: number, ring: unknown) {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const current = ring[i];
    const previous = ring[j];
    if (!Array.isArray(current) || !Array.isArray(previous)) continue;

    const xi = Number(current[0]);
    const yi = Number(current[1]);
    const xj = Number(previous[0]);
    const yj = Number(previous[1]);
    if (![xi, yi, xj, yj].every(Number.isFinite)) continue;

    const intersects = (yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
}

function candidateKey(candidate: PriorityCandidate) {
  return String(candidate.id ?? `${candidate.alternativeId ?? 'alternative'}-${candidate.rank ?? candidate.name ?? 'candidate'}`);
}

function formatNullableScore(value: unknown) {
  const score = Number(value);
  return Number.isFinite(score) ? score.toFixed(2) : '--';
}

function priorityCandidateFeatures(candidate?: PriorityCandidate | null) {
  return candidate?.geometry?.features?.length ? candidate.geometry.features : candidate?.features ?? [];
}

function priorityCandidatePnuList(candidate?: PriorityCandidate | null) {
  return (candidate?.attributes?.pnuList?.length ? candidate.attributes.pnuList : candidate?.pnuList ?? [])
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function withHydratedPriorityGeometry(candidate: PriorityCandidate, cache: Record<string, GeoJsonFeature[]>) {
  const features = cache[candidateKey(candidate)];
  if (!features?.length) return candidate;
  const bounds = featureCollectionBounds(features);
  const center = featureCollectionCenter(features);

  return {
    ...candidate,
    features,
    geometry: {
      ...(candidate.geometry ?? {}),
      features,
      center: center ?? candidate.geometry?.center ?? candidate.center,
      bounds: bounds ?? candidate.geometry?.bounds ?? candidate.bounds,
    },
  };
}

function priorityCandidateCenter(candidate?: PriorityCandidate | null) {
  const center = candidate?.geometry?.center ?? candidate?.center ?? featureCollectionCenter(priorityCandidateFeatures(candidate)) ?? null;
  if (!center) return null;
  const lat = Number((center as any).lat ?? (center as any).latitude);
  const lng = Number((center as any).lng ?? (center as any).lon ?? (center as any).longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function priorityCandidateBounds(candidate?: PriorityCandidate | null) {
  const bounds = candidate?.geometry?.bounds ?? candidate?.bounds ?? featureCollectionBounds(priorityCandidateFeatures(candidate)) ?? null;
  if (!bounds) return null;

  const south = Number((bounds as any).south ?? (bounds as any).minLat ?? (bounds as any)._southWest?.lat);
  const west = Number((bounds as any).west ?? (bounds as any).minLng ?? (bounds as any)._southWest?.lng);
  const north = Number((bounds as any).north ?? (bounds as any).maxLat ?? (bounds as any)._northEast?.lat);
  const east = Number((bounds as any).east ?? (bounds as any).maxLng ?? (bounds as any)._northEast?.lng);

  if ([south, west, north, east].every(Number.isFinite)) return { south, west, north, east };
  return null;
}

function createPriorityCandidateMapLayer(L: LeafletGlobal, candidate: PriorityCandidate, selected: boolean) {
  const features = priorityCandidateFeatures(candidate);
  const color = selected ? '#dc2626' : '#f97316';
  const fillColor = selected ? '#ef4444' : '#f59e0b';
  const tooltip = `${candidate.name ?? '후보지'} · Risk ${formatNullableScore(candidate.scores?.risk ?? candidate.risk)}`;
  const group = L.featureGroup();
  const vectorRenderer = L.svg?.({ pane: 'priorityCandidate' });
  let hasLayer = false;

  if (features.length) {
    L.geoJSON({ type: 'FeatureCollection', features }, {
      pane: 'priorityCandidate',
      renderer: vectorRenderer,
      style: {
        color,
        fillColor,
        fillOpacity: selected ? 0.45 : 0.28,
        opacity: 1,
        weight: selected ? 4 : 2,
      },
      onEachFeature: (_feature: GeoJsonFeature, layer: LeafletGlobal) => {
        layer.bindTooltip(tooltip, { sticky: true });
      },
    }).addTo(group);
    hasLayer = true;
  }

  const bounds = priorityCandidateBounds(candidate);
  if (bounds) {
    const padded = padPriorityBounds(bounds);
    L.rectangle(
      [[padded.south, padded.west], [padded.north, padded.east]],
      {
        pane: 'priorityCandidate',
        renderer: vectorRenderer,
        color,
        fillColor,
        fillOpacity: selected ? 0.18 : 0.08,
        dashArray: selected ? undefined : '6 5',
        weight: selected ? 4 : 2,
      }
    ).bindTooltip(tooltip, { sticky: true }).addTo(group);
    hasLayer = true;
  }

  const center = priorityCandidateCenter(candidate);
  if (center) {
    const rank = String(candidate.rank ?? '').padStart(2, '0');
    L.circleMarker([center.lat, center.lng], {
      pane: 'priorityCandidate',
      renderer: vectorRenderer,
      radius: selected ? 18 : 13,
      color: '#ffffff',
      fillColor: color,
      fillOpacity: 0.92,
      opacity: 1,
      weight: selected ? 4 : 3,
    }).bindTooltip(tooltip, { sticky: true }).addTo(group);
    L.marker([center.lat, center.lng], {
      pane: 'priorityCandidateMarker',
      zIndexOffset: selected ? 2200 : 1900,
      icon: L.divIcon({
        className: '',
        html: `<span style="display:grid;place-items:center;width:${selected ? 38 : 30}px;height:${selected ? 38 : 30}px;border-radius:999px;background:${color};color:white;font-weight:900;font-size:${selected ? 13 : 11}px;box-shadow:0 8px 22px rgba(15,23,42,.35);border:${selected ? 4 : 2}px solid white">${rank || '•'}</span>`,
        iconSize: [selected ? 38 : 30, selected ? 38 : 30],
        iconAnchor: [selected ? 19 : 15, selected ? 19 : 15],
      }),
    }).bindTooltip(tooltip, { sticky: true }).addTo(group);
    hasLayer = true;
  }

  return hasLayer ? group : null;
}

function padPriorityBounds(bounds: PriorityCandidateBounds) {
  const latPad = Math.max(Math.abs(bounds.north - bounds.south) * 0.12, 0.00035);
  const lngPad = Math.max(Math.abs(bounds.east - bounds.west) * 0.12, 0.00035);
  return {
    south: bounds.south - latPad,
    west: bounds.west - lngPad,
    north: bounds.north + latPad,
    east: bounds.east + lngPad,
  };
}

async function fetchCandidateFeaturesByPnu(candidate: PriorityCandidate) {
  const featuresByPnu = new Map<string, GeoJsonFeature>();
  const pnuList = priorityCandidatePnuList(candidate).slice(0, 8);

  for (const pnu of pnuList) {
    try {
      const url = createLeadVWorldDataUrl(VWORLD_DATASETS.cadastral, {
        attrFilter: `pnu:=:${pnu}`,
        size: 10,
        page: 1,
      });
      const response = await fetch(url);
      if (!response.ok) continue;
      const payload = await response.json();
      const features = extractLeadVWorldFeatures(payload);
      features.forEach((feature) => {
        const key = String(feature.properties?.pnu ?? feature.properties?.PNU ?? pnu);
        featuresByPnu.set(key, feature);
      });
    } catch {
      // PNU geometry 보완은 최선-effort 처리입니다.
    }
  }

  return Array.from(featuresByPnu.values());
}

function createLeadVWorldDataUrl(data: string, params: Record<string, string | number>) {
  const url = new URL(import.meta.env.VITE_VWORLD_PROXY_URL || '/vworld-data', window.location.origin);
  const query = {
    service: 'data',
    version: '2.0',
    request: 'GetFeature',
    format: 'json',
    data,
    geometry: true,
    attribute: true,
    crs: 'EPSG:4326',
    ...params,
  };

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });

  return url.toString();
}

function extractLeadVWorldFeatures(payload: any): GeoJsonFeature[] {
  return payload?.response?.result?.featureCollection?.features ||
    payload?.response?.result?.features ||
    payload?.features ||
    [];
}

function featureCollectionBounds(features: GeoJsonFeature[]) {
  const points = features.flatMap((feature) => collectFeatureLonLatPoints(feature.geometry?.coordinates));
  if (!points.length) return null;
  const lngs = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  return {
    south: Math.min(...lats),
    west: Math.min(...lngs),
    north: Math.max(...lats),
    east: Math.max(...lngs),
  };
}

function featureCollectionCenter(features: GeoJsonFeature[]) {
  const bounds = featureCollectionBounds(features);
  if (!bounds) return null;
  return {
    lat: (bounds.south + bounds.north) / 2,
    lng: (bounds.west + bounds.east) / 2,
  };
}

function collectFeatureLonLatPoints(value: unknown): number[][] {
  if (Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number') {
    return [[Number(value[0]), Number(value[1])]];
  }
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => collectFeatureLonLatPoints(item));
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
  } else {
    layers['admin-boundary'] = selectedBoundaryLayer;
  }

  /* Removed static demo risk layer.
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
  */

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

function createAdaptationPlacementMapLayer(
  L: LeafletGlobal,
  placement: AdaptationPlacement,
  active: boolean,
  selected: boolean,
  onSelect: (placementId: string) => void
) {
  const point = placement.points[0];
  if (!point) return null;

  const color = active ? '#059669' : '#64748b';
  const fillColor = placement.geometryType === 'line' ? '#0ea5e9' : placement.geometryType === 'polygon' ? '#8b5cf6' : '#10b981';
  const iconText = placement.item.includes('가로수')
    ? '수'
    : placement.item.includes('그늘')
      ? '막'
      : placement.geometryType === 'line'
        ? '선'
        : placement.geometryType === 'polygon'
          ? '면'
          : '점';
  const tooltip = `${placement.projectTitle} · ${placement.item} 배치점 · 클릭하면 선택`;
  const group = L.featureGroup();

  L.circleMarker([point.lat, point.lng], {
    pane: 'adaptationPlacement',
    radius: selected ? 19 : active ? 16 : 12,
    color: selected ? '#f59e0b' : '#ffffff',
    fillColor,
    fillOpacity: active ? 0.92 : 0.78,
    opacity: 1,
    weight: selected ? 5 : active ? 4 : 2,
  }).addTo(group);

  L.marker([point.lat, point.lng], {
    pane: 'adaptationPlacementMarker',
    zIndexOffset: selected ? 2700 : active ? 2500 : 2100,
    icon: L.divIcon({
      className: '',
      html: `<span style="display:grid;place-items:center;width:${selected ? 38 : active ? 34 : 28}px;height:${selected ? 38 : active ? 34 : 28}px;border-radius:999px;background:${fillColor};color:white;font-weight:900;font-size:${selected ? 13 : active ? 12 : 10}px;box-shadow:0 8px 20px rgba(15,23,42,.32);border:${selected ? 5 : active ? 4 : 2}px solid ${selected ? '#fbbf24' : 'white'}">${iconText}</span>`,
      iconSize: [selected ? 38 : active ? 34 : 28, selected ? 38 : active ? 34 : 28],
      iconAnchor: [selected ? 19 : active ? 17 : 14, selected ? 19 : active ? 17 : 14],
    }),
  }).addTo(group);

  group.bindTooltip(selected ? `${tooltip} · 선택됨` : tooltip, { sticky: true });
  group.on?.('click', (event: any) => {
    L.DomEvent?.stopPropagation?.(event);
    onSelect(placement.id);
  });

  return group;
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
