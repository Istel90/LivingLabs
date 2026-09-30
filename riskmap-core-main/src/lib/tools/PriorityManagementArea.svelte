<script>
    import { isGridValueCollection, gridValueCollectionSize, indicatorDataKey, loadIndicatorInputs as queryIndicatorInputs } from '$lib/priority/indicatorRepository.js';
    import { openPriorityDraftDb, requestToPromise, readPriorityDraft, writePriorityDraft, clearPriorityDraftStore, PRIORITY_DRAFT_STORE_NAME, PRIORITY_DRAFT_SCHEMA_VERSION } from '$lib/priority/draftRepository.js';
    import { alternativeStatusLabel, normalizeDraftAlternative, buildSupabaseDraftPayload } from '$lib/priority/alternativeRepository.js';
    import { createDemoIndicatorValues, normalizeUploadedValues, normalizeProjection, summarizeCustomValues } from '$lib/priority/gridInput.js';
    import { listUserIndicators, readUserIndicator, saveUserIndicator, connectUserIndicator, userIndicatorLibraryEnabled } from '$lib/priority/userIndicatorRepository.js';
    import { onDestroy, onMount } from 'svelte';
    import { createResultId, normalizeAlternativeIdentity, identifyRiskResult, identifyDistrictResult, buildResultIndex } from '$lib/data/resultIdentity.js';
    import { base } from '$app/paths';
    import proj4 from 'proj4';
    import { leadDepartmentToolUrl, portalToolsUrl } from '$lib/portalLinks.js';
    import { createSectorConfigs, INDICATOR_GROUPS } from '$lib/priority/registry.js';
    import { requestRiskAnalysis, requestRegisteredRiskAnalysis } from '$lib/priority/riskClient.js';
    import { configureRegisteredIndicators } from '$lib/priority/indicatorData.js';
    import SelectedRegionMap from '$lib/maps/SelectedRegionMap.svelte';
    import AlternativeOverlap from './AlternativeOverlap.svelte';
    import { groupRegionalDrafts } from '$lib/data/regionalDraftGroups.js';
    import { analysisJsonReplacer, restoreAnalysisPayload } from '$lib/data/analysisSerialization.js';
    import {
        enrichPracticeDistricts,
        PRACTICE_TYPE_META,
        PRACTICE_TYPE_ORDER
    } from '$lib/data/practiceDistricts.js';
    import {
        getRegionByCode,
        getRegionBounds,
        getRegionOptionsBySido,
        getSigunguLabel,
        sidos
    } from '$lib/data/administrativeRegions.js';
    import { markPlatformHandoffStatus, savePlatformHandoff } from '../../../../shared/services/platformHandoffs.js';
    import {
        draftPayloadFromRow,
        listPriorityAreaDrafts,
        listRegionalPriorityAreaDrafts,
        savePriorityAreaDraft,
        managePriorityAreaDraft
    } from '../../../../shared/services/priorityAreaDrafts.js';

    export let hazard = 'heatwave';
    export let nationalLab = false;

    proj4.defs(
        'EPSG:5179',
        '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs +type=crs'
    );

    const steps = ['프로젝트 설정', '입력자료', '가중치 설정', '분석 실행', '결과 지도', '의사결정 지원'];
    const hazardScenarios = ['ssp126', 'ssp245', 'ssp370', 'ssp585'];
    const hazardFuturePeriods = ['2026', '2027', '2028', '2029', '2030', '2040', '2050', '2060', '2070', '2080', '2090', '2100'];
    const requiredGroups = INDICATOR_GROUPS.map(group => group.label);
    const asset = (path) => `${base}${path}`;
    const DEPARTMENT_HANDOFF_KEY = 'livinglabs.priorityManagementHandoff';
    const priorityHandoffInboxUrl = import.meta.env.VITE_PRIORITY_HANDOFF_INBOX_URL || '/priority-handoff';
    const vworldProxyUrl = import.meta.env.VITE_VWORLD_PROXY_URL || '';
    const devResetSignalUrl = vworldProxyUrl
        ? new URL('/dev-reset', vworldProxyUrl).toString()
        : '';

    const hazardConfigs = createSectorConfigs(asset);

    const config = hazardConfigs[hazard] || hazardConfigs.heatwave;
    function configureIndicatorsForRegion(sourceIndicators, code, datasetMode = hazardDatasetMode) {
        return configureRegisteredIndicators(sourceIndicators, code, { datasetMode, scenario: hazardScenario, period: hazardFuturePeriod });
    }



    async function applyRegionalAvailability(source, code) {
        if (hazard !== 'flood') return source;
        try {
            const response = await fetch(`/indicator-availability?regionCode=${encodeURIComponent(code)}`, { signal: AbortSignal.timeout(15000) });
            if (!response.ok) return source;
            const coverage = await response.json();
            return source.map((item) => item.floodIndicator && !coverage.flood?.[item.floodIndicator]?.available
                ? { ...item, enabled: false, dataStatus: 'missing', description: `${item.description} · 이 지역에 연결된 유효 원자료가 없습니다.`, coverageNote: '지역 원자료 없음' }
                : item);
        } catch {
            // The execution request will report the actual source error; never invent a grid.
            return source;
        }
    }





    let activeStep = 0;
    let activeLayer = 'Risk';
    let region = '경기도 수원시';
    let regionCode = '41110';
    let selectedSido = '경기도';
    $: availableRegions = getRegionOptionsBySido(selectedSido);
    let hazardDatasetMode = 'observed';
    let hazardScenario = 'ssp245';
    let hazardFuturePeriod = '2050';
    let regionChangeRunId = 0;
    $: projectName = `${region} ${config.projectSuffix}`;
    $: projectBreadcrumb = [region, config.label, config.projectSuffix.replace(config.label, '').trim()].filter(Boolean);
    let analysisDone = false;
    let running = false;
    let analysisRunId = 0;
    let leftPanelTab = '01';
    let candidatesInfoOpen = false;
    let selectedCandidate = 0;
    let activeAlternative = 0;
    let pendingDeleteIndex = null;
    let gridUnit = '100m';
    let dimensionWeights = { H: 1, E: 1, V: 1 };
    let mapSource = config.mapSource;
    let dataBundle = null;
    let dataBundleStatus = config.dataSummaryPath ? '수원 시연 원자료 불러오는 중' : '시연 원자료 연결 전';
    let analysisMessage = '설정값을 확인한 뒤 Risk 분석을 실행하세요.';
    let analysisResult = null;
    let parcelCandidateMessage = 'Risk 분석 후 지도에서 실천권역도출하기를 실행하세요.';
    let focusedCandidate = null;
    let selectedRegionMap;
    let mapResetKey = 0;
    let detailCandidateKey = null;
    let handoffMessage = '실천권역을 도출하면 주관부서 지원도구로 전달할 수 있습니다.';
    let handoffDialog = null;
    let latestHandoffPackage = null;
    let sentHandoffPackages = [];
    let handoffReviewOpen = false;
    let handoffScope = 'all';
    let handoffNote = '';
    let requestListOpen = false;
    let draftStorageStatus = '임시 저장 준비 중';
    let draftLoadComplete = false;
    let draftSaveTimer = null;
    let operatorName = '관리자';
    let supabaseDrafts = [];
    let supabaseHistoryOpen = false;
    let supabaseHistoryTab = 'load';
    let comparisonTabs = [];
    let activeComparisonId = null;
    let comparisonStorageMessage = '';
    $: visibleComparisonTabs = comparisonTabs.filter(item => item.regionCode === regionCode && item.hazard === hazard);
    $: activeComparison = visibleComparisonTabs.find(item => item.id === activeComparisonId) || null;

    function comparisonStorageKey() { return `priority-overlap-tabs/v1:${hazard}:${regionCode}`; }
    async function storeComparisonTabs() {
        const storageKey = comparisonStorageKey();
        const tabs = comparisonTabs.filter(item => item.regionCode === regionCode && item.hazard === hazard);
        try {
            const db = await openPriorityDraftDb();
            try {
                const transaction = db.transaction(PRIORITY_DRAFT_STORE_NAME, 'readwrite');
                transaction.objectStore(PRIORITY_DRAFT_STORE_NAME).put({ id: storageKey, tabs });
                await new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error); });
            } finally { db.close(); }
            comparisonStorageMessage = '이 브라우저에 결과 탭 보관됨';
        } catch { comparisonStorageMessage = '결과 탭 보관 실패 · 비교 결과 내려받기로 보관해 주세요.'; }
    }
    function openComparisonResult(result, minimum) {
        persistAlternative(activeAlternative);
        const sequence = visibleComparisonTabs.reduce((max, item) => Math.max(max, Number(item.name.split(' ').at(-1)) || 0), 0) + 1;
        const snapshot = { id: crypto.randomUUID(), name: `겹침 결과 ${sequence}`,
            regionCode, hazard, createdAt: new Date().toISOString(), minimum, result: structuredClone(result) };
        comparisonTabs = [...comparisonTabs, snapshot];
        activeComparisonId = snapshot.id;
        supabaseHistoryOpen = false;
        storeComparisonTabs();
    }
    function updateComparisonMinimum(id, minimum) {
        comparisonTabs = comparisonTabs.map(item => item.id === id ? { ...item, minimum } : item);
        storeComparisonTabs();
    }
    function closeComparisonTab(id) {
        comparisonTabs = comparisonTabs.filter(item => item.id !== id);
        if (activeComparisonId === id) activeComparisonId = null;
        storeComparisonTabs();
    }
    $: savedRegionGroups = groupRegionalDrafts(supabaseDrafts, getRegionByCode);
    $: savedRegionCount = savedRegionGroups.reduce((sum, group) => sum + group.regions.length, 0);
    let supabaseBusy = false;
    let supabaseStatus = '저장 준비됨';
    let supabaseSaveDialog = null;
    let loadedDraftId = null;
    let pendingDraftSave = null;
    let showDeletedDrafts = false;
    let draftManagement = null;
    let draftManagementName = '';
    let draftManagementError = '';
    let indicatorDialog = null;
    let devResetPollTimer = null;
    let lastDevResetAt = '';

    let alternatives = [];
    $: decidedAlternative = alternatives.find((item) => item.status === '선정');
    $: activeAlternativeId = alternatives[activeAlternative]?.id || `alternative-${activeAlternative + 1}`;

    let indicators = configureIndicatorsForRegion(config.indicators, regionCode, hazardDatasetMode)
        .map((item) => ({ ...item, enabled: item.enabled && isIndicatorAvailable(item) }));
    let appliedIndicators = [];
    let loadedPreviewIndicators = [];
    let indicatorPreviewGrid = null;
    const indicatorGroupMeta = {
        '기후위험': { english: 'Hazard', dimension: 'H', direction: 'positive', color: '#ef6c4d', icon: '☀' },
        '노출': { english: 'Exposure', dimension: 'E', direction: 'positive', color: '#3b82c4', icon: '◎' },
        '민감도': { english: 'Sensitivity', dimension: 'V', direction: 'positive', color: '#a855a8', icon: '◇' },
        '적응역량': { english: 'Adaptive Capacity', dimension: 'V', direction: 'negative', color: '#2f9b73', icon: '✚' }
    };
    const dimensionColorVars = { H: '--color-hazard', E: '--color-exposure', V: '--color-vulnerability' };
    let groupExpanded = Object.fromEntries(Object.keys(indicatorGroupMeta).map((group) => [group, false]));
    let expandedDescriptions = {};
    function groupDimensionColorVar(group) {
        return `var(${dimensionColorVars[indicatorGroupMeta[group].dimension]})`;
    }

    function toggleGroupExpanded(group) {
        groupExpanded = { ...groupExpanded, [group]: !groupExpanded[group] };
    }

    function collapsedGroupSummary(group) {
        const selected = selectedIndicatorsFor(group);
        if (!selected.length) return '';
        const shown = selected.slice(0, 2).map((item) => item.label).join(', ');
        return selected.length > 2 ? `${shown} 외 ${selected.length - 2}개` : shown;
    }

    function toggleIndicatorDescription(id) {
        expandedDescriptions = { ...expandedDescriptions, [id]: !expandedDescriptions[id] };
    }

    function handleParcelDerivationComplete() {
        leftPanelTab = '03';
    }
    $: previewAnalysisIndicators = indicators.map((item) => {
        const loaded = loadedPreviewIndicators.find((previewItem) => previewItem.id === item.id);
        return loaded
            ? { ...loaded, enabled: item.enabled && isIndicatorAvailable(item), weight: item.weight, direction: item.direction }
            : { ...item, enabled: false };
    });
    $: if (indicatorPreviewGrid && !analysisDone && ['Risk', 'Hotspot'].includes(activeLayer)) activeLayer = 'H';
    $: candidateList = analysisResult?.parcelCandidates?.length
        ? enrichPracticeDistricts(analysisResult.parcelCandidates, hazard)
        : [];
    $: practiceDistrictGroups = PRACTICE_TYPE_ORDER.map((type) => ({
        type,
        ...PRACTICE_TYPE_META[type],
        candidates: candidateList.filter((candidate) => candidate.practiceType === type)
    }));
    $: if (candidateList.length && selectedCandidate >= candidateList.length) selectedCandidate = 0;
    $: selectedCandidateItem = candidateList[selectedCandidate] || candidateList[0] || null;
    $: detailCandidateItem = detailCandidateKey
        ? candidateList.find((candidate) => candidateIdentity(candidate) === detailCandidateKey)
        : selectedCandidateItem;
    $: handoffCandidateCount = alternatives.reduce((sum, alternative) => (
        sum + (alternative.analysisResult?.parcelCandidates?.length || 0)
    ), 0);
    $: handoffAlternativeCount = alternatives.filter((alternative) => (
        alternative.analysisResult?.parcelCandidates?.length
    )).length;
    $: handoffStatusText = latestHandoffPackage
        ? `전달됨 · ${latestHandoffPackage.alternativeCount}개 대안 · ${latestHandoffPackage.candidateCount}개 후보 · ${formatHandoffTime(latestHandoffPackage.deliveredAt)}`
        : handoffCandidateCount
            ? `${handoffAlternativeCount}개 대안 · ${handoffCandidateCount}개 후보 전달 가능`
            : handoffMessage;
    $: sentRequestCount = sentHandoffPackages.length;

    let cells = Array.from({ length: 108 }, (_, i) => {
        const x = i % 12;
        const y = Math.floor(i / 12);
        return Math.min(0.98, Math.max(0.08, 0.18 + Math.sin(x * 1.3 + y * 0.7) * 0.18 + (x > 5 && y > 2 && y < 7 ? 0.42 : 0) + ((x + y) % 5) * 0.035));
    });

    $: enabledCount = indicators.filter((item) => item.enabled).length;
    $: dimensionSelectedCounts = {
        H: indicators.filter((item) => item.enabled && item.dimension === 'H').length,
        E: indicators.filter((item) => item.enabled && item.dimension === 'E').length,
        V: indicators.filter((item) => item.enabled && item.dimension === 'V').length
    };
    $: availableCount = indicators.filter(isIndicatorAvailable).length;
    $: resultScores = analysisResult?.dimensionScores || { H: null, E: null, V: null };
    $: resultRiskScore = analysisResult?.riskScore ?? null;

    function clearAllIndicators() {
        if (!enabledCount) return;
        indicators = indicators.map((item) => ({ ...item, enabled: false }));
        loadedPreviewIndicators = loadedPreviewIndicators.map((item) => ({ ...item, enabled: false }));
        markAnalysisDirty();
    }

    let previousActiveAlternativeIndex = activeAlternative;
    let alternativeFlash = false;
    let alternativeFlashTimer;
    $: if (activeAlternative !== previousActiveAlternativeIndex) {
        previousActiveAlternativeIndex = activeAlternative;
        alternativeFlash = true;
        clearTimeout(alternativeFlashTimer);
        alternativeFlashTimer = setTimeout(() => { alternativeFlash = false; }, 700);
    }

    function priorityDraftKey(code = regionCode) {
        return `${PRIORITY_DRAFT_SCHEMA_VERSION}:${hazard}:${code || 'unknown'}`;
    }









    function buildPriorityDraftPayload() {
        return {
            id: priorityDraftKey(),
            loadedDraftId,
            schemaVersion: PRIORITY_DRAFT_SCHEMA_VERSION,
            savedAt: new Date().toISOString(),
            hazard,
            hazardLabel: config.label,
            region,
            regionCode,
            projectName,
            activeStep,
            activeAlternative,
            gridUnit,
            dimensionWeights: { ...dimensionWeights },
            mapSource,
            indicators: cloneIndicatorsForAlternative(indicators),
            appliedIndicators: appliedIndicators.map((item) => ({ ...item })),
            analysisResult,
            analysisDone,
            analysisMessage,
            parcelCandidateMessage,
            selectedCandidate,
            detailCandidateKey,
            activeLayer,
            latestHandoffPackage,
            sentHandoffPackages,
            alternatives,
            resultIndex: buildResultIndex(alternatives)
        };
    }





    function restorePriorityDraftPayload(draft, savedRowId = null) {
        if (!draft || draft.schemaVersion !== PRIORITY_DRAFT_SCHEMA_VERSION) return false;
        if (draft.hazard !== hazard || draft.regionCode !== regionCode) return false;
        if (!Array.isArray(draft.alternatives)) return false;

        draft = restoreAnalysisPayload(draft);
        loadedDraftId = draft.loadedDraftId || null;
        pendingDraftSave = null;

        region = getRegionByCode(regionCode)?.fullName || draft.region || region;
        gridUnit = draft.gridUnit || gridUnit;
        dimensionWeights = { ...(draft.dimensionWeights || dimensionWeights) };
        mapSource = draft.mapSource || mapSource;
        latestHandoffPackage = draft.latestHandoffPackage || null;
        sentHandoffPackages = Array.isArray(draft.sentHandoffPackages) ? draft.sentHandoffPackages : (latestHandoffPackage ? [latestHandoffPackage] : []);
        const identityScope = savedRowId || draft.loadedDraftId || `${draft.id}:${draft.savedAt || 'legacy'}`;
        alternatives = draft.alternatives.map((item, index) =>
            normalizeAlternativeIdentity(normalizeDraftAlternative(item, index), identityScope));
        activeAlternative = Math.min(Math.max(0, Number(draft.activeAlternative) || 0), alternatives.length - 1);
        activeStep = Math.max(0, Number(draft.activeStep) || 0);
        loadAlternative(activeAlternative);
        activeStep = Math.max(activeStep, analysisDone ? 4 : activeStep);
        draftStorageStatus = `임시 저장 복원됨 · ${new Date(draft.savedAt || Date.now()).toLocaleString('ko-KR')}`;
        return true;
    }

    async function savePriorityDraft() {
        if (!draftLoadComplete) return;
        persistAlternative(activeAlternative);
        const payload = buildPriorityDraftPayload();

        try {
            await writePriorityDraft(payload);
            draftStorageStatus = `임시 저장됨 · ${new Date(payload.savedAt).toLocaleTimeString('ko-KR')}`;
        } catch (error) {
            console.warn(error);
            draftStorageStatus = '임시 저장 실패 · 브라우저 저장소를 확인하세요';
        }
    }

    function schedulePriorityDraftSave() {
        if (!draftLoadComplete) return;
        window.clearTimeout(draftSaveTimer);
        draftSaveTimer = window.setTimeout(savePriorityDraft, 450);
    }



    async function refreshSupabaseDrafts() {
        supabaseBusy = true;
        try {
            supabaseDrafts = await listRegionalPriorityAreaDrafts(hazard, regionCode, showDeletedDrafts);
            supabaseStatus = supabaseDrafts.length
                ? `저장 이력 ${supabaseDrafts.length}건`
                : '저장 이력이 없습니다.';
        } catch (error) {
            console.warn(error);
            supabaseDrafts = [];
            supabaseStatus = error?.message || '저장 이력을 불러오지 못했습니다.';
        } finally {
            supabaseBusy = false;
        }
    }

    async function saveCurrentDraftToSupabase(asCopy = false) {
        if (!alternatives.length || supabaseBusy) return;
        const actorUser = operatorName.trim();
        if (!actorUser) {
            supabaseStatus = '작업자 이름을 먼저 입력하세요.';
            supabaseSaveDialog = {
                state: 'error',
                title: '저장할 수 없습니다',
                message: '작업자 이름 또는 부서를 먼저 입력해 주세요.'
            };
            return;
        }

        supabaseBusy = true;
        supabaseSaveDialog = {
            state: 'saving',
            title: '대안 저장 중',
            message: pendingDraftSave && !asCopy
                ? '앞선 저장 요청의 결과를 확인하고 있습니다. 그 이후 수정한 내용은 완료 후 다시 저장해 주세요.'
                : '분석 결과를 정리해 새 버전으로 저장하고 있습니다.'
        };
        persistAlternative(activeAlternative);
        if (asCopy) pendingDraftSave = null;
        pendingDraftSave ||= {
            regionCode, regionName: region, hazardType: hazard, projectName, actorUser,
            draftPayload: buildSupabaseDraftPayload(buildPriorityDraftPayload()), parentId: asCopy ? null : loadedDraftId,
            requestId: crypto.randomUUID()
        };
        try {
            window.localStorage.setItem('livinglabs.priorityAreaOperator', actorUser);
            const saved = await savePriorityAreaDraft(pendingDraftSave);
            loadedDraftId = saved.id;
            pendingDraftSave = null;
            schedulePriorityDraftSave();
            supabaseStatus = `${saved?.analysis_version || '새 버전'} 저장 완료 · ${actorUser}`;
            supabaseSaveDialog = {
                state: 'success',
                title: '대안 저장 완료',
                message: `${saved?.set_name || saved?.analysis_version || '새 저장본'}을 ${actorUser} 작업 이력으로 저장했습니다.`
            };
            await refreshSupabaseDrafts();
            supabaseHistoryOpen = false;
        } catch (error) {
            console.warn(error);
            const timedOut = String(error?.message || '').includes('57014')
                || String(error?.message || '').toLowerCase().includes('statement timeout');
            supabaseStatus = timedOut
                ? '저장 데이터 처리 시간이 초과되었습니다. 다시 시도해 주세요.'
                : error?.message || '저장에 실패했습니다.';
            supabaseSaveDialog = {
                state: 'error',
                title: '대안 저장 실패',
                conflict: error?.code === 'DRAFT_CONFLICT',
                message: timedOut
                    ? '저장할 데이터 처리 시간이 초과되었습니다. 데이터 크기를 줄인 저장 방식으로 다시 시도해 주세요.'
                    : supabaseStatus
            };
        } finally {
            supabaseBusy = false;
        }
    }

    async function loadSupabaseDraft(row) {
        const payload = draftPayloadFromRow(row);
        if (payload?.regionCode && String(payload.regionCode) !== regionCode && payload.hazard === hazard) {
            await savePriorityDraft();
            const target = new URL(window.location.href);
            target.search = new URLSearchParams({ regionCode: payload.regionCode, savedDraft: row.id });
            window.location.assign(target);
            return;
        }
        if (!restorePriorityDraftPayload(payload, row.id)) {
            supabaseStatus = '현재 지역·재해유형과 맞지 않는 저장본입니다.';
            return;
        }
        loadedDraftId = row.id;
        pendingDraftSave = null;
        supabaseStatus = `${row.analysis_version || '저장본'} 불러오기 완료 · ${row.created_by_user || '작업자 미기록'}`;
        supabaseHistoryOpen = false;
        schedulePriorityDraftSave();
    }

    async function toggleSupabaseHistory() {
        await openSavedDraftAction('load');
    }

    async function openSavedDraftAction(action) {
        supabaseHistoryTab = action;
        showDeletedDrafts = false;
        draftManagement = null;
        supabaseHistoryOpen = true;
        await refreshSupabaseDrafts();
    }

    function openDraftManagement(row, action) {
        draftManagement = { row, action };
        draftManagementName = row.set_name || '';
        draftManagementError = '';
    }

    async function confirmDraftManagement() {
        if (!draftManagement || supabaseBusy) return;
        supabaseBusy = true;
        draftManagementError = '';
        try {
            await managePriorityAreaDraft(draftManagement.row, draftManagement.action, draftManagementName);
            if (draftManagement.action === 'delete' && draftManagement.row.id === loadedDraftId) {
                loadedDraftId = null;
                pendingDraftSave = null;
                schedulePriorityDraftSave();
            }
            draftManagement = null;
            await refreshSupabaseDrafts();
        } catch (error) {
            draftManagementError = error.message;
        } finally {
            supabaseBusy = false;
        }
    }

    async function toggleDraftTrash() {
        showDeletedDrafts = !showDeletedDrafts;
        draftManagement = null;
        await refreshSupabaseDrafts();
    }

    async function readDevelopmentResetSignal() {
        if (!devResetSignalUrl) return '';
        try {
            const response = await fetch(devResetSignalUrl, { cache: 'no-store' });
            if (!response.ok) return '';
            const state = await response.json();
            return state?.resetAt || '';
        } catch {
            return '';
        }
    }

    async function applyDevelopmentReset() {
        draftLoadComplete = false;
        window.clearTimeout(draftSaveTimer);
        resetAllAlternatives();
        try {
            await clearPriorityDraftStore();
        } catch (error) {
            console.warn(error);
        }
        supabaseDrafts = [];
        supabaseHistoryOpen = false;
        supabaseStatus = '개발 초기화 완료 · 저장 이력 삭제됨';
        draftStorageStatus = '개발 초기화 완료 · 새 대안 1';
        draftLoadComplete = true;
    }

    onMount(async () => {
        const params = new URLSearchParams(window.location.search);
        regionCode = params.get('regionCode') || regionCode;
        try {
            const db = await openPriorityDraftDb();
            try {
                const stored = await requestToPromise(db.transaction(PRIORITY_DRAFT_STORE_NAME, 'readonly').objectStore(PRIORITY_DRAFT_STORE_NAME).get(comparisonStorageKey()));
                comparisonTabs = Array.isArray(stored?.tabs) ? stored.tabs.filter(item => item.regionCode === regionCode && item.hazard === hazard && item.result?.grid && Array.isArray(item.result?.sources) && Array.isArray(item.result?.cells)) : [];
                if (comparisonTabs.length) comparisonStorageMessage = '이 브라우저에 보관된 결과 탭';
            } finally { db.close(); }
        } catch { comparisonStorageMessage = '보관된 결과 탭을 읽지 못했습니다.'; }
        region = getRegionByCode(regionCode)?.fullName || params.get('regionName') || regionCode;
        selectedSido = getRegionByCode(regionCode)?.sido || selectedSido;
        hazardDatasetMode = hazard === 'heatwave' && params.get('hazardPeriod') === 'future' ? 'future' : 'observed';
        hazardScenario = hazardScenarios.includes(params.get('scenario')) ? params.get('scenario') : hazardScenario;
        hazardFuturePeriod = hazardFuturePeriods.includes(params.get('futurePeriod')) ? params.get('futurePeriod') : hazardFuturePeriod;
        indicators = configureIndicatorsForRegion(config.indicators, regionCode, hazardDatasetMode)
            .map((item) => ({ ...item, enabled: item.enabled && isIndicatorAvailable(item) }));
        operatorName = window.localStorage.getItem('livinglabs.priorityAreaOperator') || operatorName;
        const resumeDraft = params.get('resumeDraft') === '1';

        try {
            draftLoadComplete = true;
            if (resumeDraft) {
                const restored = restorePriorityDraftPayload(await readPriorityDraft(priorityDraftKey()));
                if (!restored) draftStorageStatus = '복원할 임시 저장이 없어 새 작업으로 시작합니다.';
            } else {
                draftStorageStatus = '새 작업 세션 · 이전 초안 자동 복원 안 함';
            }
        } catch (error) {
            console.warn(error);
            draftLoadComplete = true;
            draftStorageStatus = '임시 저장소 연결 실패';
        }

        indicators = await applyRegionalAvailability(indicators, regionCode);
        if (params.get('savedDraft')) {
            try {
                const matches = await listPriorityAreaDrafts({ regionCode, hazardType: hazard, draftId: params.get('savedDraft'), limit: 1 });
                if (!matches.length || !restorePriorityDraftPayload(draftPayloadFromRow(matches[0]), matches[0].id)) throw new Error('해당 지역의 저장본을 불러오지 못했습니다.');
                loadedDraftId = matches[0].id;
                supabaseStatus = `${matches[0].analysis_version} 불러오기 완료 · ${region}`;
                schedulePriorityDraftSave();
                const cleanUrl = new URL(window.location.href); cleanUrl.searchParams.delete('savedDraft');
                window.history.replaceState(null, '', cleanUrl);
            } catch (error) { supabaseStatus = error.message; }
        }
        if (config.dataSummaryPath && regionCode === '41110') {
            try {
                const dataResponse = await fetch(asset(config.dataSummaryPath));
                dataBundle = await dataResponse.json();
                dataBundleStatus = `${dataBundle.title} 연결됨`;
            } catch (error) {
                dataBundleStatus = '수원 시연 원자료 요약 연결 실패';
            }
        }

        if (!analysisResult?.gridResult) mapSource = config.mapSource;

        if (!analysisResult?.gridResult) {
            const initialPreview = await loadIndicatorInputs(initialPreviewTargets(indicators), [], { preferDense: true });
            loadedPreviewIndicators = mergePreviewInputs(loadedPreviewIndicators, initialPreview);
            indicatorPreviewGrid = createIndicatorPreviewGrid(loadedPreviewIndicators);
        }

        lastDevResetAt = await readDevelopmentResetSignal();
        devResetPollTimer = window.setInterval(async () => {
            const resetAt = await readDevelopmentResetSignal();
            if (resetAt && lastDevResetAt && resetAt !== lastDevResetAt) {
                lastDevResetAt = resetAt;
                await applyDevelopmentReset();
            } else if (resetAt && !lastDevResetAt) {
                lastDevResetAt = resetAt;
            }
        }, 1500);

        return () => {
            window.clearTimeout(draftSaveTimer);
        };
    });

    onDestroy(() => {
        if (typeof window === 'undefined') return;
        window.clearTimeout(draftSaveTimer);
        window.clearInterval(devResetPollTimer);
    });

    function cloneIndicatorsForAlternative(sourceIndicators = indicators) {
        return sourceIndicators.map((item) => {
            if (!item.customDatasetId) return {...item};
            const {gridValues, gridValidIndices, ...reference} = item;
            return reference;
        });
    }

    function currentAlternativeState(overrides = {}) {
        return {
            settings: {
                gridUnit,
                dimensionWeights: { ...dimensionWeights },
                indicators: cloneIndicatorsForAlternative(indicators)
            },
            analysisResult,
            appliedIndicators: appliedIndicators.map((item) => ({ ...item })),
            analysisDone,
            analysisMessage,
            parcelCandidateMessage,
            selectedCandidate,
            detailCandidateKey,
            activeLayer,
            ...overrides
        };
    }

    function persistAlternative(index = activeAlternative, overrides = {}) {
        alternatives = alternatives.map((alternative, alternativeIndex) =>
            alternativeIndex === index
                ? { ...alternative, ...currentAlternativeState(overrides) }
                : alternative
        );
    }

    function loadAlternative(index) {
        const alternative = alternatives[index];
        if (!alternative) return;
        analysisRunId += 1;
        running = false;

        gridUnit = alternative.settings?.gridUnit || '100m';
        dimensionWeights = { ...(alternative.settings?.dimensionWeights || { H: 1, E: 1, V: 1 }) };
        indicators = cloneIndicatorsForAlternative(alternative.settings?.indicators || config.indicators)
            .map((item) => ({ ...item, enabled: item.enabled && isIndicatorAvailable(item) }));
        analysisResult = alternative.analysisResult || null;
        const settingsById = new Map(indicators.map(item => [item.id, item]));
        loadedPreviewIndicators = (analysisResult?.indicators || loadedPreviewIndicators)
            .filter(item => settingsById.has(item.id))
            .map(item => ({...item, enabled:settingsById.get(item.id).enabled, weight:settingsById.get(item.id).weight}));
        indicatorPreviewGrid = analysisResult?.gridResult
            ? {...analysisResult.gridResult, preview:true}
            : createIndicatorPreviewGrid(loadedPreviewIndicators);
        appliedIndicators = (alternative.appliedIndicators || []).map((item) => ({ ...item }));
        analysisDone = Boolean(alternative.analysisDone && analysisResult);
        analysisMessage = alternative.analysisMessage || '설정값을 확인한 뒤 Risk 분석을 실행하세요.';
        parcelCandidateMessage = alternative.parcelCandidateMessage ||
            (analysisResult?.parcelCandidates?.length
                ? `${analysisResult.parcelCandidates.length}개 실천권역 도출`
                : analysisDone
                    ? 'Risk 분석 완료. 지도에서 실천권역도출하기를 실행하세요.'
                    : 'Risk 분석 후 지도에서 실천권역도출하기를 실행하세요.');
        selectedCandidate = Number.isInteger(alternative.selectedCandidate) ? alternative.selectedCandidate : 0;
        detailCandidateKey = alternative.detailCandidateKey ||
            (analysisResult?.parcelCandidates?.[0] ? candidateIdentity(analysisResult.parcelCandidates[0]) : null);
        focusedCandidate = null;
        mapResetKey += 1;
        activeLayer = alternative.activeLayer || 'Risk';
        activeStep = analysisDone ? 4 : Math.min(activeStep, 2);
        if (analysisResult?.gridResult && !analysisResult.gridResult.vValues && analysisResult.indicators?.length) {
            void restoreAlternativeComponents(index, analysisRunId, analysisResult);
        }
    }

    async function restoreAlternativeComponents(index, runId, savedResult) {
        running = true;
        const previousMessage = analysisMessage;
        analysisMessage = '저장된 H/E/V 레이어를 서버에서 복원하고 있습니다.';
        try {
            const rebuilt = await requestRiskAnalysis(savedResult.indicators.filter(usableIndicator), {
                gridUnit, dimensionWeights: { ...dimensionWeights }, nationalLab
            });
            if (runId !== analysisRunId || index !== activeAlternative) return;
            // Keep saved Risk, parcel candidates, and all saved statistics unchanged.
            const { hValues, eValues, sensitivityValues, adaptiveCapacityValues, vValues } = rebuilt.gridResult;
            analysisResult = { ...savedResult, gridResult: { ...savedResult.gridResult,
                hValues, eValues, sensitivityValues, adaptiveCapacityValues, vValues } };
            alternatives = alternatives.map((item, i) => i === index ? { ...item, analysisResult } : item);
            analysisMessage = previousMessage;
        } catch (error) {
            if (runId !== analysisRunId || index !== activeAlternative) return;
            analysisMessage = `저장된 Risk는 유지했지만 H/E/V 레이어를 복원하지 못했습니다. ${error.message}`;
        } finally {
            if (runId === analysisRunId && index === activeAlternative) running = false;
        }
    }

    function switchAlternative(index) {
        activeComparisonId = null;
        if (index === activeAlternative) return;
        persistAlternative(activeAlternative);
        activeAlternative = index;
        loadAlternative(index);
        schedulePriorityDraftSave();
    }



    function mergePreviewInputs(...batches) {
        const currentById = new Map(indicators.map((item) => [item.id, item]));
        const merged = new Map(batches.flat().map((item) => [item.id, item]));
        return [...merged.values()].flatMap((item) => {
            const current = currentById.get(item.id);
            if (!current || indicatorDataKey(current) !== indicatorDataKey(item)) return [];
            return [{ ...item, enabled: current.enabled, weight: current.weight, direction: current.direction }];
        });
    }

    function initialPreviewTargets(sourceIndicators) {
        return sourceIndicators
            .filter((item) => item.enabled && item.group === '기후위험' && item.dataPath)
            .slice(0, 1)
            .map((item) => ({ ...item }));
    }






    async function loadIndicatorInputs(sourceIndicators, cachedIndicators = [], options = {}) {
        const loaded = await queryIndicatorInputs(sourceIndicators, cachedIndicators, {...options, regionCode, asset, usableIndicator});
        const loadedGrid = loaded.find(item => item.gridSummary && !item.loadError);
        mapSource = loadedGrid ? `${config.rasterReadyPrefix} · ${loadedGrid.gridSummary.columns}×${loadedGrid.gridSummary.rows}` : config.mapSource;
        return loaded;
    }

    function createIndicatorPreviewGrid(sourceIndicators) {
        const previewItems = sourceIndicators.filter((item) =>
            item.enabled &&
            isGridValueCollection(item.gridValues) &&
            gridValueCollectionSize(item.gridValues) &&
            item.gridMeta?.columns &&
            item.gridMeta?.rows &&
            item.gridMeta?.transform
        );
        const reference = previewItems[0];
        if (!reference) return null;
        let previewValues = reference.gridValues;
        if (previewValues instanceof Map) {
            previewValues = new Float32Array(Number(reference.gridMeta.columns) * Number(reference.gridMeta.rows)).fill(NaN);
            reference.gridValues.forEach((value, index) => { previewValues[index] = value; });
        }
        const hasSparseIndices = previewItems.every((item) =>
            Array.isArray(item.gridValidIndices) && item.gridValidIndices.length
        );
        const validIndices = hasSparseIndices
            ? [...new Set(previewItems.flatMap((item) => item.gridValidIndices))]
            : null;

        return {
            preview: true,
            gridUnit: reference.gridMeta.gridUnit || gridUnit,
            columns: Number(reference.gridMeta.columns),
            rows: Number(reference.gridMeta.rows),
            extent: reference.gridMeta.extent,
            transform: reference.gridMeta.transform,
            crs: reference.gridMeta.crs,
            values: previewValues,
            validIndices
        };
    }

    function isIndicatorAvailable(item) {
        if (item.custom && item.regionCode && item.regionCode !== regionCode) return false;
        return ['available', 'partial'].includes(item.dataStatus) && (!item.supportedGridUnits || item.supportedGridUnits.includes(gridUnit));
    }

    function indicatorStatusText(item) {
        if (item.coverageNote) return item.coverageNote;
        if (!['available', 'partial'].includes(item.dataStatus)) return '연결대기';
        if (item.supportedGridUnits && !item.supportedGridUnits.includes(gridUnit)) return '격자미지원';
        return item.dataStatus === 'partial' ? `${item.sourceType} · 일부 보완 필요` : item.sourceType;
    }

    function usableIndicator(item) {
        return item.enabled && isIndicatorAvailable(item);
    }

    function selectedIndicatorsFor(group, source = indicators) {
        return source.filter((item) => item.group === group && usableIndicator(item));
    }

    function clamp01(value) {
        return Math.min(1, Math.max(0, value));
    }

    function indicatorValue(item) {
        if (Number.isFinite(item.loadedValue)) return clamp01(item.loadedValue);
        const value = Number(item.value);
        if (Number.isFinite(value)) return clamp01(value);
        return clamp01(0.45 + ((item.id * 17) % 40) / 100);
    }

    function weightedMean(items, valueGetter = indicatorValue) {
        const totalWeight = items.reduce((sum, item) => sum + Math.max(0, Number(item.weight) || 0), 0);
        if (!items.length || totalWeight <= 0) return null;
        return items.reduce((sum, item) => sum + Math.max(0, Number(item.weight) || 0) * valueGetter(item), 0) / totalWeight;
    }



    function finiteGridValue(value) {
        if (value === null || value === undefined || value === '') return null;
        const number = Number(value);
        return Number.isFinite(number) ? clamp01(number) : null;
    }

    function gridValue(item, index) {
        if (!isGridValueCollection(item.gridValues)) return null;
        return finiteGridValue(item.gridValues instanceof Map ? item.gridValues.get(index) : item.gridValues[index]);
    }





    function stripIndicatorForResult(item) {
        const { gridValues, ...resultItem } = item;
        return {
            ...resultItem,
            gridValues: isGridValueCollection(gridValues) ? gridValues : null
        };
    }



    function validateAnalysis() {
        const activeRequiredGroups = analysisRequiredGroups();
        const missingGroup = activeRequiredGroups.find((group) => selectedIndicatorsFor(group).length === 0);
        if (missingGroup) {
            return `분석을 실행할 수 없습니다. ${missingGroup} 영역에 선택된 사용 가능 지표가 없습니다.`;
        }
        const zeroWeightGroup = activeRequiredGroups.find((group) => {
            const items = selectedIndicatorsFor(group);
            return items.reduce((sum, item) => sum + Math.max(0, Number(item.weight) || 0), 0) <= 0;
        });
        if (zeroWeightGroup) {
            return `분석을 실행할 수 없습니다. ${zeroWeightGroup} 영역의 가중치 합이 0입니다.`;
        }
        const activeDimensionWeight = activeRequiredGroups.length === 1
            ? dimensionWeights.H
            : dimensionWeights.H + dimensionWeights.E + dimensionWeights.V;
        if (activeDimensionWeight <= 0) {
            return '분석을 실행할 수 없습니다. H/E/V 통합 가중치 합이 0입니다.';
        }
        return '';
    }



    function formatScore(value) {
        return Number.isFinite(value) ? value.toFixed(2) : '--';
    }

    function formatInteger(value) {
        const number = Number(value);
        return Number.isFinite(number) ? Math.round(number).toLocaleString() : '--';
    }

    function formatHandoffTime(value) {
        if (!value) return '전달 시각 기록 없음';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '전달 시각 기록 없음';
        return date.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    }

    function rememberHandoffPackage(packageRecord) {
        if (!packageRecord?.packageId) return;
        latestHandoffPackage = packageRecord;
        sentHandoffPackages = [
            packageRecord,
            ...sentHandoffPackages.filter((item) => item.packageId !== packageRecord.packageId)
        ].slice(0, 20);
    }

    function candidateTotalAreaLabel(candidate) {
        if (candidate?.totalAreaLabel) return candidate.totalAreaLabel;
        const area = Number(candidate?.totalAreaSqm);
        if (!Number.isFinite(area) || area <= 0) return '면적 산정 전';
        if (area >= 10000) return `${(area / 10000).toFixed(area >= 100000 ? 1 : 2)}ha`;
        return `${Math.round(area).toLocaleString()}㎡`;
    }

    function markAnalysisDirty(message = '설정이 변경되었습니다. Risk 분석을 다시 실행하세요.') {
        analysisRunId += 1;
        running = false;
        analysisDone = false;
        analysisResult = null;
        appliedIndicators = [];
        parcelCandidateMessage = 'Risk 분석 후 지도에서 실천권역도출하기를 실행하세요.';
        selectedCandidate = 0;
        detailCandidateKey = null;
        focusedCandidate = null;
        analysisMessage = message;
        schedulePriorityDraftSave();
    }

    function toNumber(value, fallback = 0) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function setDimensionWeight(dimension, value) {
        dimensionWeights = {
            ...dimensionWeights,
            [dimension]: Math.max(0, toNumber(value, 0))
        };
        markAnalysisDirty();
    }

    async function setHazardDatasetMode(value) {
        hazardDatasetMode = hazard === 'heatwave' && value === 'future' ? 'future' : 'observed';
        await refreshHazardDataset(
            hazardDatasetMode === 'observed'
                ? '최근 5년(2021~2025) 100m 자료로 전환했습니다. H01~H05·H07·H10을 사용할 수 있습니다.'
                : `미래 ${hazardScenario.toUpperCase()} ${hazardFuturePeriod} 100m 자료로 전환했습니다. H01~H09를 사용할 수 있습니다.`
        );
    }

    function analysisRequiredGroups(source = indicators) {
        const hasCompleteHev = requiredGroups.every((group) => selectedIndicatorsFor(group, source).length > 0);
        if (hasCompleteHev || !nationalLab) return requiredGroups;
        return selectedIndicatorsFor('기후위험', source).length ? ['기후위험'] : requiredGroups;
    }

    async function refreshHazardDataset(message) {
        const customIndicators = indicators.filter(item => item.custom);
        indicators = [...configureIndicatorsForRegion(config.indicators, regionCode, hazardDatasetMode)
            .map((item) => ({ ...item, enabled: item.enabled && isIndicatorAvailable(item) })), ...customIndicators];
        indicators = await applyRegionalAvailability(indicators, regionCode);
        loadedPreviewIndicators = await loadIndicatorInputs(initialPreviewTargets(indicators), [], { preferDense: true });
        indicatorPreviewGrid = createIndicatorPreviewGrid(loadedPreviewIndicators);
        const url = new URL(window.location.href);
        url.searchParams.set('hazardPeriod', hazardDatasetMode);
        url.searchParams.set('scenario', hazardScenario);
        url.searchParams.set('futurePeriod', hazardFuturePeriod);
        window.history.replaceState({}, '', url);
        markAnalysisDirty(message);
    }

    async function setHazardScenario(value) {
        hazardScenario = hazardScenarios.includes(value) ? value : 'ssp245';
        await refreshHazardDataset(`${hazardScenario.toUpperCase()} ${hazardFuturePeriod} 전국 100m 미래지표로 전환했습니다.`);
    }

    async function setHazardFuturePeriod(value) {
        hazardFuturePeriod = hazardFuturePeriods.includes(value) ? value : '2050';
        await refreshHazardDataset(`${hazardScenario.toUpperCase()} ${hazardFuturePeriod} 전국 100m 미래지표로 전환했습니다.`);
    }

    async function setNationalRegion(nextCode) {
        const nextRegion = getRegionByCode(nextCode);
        if (!nextRegion || nextRegion.code === regionCode) return;

        const runId = ++regionChangeRunId;
        regionCode = nextRegion.code;
        region = nextRegion.fullName;
        selectedSido = nextRegion.sido;
        indicators = configureIndicatorsForRegion(config.indicators, regionCode, hazardDatasetMode)
            .map((item) => ({ ...item, enabled: item.enabled && isIndicatorAvailable(item) }));
        const available = await applyRegionalAvailability(indicators, regionCode);
        if (runId !== regionChangeRunId) return;
        indicators = available;
        loadedPreviewIndicators = [];
        indicatorPreviewGrid = null;
        mapSource = `${region} 전국 100m 원본 연결 중`;
        markAnalysisDirty(`${region}의 100m Hazard 자료를 불러오는 중입니다.`);

        const loaded = await loadIndicatorInputs(initialPreviewTargets(indicators), [], { preferDense: true });
        if (runId !== regionChangeRunId) return;
        loadedPreviewIndicators = loaded;
        indicatorPreviewGrid = createIndicatorPreviewGrid(loadedPreviewIndicators);
        mapResetKey += 1;

        const url = new URL(window.location.href);
        url.searchParams.set('regionCode', regionCode);
        url.searchParams.set('regionName', region);
        url.searchParams.set('hazardPeriod', hazardDatasetMode);
        url.searchParams.set('scenario', hazardScenario);
        url.searchParams.set('futurePeriod', hazardFuturePeriod);
        window.history.replaceState({}, '', url);
        markAnalysisDirty(`${region} 행정경계에 맞춘 100m 지표를 연결했습니다.`);
    }

    function setNationalSido(value) {
        selectedSido = value;
        const firstRegion = getRegionOptionsBySido(selectedSido)[0];
        if (firstRegion) setNationalRegion(firstRegion.code);
    }

    async function setIndicatorEnabled(id, enabled) {
        indicators = indicators.map((item) => item.id === id ? { ...item, enabled } : item);
        markAnalysisDirty();

        const target = indicators.find((item) => item.id === id);
        const cached = loadedPreviewIndicators.some((item) => item.id === id && isGridValueCollection(item.gridValues));
        if (enabled && target?.dataPath && !cached) {
            const [loaded] = await loadIndicatorInputs([{ ...target }], loadedPreviewIndicators, { preferDense: true });
            loadedPreviewIndicators = [
                ...loadedPreviewIndicators.filter((item) => item.id !== id),
                loaded
            ];
        }

        const currentById = new Map(indicators.map((item) => [item.id, item]));
        loadedPreviewIndicators = loadedPreviewIndicators.map((item) => ({
            ...item,
            enabled: Boolean(currentById.get(item.id)?.enabled),
            weight: currentById.get(item.id)?.weight ?? item.weight,
            direction: currentById.get(item.id)?.direction ?? item.direction
        }));
        indicatorPreviewGrid = createIndicatorPreviewGrid(loadedPreviewIndicators);
    }

    function setIndicatorWeight(id, value) {
        indicators = indicators.map((item) => item.id === id
            ? { ...item, weight: Math.max(0, toNumber(value, item.weight)) }
            : item
        );
        markAnalysisDirty();
    }

    function adjustIndicatorWeight(id, delta) {
        const item = indicators.find((entry) => entry.id === id);
        if (!item) return;
        const next = Math.min(3, Math.max(0, Math.round((Number(item.weight) + delta) * 10) / 10));
        setIndicatorWeight(id, next);
    }

    function colorFor(value) {
        const adjusted = activeLayer === 'Hotspot' ? value * 1.12 : activeLayer === 'H' ? value * 0.9 : activeLayer === 'E' ? value * 1.04 : activeLayer === 'V' ? value * 0.96 : value;
        if (adjusted > 0.78) return '#d83b3e';
        if (adjusted > 0.62) return '#eb7042';
        if (adjusted > 0.46) return '#f2ad4b';
        if (adjusted > 0.3) return '#f5d77a';
        return '#dce9bd';
    }

    async function runAnalysis() {
        if (!alternatives.length) return;
        const validationMessage = validateAnalysis();
        if (validationMessage) {
            analysisMessage = validationMessage;
            activeStep = 2;
            return;
        }

        const runId = ++analysisRunId;
        running = true;
        analysisDone = false;
        analysisResult = null;
        analysisMessage = '선택한 원자료를 불러와 Risk를 계산하고 있습니다.';
        activeStep = 3;
        const analysisAlternativeIndex = activeAlternative;
        const runGridUnit = gridUnit;
        const runDimensionWeights = { ...dimensionWeights };
        const snapshot = indicators.map((item) => ({ ...item }));
        try {
            let result;
            const selected = snapshot.filter(usableIndicator);
            if (selected.every(item => item.customDatasetId ? userIndicatorLibraryEnabled : (item.registryId && item.dataSourceId))) {
                result = await requestRegisteredRiskAnalysis(selected, {
                    sector: hazard, regionCode, mode: hazardDatasetMode,
                    scenario: hazardScenario, period: hazardFuturePeriod,
                    gridUnit: runGridUnit, dimensionWeights: runDimensionWeights, nationalLab
                });
                if (runId !== analysisRunId) return;
                loadedPreviewIndicators = result.indicators;
            } else {
                // Uploaded inputs and older saved definitions keep their explicit compatibility transport.
            const enrichedSnapshot = await loadIndicatorInputs(snapshot, loadedPreviewIndicators);
            if (runId !== analysisRunId) return;
            const failed = enrichedSnapshot.filter((item) => item.enabled && item.loadError);
            if (failed.length) throw new Error(failed.map((item) => item.loadError).join(' · '));
            loadedPreviewIndicators = enrichedSnapshot.filter((item) => isGridValueCollection(item.gridValues));
            const missingAfterLoad = analysisRequiredGroups(enrichedSnapshot)
                .find((group) => selectedIndicatorsFor(group, enrichedSnapshot).length === 0);
            if (missingAfterLoad) {
                analysisMessage = `분석을 실행할 수 없습니다. ${missingAfterLoad} 영역의 입력자료를 읽지 못했습니다.`;
                running = false;
                activeStep = 2;
                return;
            }

            result = await requestRiskAnalysis(enrichedSnapshot.filter(usableIndicator), { gridUnit: runGridUnit, dimensionWeights: runDimensionWeights, nationalLab });
            if (runId !== analysisRunId) return;
            }
            result = identifyRiskResult(result, alternatives[analysisAlternativeIndex], {
                sector: hazard, regionCode, gridUnit: runGridUnit,
                dimensionWeights: { ...runDimensionWeights },
                mode: hazardDatasetMode, scenario: hazardScenario, period: hazardFuturePeriod,
            });
            const validCells = result.gridResult?.stats?.validCells;
            const riskModeLabel = result.hazardOnly ? 'H 기반 예비 Risk' : 'H/E/V 종합 Risk';
            const usesDemoFallback = result.indicators.some((item) => item.demoFallback);
            const completedMessage = Number.isFinite(validCells)
                ? `${runGridUnit} 기준 격자 ${validCells.toLocaleString()}셀 · ${result.indicators.length}개 지표로 ${riskModeLabel} 분석 완료`
                : `${runGridUnit} 기준 격자 · ${result.indicators.length}개 지표로 ${riskModeLabel} 분석 완료`;
            const nextAnalysisMessage = usesDemoFallback
                ? `${completedMessage} · 공개 시연용 대체 패턴 포함(실제 Hazard 원자료 아님)`
                : completedMessage;

            alternatives = alternatives.map((alternative, index) => index === analysisAlternativeIndex
                ? {
                    ...alternative,
                    settings: {
                        gridUnit: runGridUnit,
                        dimensionWeights: { ...runDimensionWeights },
                        indicators: cloneIndicatorsForAlternative(snapshot)
                    },
                    analysisResult: result,
                    appliedIndicators: result.indicators.map((item) => ({ ...item })),
                    analysisDone: true,
                    analysisMessage: nextAnalysisMessage,
                    parcelCandidateMessage: 'Risk 분석 완료. 지도에서 실천권역도출하기를 실행하세요.',
                    selectedCandidate: 0,
                    detailCandidateKey: null,
                    activeLayer,
                    status: alternative.status === '선정' ? alternative.status : '리스크분석완료'
                }
                : alternative
            );

            if (activeAlternative === analysisAlternativeIndex) {
                appliedIndicators = result.indicators;
                analysisResult = result;
                selectedCandidate = 0;
                detailCandidateKey = null;
                focusedCandidate = null;
                parcelCandidateMessage = 'Risk 분석 완료. 지도에서 실천권역도출하기를 실행하세요.';
                analysisMessage = nextAnalysisMessage;
                analysisDone = true;
                activeStep = 4;
            }

            running = false;
            schedulePriorityDraftSave();
        } catch (error) {
            if (runId !== analysisRunId) return;
            analysisDone = false;
            analysisResult = null;
            loadedPreviewIndicators = [];
            analysisMessage = `분석을 완료하지 못했습니다. ${error.message}`;
            activeStep = 2;
        } finally {
            if (runId === analysisRunId) running = false;
        }
    }

    function handleParcelCandidates(candidates, message, sourceAlternativeId = activeAlternativeId, event = {}) {
        const nextCandidates = enrichPracticeDistricts(Array.isArray(candidates) ? candidates : [], hazard);
        const nextMessage = message || (nextCandidates.length
            ? `실천권역 내 ${nextCandidates.length}개 유형별 실천지구 도출`
            : '실천권역이 아직 없습니다.');
        const targetIndex = alternatives.findIndex((alternative) => alternative.id === sourceAlternativeId);
        if (targetIndex < 0) return;
        const safeTargetIndex = targetIndex;
        const targetAlternative = alternatives[safeTargetIndex];
        const targetAnalysisResult = safeTargetIndex === activeAlternative
            ? analysisResult
            : targetAlternative?.analysisResult;
        if (!targetAnalysisResult) return;
        if (event.riskResultId && event.riskResultId !== targetAnalysisResult.riskResultId) return;
        if (event.kind === 'error') return;

        const nextAnalysisResult = event.kind === 'derive'
            ? identifyDistrictResult(targetAnalysisResult, nextCandidates) : {
            ...targetAnalysisResult,
            parcelCandidates: nextCandidates
        };
        const nextDetailKey = nextCandidates[0] ? candidateIdentity(nextCandidates[0]) : null;

        alternatives = alternatives.map((alternative, index) => index === safeTargetIndex
            ? {
                ...alternative,
                analysisResult: nextAnalysisResult,
                parcelCandidateMessage: nextMessage,
                selectedCandidate: 0,
                detailCandidateKey: nextDetailKey,
                status: alternative.status === '선정'
                    ? alternative.status
                    : nextCandidates.length
                        ? '분석완료'
                        : '리스크분석완료'
            }
            : alternative
        );

        if (safeTargetIndex === activeAlternative) {
            parcelCandidateMessage = nextMessage;
            selectedCandidate = 0;
            detailCandidateKey = nextDetailKey;
            analysisResult = nextAnalysisResult;
        }
        schedulePriorityDraftSave();
    }

    function focusCandidateOnMap(candidate, index) {
        selectedCandidate = index;
        focusedCandidate = {
            ...candidate,
            id: candidate.id,
            rank: candidate.rank,
            name: candidate.name,
            bounds: candidate.bounds,
            center: candidate.center,
            features: candidate.features || [],
            pnuList: candidate.pnuList || [],
            requestedAt: Date.now()
        };
        selectedRegionMap?.focusCandidate?.(focusedCandidate);
    }







    function createDefaultAlternative(index = 0) {
        const configured = config.alternatives[index] || {
            name: `대안 ${index + 1}`,
            status: '검토중',
            description: '새 기후적응실천권역 대안'
        };
        return {
            ...configured,
            id: `alternative-${Date.now()}-${index}`,
            alternativeId: createResultId('alternative'),
            settings: null,
            analysisResult: null,
            appliedIndicators: [],
            analysisDone: false,
            analysisMessage: null,
            parcelCandidateMessage: null,
            selectedCandidate: 0,
            detailCandidateKey: null,
            activeLayer: 'Risk'
        };
    }

    function candidateIdentity(candidate) {
        return String(candidate?.id || candidate?.name || `candidate-${candidate?.rank ?? ''}`);
    }

    function selectCandidate(candidate, index) {
        focusCandidateOnMap(candidate, index);
        if (detailCandidateKey) detailCandidateKey = candidateIdentity(candidate);
        schedulePriorityDraftSave();
    }

    function showCandidateDetail(candidate, index) {
        selectCandidate(candidate, index);
        detailCandidateKey = candidateIdentity(candidate);
    }

    function handleMapParcelCandidateFocus(candidate) {
        const index = candidateList.findIndex((item) =>
            candidateIdentity(item) === candidateIdentity(candidate) ||
            Number(item.rank) === Number(candidate.rank) ||
            item.name === candidate.name
        );
        if (index < 0) return;
        const matchedCandidate = candidateList[index];
        focusCandidateOnMap(matchedCandidate, index);
        detailCandidateKey = candidateIdentity(matchedCandidate);
        schedulePriorityDraftSave();
    }

    function summarizeCandidateForHandoff(candidate, alternative, alternativeIndex) {
        const pnuList = Array.from(new Set((candidate.pnuList || []).map((value) => String(value || '').trim()).filter(Boolean)));
        const parcelCount = Math.max(Number(candidate.parcelCount) || 0, pnuList.length);
        const featureTotal = candidate.featureTotal || candidate.featureLimit || candidate.features?.length || 0;
        const scores = {
            risk: candidate.risk,
            h: candidate.h,
            e: candidate.e,
            v: candidate.v,
            score: candidate.score
        };
        const attributes = {
            area: candidate.area,
            reason: candidate.reason,
            basis: candidate.basis,
            practiceType: candidate.practiceType,
            practiceTypeLabel: candidate.practiceTypeLabel,
            classificationVersion: candidate.classificationVersion,
            classificationRule: candidate.classificationRule,
            classificationReason: candidate.classificationReason,
            parcelCount,
            hotspotCount: candidate.hotspotCount,
            totalAreaSqm: candidate.totalAreaSqm,
            totalAreaLabel: candidateTotalAreaLabel(candidate),
            pnuList,
            pnuTotal: pnuList.length,
            featureLimit: candidate.featureLimit || 0,
            featureTotal,
            geometryMode: 'compact'
        };
        const geometry = {
            center: candidate.center || null,
            bounds: candidate.bounds || null,
            features: []
        };

        return {
            id: candidate.id || `${alternative.id}-candidate-${candidate.rank}`,
            alternativeId: alternative.id,
            resultReferences: {
                alternativeId: alternative.alternativeId,
                riskResultId: alternative.analysisResult?.riskResultId || null,
                districtResultId: candidate.districtResultId || null,
                districtId: candidate.districtId || null,
                parcelDatasetVersion: candidate.parcelDatasetVersion || null,
            },
            alternativeName: alternative.name,
            alternativeStatus: alternative.status,
            alternativeIndex: alternativeIndex + 1,
            rank: candidate.rank,
            name: candidate.name,
            area: candidate.area,
            risk: candidate.risk,
            h: candidate.h,
            e: candidate.e,
            v: candidate.v,
            reason: candidate.reason,
            basis: candidate.basis,
            practiceType: candidate.practiceType,
            practiceTypeLabel: candidate.practiceTypeLabel,
            classificationVersion: candidate.classificationVersion,
            classificationRule: candidate.classificationRule,
            classificationReason: candidate.classificationReason,
            parcelCount,
            hotspotCount: candidate.hotspotCount,
            totalAreaSqm: candidate.totalAreaSqm,
            totalAreaLabel: candidateTotalAreaLabel(candidate),
            pnuList,
            pnuTotal: pnuList.length,
            center: candidate.center || null,
            bounds: candidate.bounds || null,
            features: [],
            scores,
            attributes,
            geometry,
            geometryMode: 'compact',
            score: candidate.score
        };
    }

    function buildDepartmentHandoffPayload(sourceAlternatives = alternatives) {
        const alternativePayloads = sourceAlternatives.map((alternative, index) => {
            const candidates = alternative.analysisResult?.parcelCandidates || [];
            const candidateBundles = candidates.map((candidate) => summarizeCandidateForHandoff(candidate, alternative, index));
            const riskValues = candidateBundles.map((candidate) => Number(candidate.scores?.risk ?? candidate.risk)).filter(Number.isFinite);
            return {
                id: alternative.id,
                resultReferences: {
                    alternativeId: alternative.alternativeId,
                    riskResultId: alternative.analysisResult?.riskResultId || null,
                    districtResultId: alternative.analysisResult?.districtResultId || null,
                },
                name: alternative.name,
                status: alternative.status,
                description: alternative.description,
                analysisDone: alternative.analysisDone,
                analysisMessage: alternative.analysisMessage,
                gridUnit: alternative.settings?.gridUnit || gridUnit,
                summary: {
                    candidateCount: candidateBundles.length,
                    averageRisk: riskValues.length ? riskValues.reduce((sum, value) => sum + value, 0) / riskValues.length : null,
                    maxRisk: riskValues.length ? Math.max(...riskValues) : null
                },
                candidates: candidateBundles
            };
        });
        const candidates = alternativePayloads.flatMap((alternative) => alternative.candidates);
        return {
            packageId: `priority-management-${regionCode}-${Date.now()}`,
            schemaVersion: 'priority-management-handoff/v1',
            source: 'priority-management-area',
            target: 'lead-department-tool',
            createdAt: new Date().toISOString(),
            deliveryStatus: 'draft',
            projectName,
            hazard,
            hazardLabel: config.label,
            region,
            regionCode,
            formula: 'Weighted geometric mean of H/E/V',
            dimensionWeights,
            commonDataItems: config.commonDataItems,
            alternatives: alternativePayloads,
            candidates,
            candidateBundle: {
                model: 'alternative > candidates > candidate.scores/attributes/geometry',
                alternativeCount: alternativePayloads.filter((alternative) => alternative.candidates.length).length,
                candidateCount: candidates.length
            },
            finalSelections: alternativePayloads
                .filter((alternative) => alternative.status === '선정')
                .flatMap((alternative) => alternative.candidates)
        };
    }

    function relayHandoffToLeadDepartment(deliveredPayload) {
        if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.resolve(false);

        return new Promise((resolve) => {
            let settled = false;
            let resendTimer = null;
            const targetUrl = new URL(leadDepartmentToolUrl, window.location.href);
            targetUrl.searchParams.set('handoffRelay', 'priority-management');
            targetUrl.searchParams.set('regionCode', deliveredPayload.regionCode || regionCode);

            const iframe = document.createElement('iframe');
            iframe.title = 'priority-management-handoff-relay';
            iframe.setAttribute('aria-hidden', 'true');
            iframe.style.position = 'fixed';
            iframe.style.width = '1px';
            iframe.style.height = '1px';
            iframe.style.left = '-10000px';
            iframe.style.top = '-10000px';
            iframe.style.opacity = '0';
            iframe.style.pointerEvents = 'none';

            const cleanup = () => {
                window.removeEventListener('message', handleAck);
                if (resendTimer) window.clearInterval(resendTimer);
                window.setTimeout(() => iframe.remove(), 250);
            };
            const finish = (ok) => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(ok);
            };
            const send = () => {
                try {
                    iframe.contentWindow?.postMessage({
                        type: DEPARTMENT_HANDOFF_KEY,
                        payload: deliveredPayload
                    }, targetUrl.origin);
                } catch {
                    // The timeout below will report a relay miss.
                }
            };
            function handleAck(event) {
                if (event.origin !== targetUrl.origin) return;
                if (event.data?.type !== `${DEPARTMENT_HANDOFF_KEY}:ack`) return;
                if (event.data?.packageId !== deliveredPayload.packageId) return;
                finish(true);
            }

            window.addEventListener('message', handleAck);
            iframe.addEventListener('load', () => {
                send();
                resendTimer = window.setInterval(send, 250);
            });
            iframe.src = targetUrl.toString();
            document.body.appendChild(iframe);
            window.setTimeout(() => finish(false), 3500);
        });
    }

    async function saveHandoffToLocalInbox(deliveredPayload) {
        const supabaseOk = await savePlatformHandoff('priority_to_lead', deliveredPayload, 'requested');
        try {
            const response = await fetch(priorityHandoffInboxUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(deliveredPayload)
            });
            if (!response.ok) return supabaseOk;
            const result = await response.json().catch(() => null);
            return supabaseOk || Boolean(result?.ok);
        } catch {
            return supabaseOk;
        }
    }

    function relayRecallToLeadDepartment(packageId) {
        if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.resolve(false);

        return new Promise((resolve) => {
            let settled = false;
            let resendTimer = null;
            const targetUrl = new URL(leadDepartmentToolUrl, window.location.href);
            targetUrl.searchParams.set('handoffRelay', 'priority-management');
            targetUrl.searchParams.set('handoffRecall', 'priority-management');
            targetUrl.searchParams.set('regionCode', regionCode);
            if (packageId) targetUrl.searchParams.set('packageId', packageId);

            const iframe = document.createElement('iframe');
            iframe.title = 'priority-management-handoff-recall';
            iframe.setAttribute('aria-hidden', 'true');
            iframe.style.position = 'fixed';
            iframe.style.width = '1px';
            iframe.style.height = '1px';
            iframe.style.left = '-10000px';
            iframe.style.top = '-10000px';
            iframe.style.opacity = '0';
            iframe.style.pointerEvents = 'none';

            const cleanup = () => {
                window.removeEventListener('message', handleAck);
                if (resendTimer) window.clearInterval(resendTimer);
                window.setTimeout(() => iframe.remove(), 250);
            };
            const finish = (ok) => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(ok);
            };
            const send = () => {
                try {
                    iframe.contentWindow?.postMessage({
                        type: `${DEPARTMENT_HANDOFF_KEY}:recall`,
                        packageId,
                        regionCode
                    }, targetUrl.origin);
                } catch {
                    // The timeout below will report a relay miss.
                }
            };
            function handleAck(event) {
                if (event.origin !== targetUrl.origin) return;
                if (event.data?.type !== `${DEPARTMENT_HANDOFF_KEY}:recall:ack`) return;
                if (packageId && event.data?.packageId !== packageId) return;
                finish(true);
            }

            window.addEventListener('message', handleAck);
            iframe.addEventListener('load', () => {
                send();
                resendTimer = window.setInterval(send, 250);
            });
            iframe.src = targetUrl.toString();
            document.body.appendChild(iframe);
            window.setTimeout(() => finish(false), 2500);
        });
    }

    function clearStoredDepartmentHandoff(packageId = latestHandoffPackage?.packageId) {
        if (typeof window === 'undefined') return;

        try {
            window.localStorage.removeItem(DEPARTMENT_HANDOFF_KEY);
            window.localStorage.setItem(`${DEPARTMENT_HANDOFF_KEY}:recall`, JSON.stringify({
                packageId,
                regionCode,
                recalledAt: new Date().toISOString()
            }));
        } catch {
            // Ignore storage permission issues in demo environments.
        }
        try {
            window.sessionStorage.removeItem(DEPARTMENT_HANDOFF_KEY);
        } catch {
            // Ignore storage permission issues in demo environments.
        }
        try {
            const namedPayload = JSON.parse(window.name || '{}');
            if (namedPayload?.type === DEPARTMENT_HANDOFF_KEY || namedPayload?.schemaVersion === 'priority-management-handoff/v1') window.name = '';
        } catch {
            // Window name may contain non-JSON data from another page.
        }
    }

    async function recallDepartmentHandoff(packageRecord = latestHandoffPackage) {
        const recalledPackageId = packageRecord?.packageId;
        clearStoredDepartmentHandoff(recalledPackageId);
        const [relayOk, supabaseOk] = await Promise.all([
            relayRecallToLeadDepartment(recalledPackageId),
            markPlatformHandoffStatus('priority_to_lead', {
                regionCode,
                packageId: recalledPackageId,
                status: 'recalled'
            })
        ]);
        sentHandoffPackages = recalledPackageId
            ? sentHandoffPackages.filter((item) => item.packageId !== recalledPackageId)
            : [];
        latestHandoffPackage = sentHandoffPackages[0] || null;
        requestListOpen = Boolean(sentHandoffPackages.length && requestListOpen);
        handoffDialog = null;
        handoffMessage = recalledPackageId
            ? (relayOk || supabaseOk)
                ? `검토 요청 ${recalledPackageId}을 회수했습니다. 주관부서 화면에서도 요청이 비워집니다.`
                : `검토 요청 ${recalledPackageId}을 회수했습니다. 주관부서 화면이 열려 있으면 새로고침해 주세요.`
            : '저장된 검토 요청을 비웠습니다. 필요하면 다시 전달하세요.';
        schedulePriorityDraftSave();
    }

    async function recallAllDepartmentHandoffs() {
        clearStoredDepartmentHandoff(null);
        const [relayOk, supabaseOk] = await Promise.all([
            relayRecallToLeadDepartment(null),
            markPlatformHandoffStatus('priority_to_lead', {
                regionCode,
                status: 'recalled'
            })
        ]);
        sentHandoffPackages = [];
        latestHandoffPackage = null;
        requestListOpen = false;
        handoffDialog = null;
        handoffMessage = (relayOk || supabaseOk)
            ? '주관부서 지원도구에 남아 있는 검토 요청을 모두 비웠습니다.'
            : '로컬 요청 이력을 비웠습니다. 주관부서 화면이 열려 있으면 새로고침해 주세요.';
        schedulePriorityDraftSave();
    }

    function resetActiveAlternative() {
        const nextMessage = '현재 대안의 Risk 분석 결과와 실천권역을 초기화했습니다. 지표 설정을 확인한 뒤 다시 실행하세요.';

        analysisResult = null;
        appliedIndicators = [];
        analysisDone = false;
        analysisMessage = nextMessage;
        parcelCandidateMessage = 'Risk 분석 후 지도에서 실천권역도출하기를 실행하세요.';
        selectedCandidate = 0;
        detailCandidateKey = null;
        focusedCandidate = null;
        mapResetKey += 1;
        activeLayer = 'Risk';
        activeStep = Math.min(activeStep, 2);

        persistAlternative(activeAlternative, {
            id: `alternative-${Date.now()}-${activeAlternative}`,
            status: '검토중'
        });
        handoffMessage = latestHandoffPackage
            ? '현재 대안을 초기화했습니다. 이미 전달한 요청은 필요하면 별도로 회수하세요.'
            : '현재 대안을 초기화했습니다. Risk 분석 후 다시 전달할 수 있습니다.';
        schedulePriorityDraftSave();
    }

    function resetAllAlternatives() {
        handoffDialog = null;
        activeAlternative = 0;
        const baseAlternative = {
            ...createDefaultAlternative(0),
            settings: {
                gridUnit,
                dimensionWeights: { ...dimensionWeights },
                indicators: cloneIndicatorsForAlternative(indicators)
            },
            analysisMessage: '전체 대안을 초기화했습니다. 지표 설정을 확인한 뒤 Risk 분석을 다시 실행하세요.'
        };
        alternatives = [baseAlternative];
        loadAlternative(0);
        if (sentHandoffPackages.length || latestHandoffPackage) {
            void recallAllDepartmentHandoffs();
        } else {
            clearStoredDepartmentHandoff(null);
        }
        sentHandoffPackages = [];
        latestHandoffPackage = null;
        requestListOpen = false;
        handoffMessage = '전체 대안과 로컬 검토 요청 상태를 초기화했습니다. 새 대안을 구성한 뒤 다시 전달할 수 있습니다.';
        schedulePriorityDraftSave();
    }

    async function handoffToDepartmentPlatform(scope = 'all') {
        const activeSnapshot = {
            ...alternatives[activeAlternative],
            ...currentAlternativeState()
        };
        const sourceAlternatives = alternatives.map((alternative, index) => (
            index === activeAlternative ? activeSnapshot : alternative
        ));
        alternatives = sourceAlternatives;
        const scopedAlternatives = scope === 'current' ? [activeSnapshot] : sourceAlternatives;
        const payload = buildDepartmentHandoffPayload(scopedAlternatives);
        if (!payload.candidates.length) {
            handoffMessage = '전달할 실천권역이 없습니다. Risk 분석 후 실천권역도출하기를 먼저 실행하세요.';
            return;
        }

        const deliveredAt = new Date().toISOString();
        const deliveredPayload = {
            ...payload,
            deliveredToLeadAt: deliveredAt,
            deliveryStatus: 'sent-to-lead',
            reviewNote: handoffNote.trim()
        };
        const handoffJson = JSON.stringify(deliveredPayload);
        try {
            window.localStorage.setItem(DEPARTMENT_HANDOFF_KEY, handoffJson);
        } catch {
            window.sessionStorage.setItem(DEPARTMENT_HANDOFF_KEY, handoffJson);
        }
        window.name = JSON.stringify({
            type: DEPARTMENT_HANDOFF_KEY,
            payload: deliveredPayload
        });
        const [relayOk, inboxOk] = await Promise.all([
            relayHandoffToLeadDepartment(deliveredPayload),
            saveHandoffToLocalInbox(deliveredPayload)
        ]);
        const deliveryOk = relayOk || inboxOk;
        const deliveredAlternativeCount = deliveredPayload.alternatives.filter((alternative) => alternative.candidates?.length).length;
        const packageRecord = {
            packageId: deliveredPayload.packageId,
            deliveredAt,
            alternativeCount: deliveredAlternativeCount,
            candidateCount: deliveredPayload.candidates.length,
            region: deliveredPayload.region,
            hazardLabel: deliveredPayload.hazardLabel,
            relayOk: deliveryOk
        };
        rememberHandoffPackage(packageRecord);
        handoffMessage = deliveryOk
            ? `${deliveredAlternativeCount}개 대안 · ${deliveredPayload.candidates.length}개 후보를 주관부서 지원도구 검토 요청으로 전달했습니다.`
            : `${deliveredAlternativeCount}개 대안 · ${deliveredPayload.candidates.length}개 후보를 로컬에 저장했습니다. 주관부서 페이지가 열려 있지 않으면 새로고침 후 확인하세요.`;
        handoffDialog = {
            alternativeCount: deliveredAlternativeCount,
            candidateCount: deliveredPayload.candidates.length,
            region: deliveredPayload.region,
            hazardLabel: deliveredPayload.hazardLabel,
            deliveredAt,
            packageId: deliveredPayload.packageId,
            relayOk: deliveryOk
        };
        schedulePriorityDraftSave();
    }

    function openHandoffReview() {
        handoffScope = 'all';
        handoffReviewOpen = true;
    }

    function closeHandoffReview() {
        handoffReviewOpen = false;
    }

    function confirmHandoffReview() {
        handoffReviewOpen = false;
        void handoffToDepartmentPlatform(handoffScope);
        handoffNote = '';
    }

    let userIndicatorLibrary = [];
    let userIndicatorLibraryError = '';
    let userIndicatorLibraryLoading = false;

    async function refreshUserIndicatorLibrary() {
        if (!userIndicatorLibraryEnabled) return;
        userIndicatorLibraryLoading = true;
        userIndicatorLibraryError = '';
        try { userIndicatorLibrary = await listUserIndicators(regionCode); }
        catch (error) { userIndicatorLibraryError = error.message; }
        finally { userIndicatorLibraryLoading = false; }
    }

    function attachUserIndicator(item) {
        if (indicators.some(value => value.id === item.id)) throw new Error('현재 대안에 이미 연결된 지표입니다.');
        indicators = [...indicators, item];
        loadedPreviewIndicators = [...loadedPreviewIndicators, item];
        indicatorPreviewGrid = createIndicatorPreviewGrid(loadedPreviewIndicators);
        activeLayer = item.dimension;
        markAnalysisDirty(`${item.label} 지표를 현재 대안에 연결했습니다.`);
    }

    async function attachSavedUserIndicator(id) {
        if (!indicatorDialog || indicatorDialog.processing) return;
        indicatorDialog = {...indicatorDialog, processing:true, error:''};
        try {
            const record = await readUserIndicator(id);
            if (record.regionCode !== regionCode) throw new Error('현재 지역과 지표의 지역이 다릅니다.');
            attachUserIndicator(connectUserIndicator(record, indicatorGroupMeta));
            indicatorDialog = null;
        } catch (error) { indicatorDialog = {...indicatorDialog, processing:false, error:error.message}; }
    }

    function detachUserIndicator(id) {
        indicators = indicators.filter(item => item.id !== id);
        loadedPreviewIndicators = loadedPreviewIndicators.filter(item => item.id !== id);
        indicatorPreviewGrid = createIndicatorPreviewGrid(loadedPreviewIndicators);
        markAnalysisDirty('현재 대안에서 지표 연결을 해제했습니다. 보관된 지표는 유지됩니다.');
    }

    function openIndicatorDialog() {
        indicatorDialog = {
            label: '시연용 생활인구 밀도',
            description: `${region} 행정구역에 맞춘 사용자 정의 100m 격자`,
            group: '노출',
            weight: 1,
            color: indicatorGroupMeta['노출'].color,
            dataMode: 'geotiff',
            pattern: 'urban-core',
            fileName: '',
            uploadedValues: null,
            uploadedMeta: null,
            processing: false,
            error: ''
        };
        void refreshUserIndicatorLibrary();
    }

    function closeIndicatorDialog() {
        if (indicatorDialog?.processing) return;
        indicatorDialog = null;
    }

    function updateIndicatorDialogGroup(group) {
        indicatorDialog = {
            ...indicatorDialog,
            group,
            color: indicatorGroupMeta[group].color,
            error: ''
        };
    }







    async function readIndicatorGridFile(event) {
        const file = event.currentTarget.files?.[0];
        if (!file) return;
        try {
            if (file.size > 64 * 1024 * 1024) throw new Error('JSON은 64MB 이하 파일을 사용하세요.');
            const payload = JSON.parse(await file.text());
            const values = normalizeUploadedValues(Array.isArray(payload) ? payload : payload?.values, indicatorPreviewGrid);
            indicatorDialog = { ...indicatorDialog, fileName: file.name, uploadedValues: values, error: '' };
        } catch (error) {
            indicatorDialog = { ...indicatorDialog, fileName: file.name, uploadedValues: null, error: error.message || 'JSON 파일을 읽지 못했습니다.' };
        }
    }



    async function readIndicatorGeoTiff(event) {
        const file = event.currentTarget.files?.[0];
        if (!file) return;
        if (file.size > 250 * 1024 * 1024) {
            indicatorDialog = { ...indicatorDialog, fileName: file.name, uploadedValues: null, uploadedMeta: null, error: '현재 브라우저 업로드는 250MB 이하 GeoTIFF를 지원합니다.' };
            return;
        }
        indicatorDialog = { ...indicatorDialog, fileName: file.name, uploadedValues: null, uploadedMeta: null, processing: true, error: '' };
        try {
            const referenceGrid = indicatorPreviewGrid;
            if (!referenceGrid?.values?.length) throw new Error('기준 100m 격자가 아직 준비되지 않았습니다. 지역 데이터를 불러온 뒤 다시 시도하세요.');
            const { default: parseGeoraster } = await import('georaster');
            proj4.defs('EPSG:5179', '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs');
            proj4.defs('EPSG:5186', '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs');
            const raster = await parseGeoraster(await file.arrayBuffer());
            const sourceProjection = normalizeProjection(raster.projection);
            if (!sourceProjection) throw new Error('GeoTIFF 좌표계 정보를 찾지 못했습니다. EPSG 코드가 포함된 파일을 사용해 주세요.');
            if (sourceProjection !== 'EPSG:5179' || Math.abs(raster.pixelWidth) !== 100 || Math.abs(raster.pixelHeight) !== 100 || (raster.numberOfRasters || raster.values?.length) !== 1) throw new Error('EPSG:5179 · 100m · 단일 밴드로 전처리한 GeoTIFF를 사용하세요.');
            const aligned = value => Math.abs(value - Math.round(value)) < 1e-6;
            if (!aligned((raster.xmin - 745900) / 100) || !aligned((raster.ymax - 2068600) / 100)) throw new Error('전국 기준 격자에 정렬된 GeoTIFF를 사용하세요.');
            const sourceBand = raster.values?.[0];
            if (!sourceBand?.length || !raster.width || !raster.height) throw new Error('첫 번째 밴드의 래스터 값을 읽지 못했습니다.');
            const targetProjection = referenceGrid.crs || 'EPSG:5179';
            const sameProjection = normalizeProjection(targetProjection) === sourceProjection;
            const noDataValue = raster.noDataValue;
            const rawValues = Array.from(referenceGrid.values, (maskValue, index) => {
                if (maskValue == null || !Number.isFinite(Number(maskValue))) return null;
                const column = index % referenceGrid.columns;
                const row = Math.floor(index / referenceGrid.columns);
                const targetX = referenceGrid.transform.originX + ((column + 0.5) * referenceGrid.transform.pixelWidth);
                const targetY = referenceGrid.transform.originY - ((row + 0.5) * referenceGrid.transform.pixelHeight);
                const [sourceX, sourceY] = sameProjection
                    ? [targetX, targetY]
                    : proj4(targetProjection, sourceProjection, [targetX, targetY]);
                const sourceColumn = Math.floor((sourceX - raster.xmin) / raster.pixelWidth);
                const sourceRow = Math.floor((raster.ymax - sourceY) / raster.pixelHeight);
                if (sourceColumn < 0 || sourceRow < 0 || sourceColumn >= raster.width || sourceRow >= raster.height) return null;
                const value = Number(sourceBand[sourceRow]?.[sourceColumn]);
                if (!Number.isFinite(value) || (noDataValue !== undefined && noDataValue !== null && value === Number(noDataValue))) return null;
                return value;
            });
            const validCount = rawValues.filter(Number.isFinite).length;
            if (!validCount) throw new Error(`업로드 파일이 ${region} 기준 격자와 겹치지 않습니다. 좌표계와 위치를 확인해 주세요.`);
            const values = normalizeUploadedValues(rawValues, referenceGrid);
            indicatorDialog = {
                ...indicatorDialog,
                fileName: file.name,
                uploadedValues: values,
                uploadedMeta: {
                    sourceProjection,
                    targetProjection,
                    sourceSize: `${raster.width.toLocaleString()} × ${raster.height.toLocaleString()}`,
                    validCount,
                    bandCount: raster.numberOfRasters || raster.values.length
                },
                processing: false,
                error: ''
            };
        } catch (error) {
            indicatorDialog = { ...indicatorDialog, uploadedValues: null, uploadedMeta: null, processing: false, error: error.message || 'GeoTIFF 파일을 읽지 못했습니다.' };
        }
    }



    async function addIndicator() {
        if (!indicatorDialog || !indicatorPreviewGrid) return;
        const meta = indicatorGroupMeta[indicatorDialog.group];
        const gridValues = ['json', 'geotiff'].includes(indicatorDialog.dataMode)
            ? indicatorDialog.uploadedValues
            : createDemoIndicatorValues(indicatorDialog.pattern, indicatorPreviewGrid);
        if (!gridValues) {
            indicatorDialog = { ...indicatorDialog, error: '먼저 사용할 격자 데이터를 준비해 주세요.' };
            return;
        }
        const item = {
            id: `custom-${Date.now()}`,
            icon: meta.icon,
            label: indicatorDialog.label.trim(),
            description: indicatorDialog.description.trim() || `${region} 사용자 정의 지표`,
            dimension: meta.dimension,
            group: indicatorDialog.group,
            weight: Math.max(0.1, Number(indicatorDialog.weight) || 1),
            direction: meta.direction,
            enabled: true,
            dataStatus: 'available',
            sourceType: indicatorDialog.dataMode === 'geotiff' ? 'user-geotiff-100m' : indicatorDialog.dataMode === 'json' ? 'user-json-100m' : 'demo-grid-100m',
            sourceLabel: ['json', 'geotiff'].includes(indicatorDialog.dataMode) ? indicatorDialog.fileName : '임시 시연 데이터',
            sourceMeta: indicatorDialog.uploadedMeta,
            supportedGridUnits: ['100m'],
            value: summarizeCustomValues(gridValues),
            color: indicatorDialog.color,
            gridValues,
            gridMeta: {
                gridUnit: indicatorPreviewGrid.gridUnit,
                columns: indicatorPreviewGrid.columns,
                rows: indicatorPreviewGrid.rows,
                extent: indicatorPreviewGrid.extent,
                transform: indicatorPreviewGrid.transform,
                crs: indicatorPreviewGrid.crs
            },
            regionCode,
            custom: true
        };
        indicatorDialog = {...indicatorDialog, processing:true, error:''};
        try {
            const record = await saveUserIndicator(item);
            const linked = connectUserIndicator(record, indicatorGroupMeta, item.weight);
            attachUserIndicator({...linked, gridValues:item.gridValues});
            indicatorDialog = null;
        } catch (error) { indicatorDialog = {...indicatorDialog, processing:false, error:error.message}; }
    }

    function addAlternative() {
        activeComparisonId = null;
        persistAlternative(activeAlternative);
        const nextIndex = alternatives.length;
        const nextOptionNumber = alternatives.reduce((largestNumber, alternative) => {
            const matchedNumber = String(alternative?.name || '').match(/대안\s*(\d+)/);
            const optionNumber = matchedNumber ? Number(matchedNumber[1]) : 0;
            return Math.max(largestNumber, optionNumber);
        }, 0) + 1;
        const nextAlternative = {
            name: `대안 ${nextOptionNumber}`,
            status: '검토중',
            description: '새 기후적응실천권역 대안',
            id: `alternative-${Date.now()}`,
            alternativeId: createResultId('alternative'),
            settings: {
                gridUnit,
                dimensionWeights: { ...dimensionWeights },
                indicators: cloneIndicatorsForAlternative(indicators.filter(item => !item.custom))
            },
            analysisResult: null,
            appliedIndicators: [],
            analysisDone: false,
            analysisMessage: '새 대안이 추가되었습니다. 설정을 확인한 뒤 Risk 분석을 실행하세요.',
            parcelCandidateMessage: 'Risk 분석 후 지도에서 실천권역도출하기를 실행하세요.',
            selectedCandidate: 0,
            detailCandidateKey: null,
            activeLayer: 'Risk'
        };
        alternatives = [
            ...alternatives,
            nextAlternative
        ];
        activeAlternative = nextIndex;
        loadAlternative(nextIndex);
        schedulePriorityDraftSave();
    }

    function deleteAlternativeAt(index) {
        if (alternatives.length <= 1) {
            analysisRunId += 1;
            running = false;
            alternatives = [];
            activeAlternative = 0;
            analysisResult = null;
            appliedIndicators = [];
            analysisDone = false;
            focusedCandidate = null;
            activeLayer = 'Risk';
            activeStep = 0;
            handoffMessage = '대안을 삭제했습니다. 상단의 +플러스 버튼을 눌러 새 대안 탭을 만들어 주세요.';
            schedulePriorityDraftSave();
            return;
        }

        const deletedAlternative = alternatives[index];
        const wasActive = index === activeAlternative;
        const nextAlternatives = alternatives.filter((_, alternativeIndex) => alternativeIndex !== index);
        const nextIndex = wasActive
            ? Math.min(index, nextAlternatives.length - 1)
            : index < activeAlternative
                ? activeAlternative - 1
                : activeAlternative;
        alternatives = nextAlternatives;
        activeAlternative = nextIndex;
        if (wasActive) loadAlternative(nextIndex);
        handoffMessage = latestHandoffPackage
            ? `${deletedAlternative?.name || '선택 대안'}을 삭제했습니다. 이미 전달한 요청은 필요하면 별도로 회수하세요.`
            : `${deletedAlternative?.name || '선택 대안'}을 삭제했습니다.`;
        schedulePriorityDraftSave();
    }

    function requestDeleteAlternative(index) {
        if (!alternatives[index]) return;
        pendingDeleteIndex = index;
    }

    function cancelDeleteAlternative() {
        pendingDeleteIndex = null;
    }

    function confirmDeleteAlternative() {
        if (pendingDeleteIndex === null) return;
        deleteAlternativeAt(pendingDeleteIndex);
        pendingDeleteIndex = null;
    }

    function confirmAlternative() {
        persistAlternative(activeAlternative);
        alternatives = alternatives.map((alternative, index) => ({
            ...alternative,
            status: index === activeAlternative ? '선정' : alternative.status === '선정' ? '검토완료' : alternative.status
        }));
        activeStep = 5;
        schedulePriorityDraftSave();
    }

    async function setActiveGridLayer(layer) {
        activeLayer = layer;
        persistAlternative(activeAlternative, { activeLayer: layer });
        schedulePriorityDraftSave();

        if (analysisDone || !['H', 'E', 'V'].includes(layer)) return;
        const groups = layer === 'H'
            ? ['기후위험']
            : layer === 'E'
                ? ['노출']
                : ['민감도', '적응역량'];
        const targets = indicators.filter((item) => item.enabled && groups.includes(item.group));
        const loaded = await loadIndicatorInputs(
            targets.map((item) => ({ ...item })),
            loadedPreviewIndicators,
            { preferDense: true }
        );
        const loadedById = new Map(loadedPreviewIndicators.map((item) => [item.id, item]));
        loaded.forEach((item) => loadedById.set(item.id, item));
        loadedPreviewIndicators = [...loadedById.values()];
        indicatorPreviewGrid = createIndicatorPreviewGrid(loadedPreviewIndicators);
    }

    function downloadConfig() {
        persistAlternative(activeAlternative);
        const payload = {
            projectName,
            region,
            regionCode,
            hazard,
            gridUnit,
            formula: 'Weighted geometric mean of H/E/V',
            commonDataItems: config.commonDataItems,
            dataBundle,
            dimensionWeights,
            indicators,
            analysisResult,
            alternatives,
            resultIndex: buildResultIndex(alternatives),
            decidedAlternative
        };
        const blob = new Blob([JSON.stringify(payload, analysisJsonReplacer, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'indicator_config.json';
        link.click();
        URL.revokeObjectURL(url);
    }
</script>

<svelte:head>
    <title>Climate Risk Lab | {config.label} H/E/V 위험평가</title>
    <meta name="description" content={config.label + ' H/E/V 기반 기후위험 평가 및 의사결정 지원 도구'} />
</svelte:head>

<div class="app-shell">
    <header class="topbar">
        <div class="brand">
            <div class="brand-mark">CR</div>
            <div>
                <strong>Climate Risk Lab</strong>
                <span>기후위험(H)·노출(E)·취약성(V) 기반 우선 대응지 선정</span>
            </div>
        </div>
        <div class="project-meta">
            <div class="project-breadcrumb" aria-label={`프로젝트 ${projectName}`}>
                <span class="project-breadcrumb-eyebrow">프로젝트</span>
                <span class="project-breadcrumb-path">
                    {#each projectBreadcrumb as part, index}
                        {#if index > 0}<span class="project-breadcrumb-sep" aria-hidden="true">/</span>{/if}
                        <span class="project-breadcrumb-part">{part}</span>
                    {/each}
                </span>
            </div>
            <a class="ghost-link" href={nationalLab ? portalToolsUrl : `${base}/priority-management-area?regionCode=${encodeURIComponent(regionCode)}`}>{nationalLab ? '지원도구 페이지로 돌아가기' : '부문선택으로 돌아가기'}<svg class="ghost-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4.5 4 8.5l4 4" /><path d="M4 8.5h9a5.5 5.5 0 0 1 0 11H6" /></svg></a>
            <button class="ghost-button" onclick={downloadConfig}>설정 내보내기<svg class="ghost-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V7.5L14.5 3Z" /><path d="M14.5 3v3.5a1 1 0 0 0 1 1H19" /><path d="M12 17.5v-7M9.25 13.25 12 10.5l2.75 2.75" /></svg></button>
            <div class="request-manager">
                <button type="button" class="request-manager-toggle ghost-button" class:open={requestListOpen} aria-expanded={requestListOpen} onclick={() => requestListOpen = !requestListOpen}>보낸 요청 <span class="request-manager-count">{sentRequestCount}</span><span class="request-manager-caret" aria-hidden="true">{requestListOpen ? '▴' : '▾'}</span></button>
                {#if requestListOpen}
                    <div class="request-manager-panel">
                        <div><strong>보낸 검토 요청</strong><small>초기화 후에도 이 목록에서 요청을 취소할 수 있습니다.</small></div>
                        {#if sentHandoffPackages.length}
                            <ul>{#each sentHandoffPackages as request}<li><button type="button" class="request-recall-button" onclick={() => recallDepartmentHandoff(request)}>요청 취소</button><div><b>{request.hazardLabel || config.label} · {request.region || region}</b><span>{request.alternativeCount || 0}개 대안 · {request.candidateCount || 0}개 후보 · {formatHandoffTime(request.deliveredAt)}</span><small>{request.packageId}</small></div></li>{/each}</ul>
                            <button type="button" class="request-clear-all" onclick={recallAllDepartmentHandoffs}>전체 요청 취소</button>
                        {:else}
                            <p>현재 도구에 기록된 요청은 없습니다.</p>
                            <button type="button" class="request-clear-all" onclick={recallAllDepartmentHandoffs}>주관부서 요청 비우기</button>
                        {/if}
                    </div>
                {/if}
            </div>
            <div class="avatar" role="img" aria-label="관리">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.7 7.7 0 0 1 0 .255c-.008.379.137.75.43.991l1.004.828c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.5 6.5 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.5 6.5 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.241.437-.613.43-.992a6.9 6.9 0 0 1 0-.255c.007-.379-.138-.75-.43-.991l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z"></path>
                    <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"></path>
                </svg>
            </div>
        </div>
    </header>

    <div class="workspace">
        <main class="main">
            <section class="hero">
                <div class="hero-actions">
                    {#if nationalLab}
                        <label>시·도
                            <select value={selectedSido} onchange={(event) => setNationalSido(event.currentTarget.value)}>
                                {#each sidos as sido}
                                    <option value={sido}>{sido}</option>
                                {/each}
                            </select>
                        </label>
                        <label>시·군·구
                            <select value={regionCode} onchange={(event) => setNationalRegion(event.currentTarget.value)}>
                                {#each availableRegions as regionOption}
                                    <option value={regionOption.code}>{getSigunguLabel(regionOption)}</option>
                                {/each}
                            </select>
                        </label>
                        <label>선택 행정구역<input value={`${region} · ${regionCode}`} readonly /></label>
                        <small>{config.sampleNotice}</small>
                    {/if}
                </div>
            </section>

            {#if nationalLab}
                <section class="lab-analysis-runner" class:complete={analysisDone} aria-label="기후위험 실험실 분석 실행">
                    <div class="lab-analysis-runner-copy">
                        <span>기존 실천권역 분석 기능</span>
                        <strong>{region} · {hazardDatasetMode === 'observed' ? '2021~2025 최근 5년' : `${hazardScenario.toUpperCase()} ${hazardFuturePeriod}`}</strong>
                        <small>{analysisDone ? analysisMessage : 'H01~H11 기후위험 지표와 기존 노출·취약성·적응역량 지표를 결합해 Risk를 계산합니다.'}</small>
                    </div>
                    <div class="lab-analysis-flow" aria-label="분석 흐름">
                        <span class:active={!analysisDone}><b>1</b> Risk 분석</span>
                        <i aria-hidden="true">→</i>
                        <span class:active={analysisDone}><b>2</b> 실천권역 도출</span>
                        <i aria-hidden="true">→</i>
                        <span><b>3</b> 유형별 실천지구</span>
                    </div>
                    <button type="button" onclick={runAnalysis} disabled={running}>
                        {running ? 'Risk 계산 중...' : analysisDone ? 'Risk 다시 분석하기' : 'Risk 분석 실행'}
                    </button>
                </section>
            {/if}

            <section class="workspace-split">
                <div class="left-panel" inert={Boolean(activeComparison) || !alternatives.length} style:opacity={activeComparison || !alternatives.length ? '0.5' : '1'}>
                    <div class="left-panel-tabs" role="tablist" aria-label="좌측 패널 탭">
                        <span class="left-panel-tab-item" class:active={leftPanelTab === '01'}>
                            <button type="button" role="tab" class:active={leftPanelTab === '01'} aria-selected={leftPanelTab === '01'} onclick={() => (leftPanelTab = '01')}>01 분석 지표 선택</button>
                        </span>
                        <span class="left-panel-tab-item" class:active={leftPanelTab === '03'}>
                            <button type="button" role="tab" class:active={leftPanelTab === '03'} aria-selected={leftPanelTab === '03'} onclick={() => (leftPanelTab = '03')}>
                                03 실천권역 구성
                                {#if candidateList.length}<span class="tab-count">{candidateList.length}</span>{/if}
                            </button>
                            <span class="tab-info">
                                <button
                                    type="button"
                                    class="tab-info-toggle"
                                    class:active={candidatesInfoOpen}
                                    aria-expanded={candidatesInfoOpen}
                                    aria-label={`실천권역 구성 설명 ${candidatesInfoOpen ? '닫기' : '보기'}`}
                                    onclick={() => candidatesInfoOpen = !candidatesInfoOpen}
                                >ⓘ</button>
                                {#if candidatesInfoOpen}
                                    <div class="tab-info-popover" role="dialog" aria-label="실천권역 구성 설명">
                                        <div class="tab-info-popover-head">
                                            <span class="tab-info-chip">안내</span>
                                            <button type="button" class="tab-info-close" aria-label="설명 닫기" onclick={() => candidatesInfoOpen = false}>×</button>
                                        </div>
                                        <p>{analysisDone ? parcelCandidateMessage : 'Risk 분석 후 지도에서 실천권역도출하기를 실행하면 실천권역을 구성하는 유형별 실천지구가 표시됩니다.'}</p>
                                    </div>
                                {/if}
                            </span>
                        </span>
                    </div>
                    {#if leftPanelTab === '01'}
                    <div class="analysis-fixed-bar">
                        <div class="fixed-block fixed-block-options">
                            <span class="fixed-block-title">
                                <svg class="fixed-block-title-icon" viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6.5" />
                                    <path d="m8.4 11.8 3.3 3.4L19.6 6.6" />
                                </svg>
                                분석 옵션
                            </span>
                            <div class="analysis-fixed-selects">
                            <label>기후위험 기준기간
                                <select value={hazardDatasetMode} onchange={(event) => setHazardDatasetMode(event.currentTarget.value)}>
                                    <option value="observed">최근 5년 · 2021~2025</option>
                                    <option value="future" disabled={hazard !== 'heatwave'}>미래 시나리오 · 2026~2100</option>
                                </select>
                            </label>
                            {#if hazardDatasetMode === 'future'}
                                <label>SSP 시나리오
                                    <select value={hazardScenario} onchange={(event) => setHazardScenario(event.currentTarget.value)}>
                                        {#each hazardScenarios as scenario}
                                            <option value={scenario}>{scenario.toUpperCase()}</option>
                                        {/each}
                                    </select>
                                </label>
                                <label>미래 기간
                                    <select value={hazardFuturePeriod} onchange={(event) => setHazardFuturePeriod(event.currentTarget.value)}>
                                        {#each hazardFuturePeriods as period}
                                            <option value={period}>{period}</option>
                                        {/each}
                                    </select>
                                </label>
                            {/if}
                            </div>
                        </div>

                        <div class="fixed-block fixed-block-alternative">
                            <div class="fixed-row-alt">
                                <span class="fixed-row-alt-name" class:flash={alternativeFlash}>
                                    <svg class="fixed-row-alt-icon" viewBox="0 0 24 24" aria-hidden="true">
                                        <path d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.443a1.125 1.125 0 0 0-1.006 0L3.622 5.88C3.24 6.07 3 6.462 3 6.887V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                                    </svg>
                                    {alternatives[activeAlternative]?.name || '대안'}
                                </span>
                                <button class="outline-button" onclick={openIndicatorDialog}>+ 사용자 지표</button>
                            </div>
                            <div class="fixed-row-divider"></div>
                            <div class="analysis-fixed-summary">
                                <div class="fixed-summary-left">
                                    <div class="fixed-row-clear">
                                        <span class="fixed-row-label">현재 선택된 지표</span>
                                        <button type="button" class="clear-all-link" onclick={clearAllIndicators} disabled={!enabledCount}>모두 지우기</button>
                                    </div>
                                    <div class="hev-summary" aria-label="H E V 선택 지표 수">
                                        <span class="hev-cell hev-cell--h"><span class="hev-label">H</span><span class="hev-badge">{dimensionSelectedCounts.H}</span></span>
                                        <span class="hev-slash" aria-hidden="true">/</span>
                                        <span class="hev-cell hev-cell--e"><span class="hev-label">E</span><span class="hev-badge">{dimensionSelectedCounts.E}</span></span>
                                        <span class="hev-slash" aria-hidden="true">/</span>
                                        <span class="hev-cell hev-cell--v"><span class="hev-label">V</span><span class="hev-badge">{dimensionSelectedCounts.V}</span></span>
                                    </div>
                                </div>
                                <button class="cta run-analysis-button" onclick={runAnalysis} disabled={running || !alternatives.length}>
                                    <span class="run-analysis-label">{running ? '계산 중...' : 'Risk 분석 실행'}</span>
                                    <svg class="run-analysis-icon" viewBox="0 0 24 24" aria-hidden="true">
                                        <path d="M7 17 17 7M17 7H9M17 7v8" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <span class="analysis-status" role="status" aria-live="polite" data-analysis-message>{analysisMessage}</span>
                    </div>
                    {/if}
                    <div class="left-panel-body">
                    {#if leftPanelTab === '01'}
                    <div class="panel indicator-panel">
                    {#each ['기후위험', '노출', '민감도', '적응역량'] as group}
                        <div class="indicator-group" class:collapsed={!groupExpanded[group]}>
                            <button type="button" class="group-label" style={`--group-dim-color:${groupDimensionColorVar(group)}`} aria-expanded={groupExpanded[group]} onclick={() => toggleGroupExpanded(group)}>
                                <span class="group-chevron" aria-hidden="true">▾</span><span class="group-name">{group} ({indicatorGroupMeta[group].english})</span>
                                {#if !groupExpanded[group] && collapsedGroupSummary(group)}<span class="group-collapsed-summary">{collapsedGroupSummary(group)}</span>{/if}
                                <span class="group-count">{selectedIndicatorsFor(group).length}/{indicators.filter((item) => item.group === group && isIndicatorAvailable(item)).length} 사용</span>
                            </button>
                            {#if groupExpanded[group]}
                            {#each indicators.filter((item) => item.group === group) as item}
                                <div class="indicator-item" data-dimension={item.dimension} class:disabled={!item.enabled} class:unavailable={!isIndicatorAvailable(item)}>
                                    <input
                                        type="checkbox"
                                        checked={item.enabled}
                                        disabled={!isIndicatorAvailable(item)}
                                        onchange={(event) => setIndicatorEnabled(item.id, event.currentTarget.checked)}
                                    />
                                    <div class="indicator-icon" style={`--icon-color:${item.color}`}>
                                        {#if item.iconPath}<img src={item.iconPath} alt="" />{:else}{item.icon}{/if}
                                    </div>
                                    <div class="indicator-copy">
                                        <span class="indicator-name-row"><strong>{item.label}</strong><button type="button" class="info-toggle" class:active={expandedDescriptions[item.id]} aria-expanded={!!expandedDescriptions[item.id]} aria-label={`${item.label} 설명 ${expandedDescriptions[item.id] ? '닫기' : '보기'}`} onclick={() => toggleIndicatorDescription(item.id)}>ⓘ</button></span>
                                        <span class="indicator-description-wrap" class:open={expandedDescriptions[item.id]}><span>{indicatorStatusText(item)} · {item.description}</span></span>
                                    </div>
                                    {#if item.custom}<button type="button" class="info-toggle" aria-label={`${item.label} 연결 해제`} onclick={() => detachUserIndicator(item.id)}>×</button>{/if}
                                    <div class="dimension-tag" title={item.group === '적응역량' ? '값이 높을수록 위험도가 낮아집니다' : '값이 높을수록 위험도가 높아집니다'}>{item.dimension}{item.group === '적응역량' ? '-' : '+'}</div>
                                    <div class="weight">가중치<div class="weight-stepper"><button type="button" class="weight-stepper-btn" aria-label={`${item.label} 가중치 감소`} disabled={item.weight <= 0} onclick={() => adjustIndicatorWeight(item.id, -0.1)}>−</button><span class="weight-stepper-value">{Number(item.weight).toFixed(1)}</span><button type="button" class="weight-stepper-btn" aria-label={`${item.label} 가중치 증가`} disabled={item.weight >= 3} onclick={() => adjustIndicatorWeight(item.id, 0.1)}>+</button></div></div>
                                </div>
                            {/each}
                            {/if}
                        </div>
                    {/each}
                    </div>
                    {:else}
                    <section class="panel candidates wide-candidates">
                        {#if candidateList.length}
                            <div class="practice-type-note">
                                <strong>시연용 분류 v1</strong>
                                <span>공간 규모가 큰 권역은 계획행정수단, Risk 집중 권역은 시설지원사업, 소규모 생활권은 시민실천으로 임시 분류했습니다.</span>
                            </div>
                            <div class="practice-district-groups">
                                {#each practiceDistrictGroups as group}
                                    <section class="practice-district-group" style={`--practice-color:${group.color};--practice-fill:${group.fillColor}`}>
                                        <header>
                                            <i aria-hidden="true"></i>
                                            <span><strong>{group.label}</strong><small>{group.shortDescription}</small></span>
                                            <b>{group.candidates.length}개</b>
                                        </header>
                                        <div class="candidate-list">
                                            {#each group.candidates as candidate}
                                                {@const index = candidateList.findIndex((item) => candidateIdentity(item) === candidateIdentity(candidate))}
                                                <article class="candidate-card" class:active={selectedCandidate === index}>
                                                    <button class="candidate-main" type="button" onclick={() => selectCandidate(candidate, index)}>
                                                        <span class="rank">{String(candidate.districtNumber || candidate.rank).padStart(2, '0')}</span>
                                                        <span class="candidate-name-row"><strong>{candidate.name}</strong><small>{candidate.area}</small></span>
                                                        <b>{formatScore(candidate.risk)}</b>
                                                    </button>
                                                    <button class="candidate-detail-toggle" type="button" title="분류 사유 보기" aria-label={`${candidate.name} 분류 사유 보기`} onclick={() => showCandidateDetail(candidate, index)}>!</button>
                                                </article>
                                            {/each}
                                        </div>
                                    </section>
                                {/each}
                            </div>
                            {#if detailCandidateItem}
                                <aside class="candidate-detail-panel" aria-label="실천지구 분류 상세보기" style={`--practice-color:${detailCandidateItem.practiceTypeColor}`}>
                                    <div>
                                        <span>실천지구 분류 사유 · 시연용</span>
                                        <strong>{detailCandidateItem.name}</strong>
                                        <em>{detailCandidateItem.practiceTypeLabel}</em>
                                        <small>{detailCandidateItem.classificationReason}</small>
                                        <small class="classification-rule">적용 규칙: {detailCandidateItem.classificationRule}</small>
                                    </div>
                                    <dl>
                                        <div><dt>총 필지 면적</dt><dd>{candidateTotalAreaLabel(detailCandidateItem)}</dd></div>
                                        <div><dt>필지 수</dt><dd>{formatInteger(detailCandidateItem.parcelCount)}필지</dd></div>
                                        <div><dt>Risk</dt><dd>{formatScore(detailCandidateItem.risk)}</dd></div>
                                        <div><dt>H</dt><dd>{formatScore(detailCandidateItem.h)}</dd></div>
                                        <div><dt>E</dt><dd>{formatScore(detailCandidateItem.e)}</dd></div>
                                        <div><dt>V</dt><dd>{formatScore(detailCandidateItem.v)}</dd></div>
                                    </dl>
                                </aside>
                            {/if}
                        {:else}
                            <div class="empty-candidate-state">
                                <strong>실천권역 도출 대기</strong>
                                <span>Risk 분석과 실천권역 도출이 끝나면 실천권역을 구성하는 실제 핫스팟-필지 교차 실천지구가 3개 시연 유형으로 표시됩니다.</span>
                            </div>
                        {/if}
                    </section>
                    {/if}
                    </div>
                </div>

                <div class="right-map-column">
                    <div class="panel analysis-map-panel">
                        <div class="map-actions-band">
                                <div class="database-actions">
                                    <label>
                                        <span>작업자</span>
                                        <input bind:value={operatorName} placeholder="이름 또는 부서" aria-label="저장 기록에 남을 작업자 이름" title="저장할 때 기록에 남는 이름입니다" />
                                    </label>
                                    <button class="db-save-action" onclick={() => saveCurrentDraftToSupabase()} disabled={supabaseBusy || Boolean(activeComparison) || !alternatives.length} title={activeComparison ? '겹침 결과는 이 브라우저에 자동 보관됩니다. 파일 보관은 비교 결과 내려받기를 이용하세요.' : '현재 대안 저장'}>
                                        {supabaseBusy ? '처리 중' : '저장'}
                                    </button>
                                    <button class="db-load-action" onclick={toggleSupabaseHistory} disabled={supabaseBusy}>
                                        불러오기
                                    </button>
                                    <button class="db-load-action" onclick={() => openSavedDraftAction('manage')} disabled={supabaseBusy}>저장본 관리</button>
                                    <button class="db-load-action" onclick={() => openSavedDraftAction('compare')} disabled={supabaseBusy}>대안 겹침 비교</button>
                                    <span>{supabaseStatus}</span>
                                </div>
                                <span class="handoff-request-wrap map-actions-handoff">
                                    <button class="add-button handoff-request-button" onclick={openHandoffReview} disabled={!handoffCandidateCount || Boolean(activeComparison)}>
                                        <span class="handoff-request-label">주관부서 지원도구로 검토 요청</span>
                                        <svg class="handoff-request-icon" viewBox="0 0 24 24" aria-hidden="true">
                                            <path d="M7 17 17 7M17 7H9M17 7v8" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
                                        </svg>
                                    </button>
                                    <span class="handoff-request-tooltip" role="tooltip">{latestHandoffPackage ? '전달 완료' : handoffCandidateCount ? '전달 가능' : '실천권역 도출 후 요청 가능'}</span>
                                </span>
                        </div>
                        <div class="map-tabs-row">
                            <div class="alternative-tabs browser-tabs" aria-label="기후적응실천권역 대안">
                                {#each alternatives as alternative, index}
                                    <div class="browser-tab" class:active={!activeComparison && activeAlternative === index}>
                                        <button class="browser-tab-select" onclick={() => switchAlternative(index)}>
                                            <span class="browser-tab-label">
                                                <svg class="browser-tab-icon" viewBox="0 0 24 24" aria-hidden="true">
                                                    <path d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.443a1.125 1.125 0 0 0-1.006 0L3.622 5.88C3.24 6.07 3 6.462 3 6.887V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                                                </svg>
                                                <span class="browser-tab-name">{alternative.name}</span>
                                                {#if alternative.description}<span class="browser-tab-desc">{alternative.description}</span>{/if}
                                            </span>
                                            <small>{alternativeStatusLabel(alternative)}</small>
                                        </button>
                                        <button
                                            class="browser-tab-close"
                                            onclick={(event) => { event.stopPropagation(); requestDeleteAlternative(index); }}
                                            title="{alternative.name} 삭제"
                                            aria-label="{alternative.name} 삭제"
                                        >×</button>
                                    </div>
                                {/each}
                                {#each visibleComparisonTabs as comparison (comparison.id)}
                                    <div class="browser-tab overlap-result-tab" class:active={activeComparisonId === comparison.id}>
                                        <button class="browser-tab-select" onclick={() => activeComparisonId = comparison.id} aria-pressed={activeComparisonId === comparison.id}>
                                            <span class="browser-tab-label"><span class="browser-tab-name">{comparison.name}</span><span class="browser-tab-desc">{comparison.result.total}개 대안 중첩</span></span>
                                            <small>비교 결과</small>
                                        </button>
                                        <button class="browser-tab-close" onclick={() => closeComparisonTab(comparison.id)} aria-label={`${comparison.name} 탭 닫기`} title="탭 닫기 (원본 저장본은 유지)">×</button>
                                    </div>
                                {/each}
                                <button class="browser-tab-add" onclick={addAlternative} title="대안 추가" aria-label="대안 추가">+</button>
                            </div>
                        </div>
                        {#if pendingDeleteIndex !== null}
                            <div class="alt-delete-confirm-backdrop" onclick={cancelDeleteAlternative}>
                                <div class="alt-delete-confirm" role="dialog" aria-modal="true" aria-label="대안 삭제 확인" onclick={(event) => event.stopPropagation()}>
                                    <p>'{alternatives[pendingDeleteIndex]?.name}'을(를) 삭제하시겠습니까?<br />대안 데이터가 사라지며 되돌릴 수 없습니다.</p>
                                    <div class="alt-delete-confirm-actions">
                                        <button class="secondary-action" onclick={cancelDeleteAlternative}>취소</button>
                                        <button class="secondary-action danger" onclick={confirmDeleteAlternative}>삭제</button>
                                    </div>
                                </div>
                            </div>
                        {/if}
                        <div class="map-result-wrap">
                            {#if activeComparison}
                                <div class="overlap-result-workspace">
                                    <div class="overlap-result-heading"><div><strong>{activeComparison.name} · {region} · {config.label}</strong><p>{comparisonStorageMessage} · {new Date(activeComparison.createdAt).toLocaleString('ko-KR')}</p><p>저장 대안을 겹친 검토 결과입니다. 지표를 수정하려면 원래 대안 탭을 선택하세요.</p></div></div>
                                    {#key activeComparison.id}<AlternativeOverlap {regionCode} {hazard} standalone={true} initialResult={activeComparison.result} initialMinimum={activeComparison.minimum} onMinimumChange={(minimum) => updateComparisonMinimum(activeComparison.id, minimum)} />{/key}
                                </div>
                            {:else if !alternatives.length}
                                <div class="empty-alternative-start">
                                    <button class="empty-alternative-arrow" onclick={addAlternative} aria-label="첫 대안 탭 만들기">↖</button>
                                    <h2>상단의 +플러스 버튼을 눌러 대안 탭을 만들어 주세요.</h2>
                                    <p>{region} · {config.label} 분석을 새 대안에서 시작합니다.</p>
                                    <button class="secondary-action" onclick={toggleSupabaseHistory} disabled={supabaseBusy}>저장된 대안 불러오기</button>
                                </div>
                            {:else}
                            <SelectedRegionMap
                                bind:this={selectedRegionMap}
                                {regionCode}
                                regionName={region}
                                {hazard}
                                height="100%"
                                showCadastral={false}
                                analysisIndicators={analysisDone ? appliedIndicators : previewAnalysisIndicators}
                                riskGrid={analysisResult?.gridResult || indicatorPreviewGrid}
                                activeGridLayer={activeLayer}
                                onGridLayerChange={setActiveGridLayer}
                                showAnalysisLegend={true}
                                parcelCandidates={analysisResult?.parcelCandidates || []}
                                candidateContextKey={activeAlternativeId}
                                sourceRiskResultId={analysisResult?.riskResultId || ''}
                                {mapResetKey}
                                {focusedCandidate}
                                onParcelCandidatesChange={handleParcelCandidates}
                                onParcelCandidateFocus={handleMapParcelCandidateFocus}
                                onParcelDerivationComplete={handleParcelDerivationComplete}
                            />
                            {/if}
                        </div>
                    </div>
                </div>
            </section>

        </main>
    </div>
</div>

{#if indicatorDialog}
    <div class="indicator-modal-backdrop" role="presentation" onclick={(event) => event.target === event.currentTarget && closeIndicatorDialog()}>
        <section class="indicator-modal" role="dialog" aria-modal="true" aria-labelledby="indicator-modal-title">
            <header>
                <div>
                    <span>CUSTOM INDICATOR</span>
                    <h2 id="indicator-modal-title">새 분석 지표 추가</h2>
                    <p>{region} · 행정구역 코드 {regionCode} · 현재 100m 기준 격자</p>
                </div>
                <button type="button" class="indicator-modal-close" aria-label="닫기" onclick={closeIndicatorDialog}>×</button>
            </header>

            {#if !userIndicatorLibraryEnabled}
                <div class="indicator-data-box">
                    <p>사용자 지표 등록·연결은 개발 사이트에서 이용할 수 있습니다.</p>
                    <p>이 사이트에서는 저장된 대안의 결과를 불러오고, 함께 저장된 지표 값으로 다시 분석할 수 있습니다.</p>
                </div>
                <footer><button type="button" class="indicator-cancel-button" onclick={closeIndicatorDialog}>닫기</button></footer>
            {:else}
            <div class="indicator-modal-grid">
                <div class="indicator-wide-field indicator-library">
                    <strong>보관된 사용자 지표</strong>
                    <p>이 개발 서버에 보관된 {region} 지표입니다. 현재 대안에만 연결합니다.</p>
                    <button type="button" onclick={refreshUserIndicatorLibrary} disabled={userIndicatorLibraryLoading}>목록 새로고침</button>
                    {#if userIndicatorLibraryError}<p class="indicator-modal-error">{userIndicatorLibraryError}</p>{/if}
                    {#if userIndicatorLibraryLoading}<p>지표 목록을 불러오는 중입니다.</p>{/if}
                    <div class="indicator-library-list">
                    {#each userIndicatorLibrary as stored}
                        <div class="indicator-library-row">
                            <span>{stored.label} · {stored.group}</span>
                            <button type="button" onclick={() => attachSavedUserIndicator(stored.id)} disabled={indicatorDialog.processing || indicators.some(item => item.id === stored.id)}>{indicators.some(item => item.id === stored.id) ? '연결됨' : '현재 대안에 연결'}</button>
                        </div>
                    {/each}
                    </div>
                    {#if !userIndicatorLibraryLoading && !userIndicatorLibraryError && !userIndicatorLibrary.length}<p>보관된 사용자 지표가 없습니다.</p>{/if}
                </div>
                <label class="indicator-wide-field">지표 이름
                    <input bind:value={indicatorDialog.label} placeholder="예: 취약계층 이용시설 밀도" />
                </label>
                <label class="indicator-wide-field">설명
                    <textarea bind:value={indicatorDialog.description} rows="2" placeholder="지표의 의미와 출처를 적어주세요."></textarea>
                </label>
                <label>리스크 구성요소
                    <select value={indicatorDialog.group} onchange={(event) => updateIndicatorDialogGroup(event.currentTarget.value)}>
                        {#each Object.keys(indicatorGroupMeta) as group}
                            <option value={group}>{group} ({indicatorGroupMeta[group].english})</option>
                        {/each}
                    </select>
                </label>
                <label>분석 가중치
                    <input type="number" min="0.1" max="10" step="0.1" bind:value={indicatorDialog.weight} />
                </label>
                <label>범례 색상
                    <input class="indicator-color-input" type="color" bind:value={indicatorDialog.color} />
                </label>
                <label>데이터 입력 방식
                    <select bind:value={indicatorDialog.dataMode} onchange={() => indicatorDialog = { ...indicatorDialog, error: '' }}>
                        <option value="geotiff">GeoTIFF 실제 레이어</option>
                        <option value="demo">임시 데이터로 시연</option>
                        <option value="json">100m 격자 JSON</option>
                    </select>
                </label>
            </div>

            <div class="indicator-data-box">
                {#if indicatorDialog.dataMode === 'demo'}
                    <div class="indicator-data-heading">
                        <div><strong>임시 공간 패턴</strong><span>현재 {region} 경계 안에서 바로 시각화됩니다.</span></div>
                        <span class="indicator-demo-badge">DEMO</span>
                    </div>
                    <div class="indicator-pattern-grid">
                        {#each [
                            ['urban-core', '도심 집중', '중심부가 높고 외곽으로 감소'],
                            ['southwest', '남서부 집중', '남서 생활권에 높은 값 배치'],
                            ['corridor', '축·회랑형', '대각선 교통축을 따라 분포'],
                            ['distributed', '분산형', '여러 생활권에 불규칙 분포']
                        ] as pattern}
                            <button type="button" class:active={indicatorDialog.pattern === pattern[0]} onclick={() => indicatorDialog = { ...indicatorDialog, pattern: pattern[0] }}>
                                <strong>{pattern[1]}</strong><span>{pattern[2]}</span>
                            </button>
                        {/each}
                    </div>
                {:else if indicatorDialog.dataMode === 'geotiff'}
                    <div class="indicator-data-heading">
                        <div><strong>GeoTIFF 실제 레이어 업로드</strong><span>전처리된 격자에서 현재 {region}의 값을 읽습니다.</span></div>
                        <span class:ready={Boolean(indicatorDialog.uploadedValues)} class="indicator-demo-badge">{indicatorDialog.processing ? 'READING' : indicatorDialog.uploadedValues ? 'READY' : 'TIF'}</span>
                    </div>
                    <label class="indicator-file-drop">
                        <input type="file" accept=".tif,.tiff,image/tiff,image/geotiff" onchange={readIndicatorGeoTiff} disabled={indicatorDialog.processing} />
                        <strong>{indicatorDialog.processing ? 'GeoTIFF 기준과 지역 격자를 확인하는 중…' : indicatorDialog.fileName || 'TIF / TIFF 파일 선택'}</strong>
                        <span>EPSG:5179 · 100m · 단일 밴드 · 전국 기준 격자 정렬 · 최대 250MB</span>
                    </label>
                    {#if indicatorDialog.uploadedMeta}
                        <div class="indicator-file-meta">
                            <span>원본 {indicatorDialog.uploadedMeta.sourceProjection}</span>
                            <span>{indicatorDialog.uploadedMeta.sourceSize}px</span>
                            <span>밴드 {indicatorDialog.uploadedMeta.bandCount}개</span>
                            <span>{region} 유효 셀 {indicatorDialog.uploadedMeta.validCount.toLocaleString()}개</span>
                        </div>
                    {/if}
                {:else}
                    <div class="indicator-data-heading">
                        <div><strong>100m 격자 JSON 업로드</strong><span>숫자 배열 또는 <code>{`{ "values": [...] }`}</code> 형식을 지원합니다.</span></div>
                        <span class:ready={Boolean(indicatorDialog.uploadedValues)} class="indicator-demo-badge">{indicatorDialog.uploadedValues ? 'READY' : 'JSON'}</span>
                    </div>
                    <label class="indicator-file-drop">
                        <input type="file" accept=".json,application/json" onchange={readIndicatorGridFile} />
                        <strong>{indicatorDialog.fileName || 'JSON 파일 선택'}</strong>
                        <span>현재 기준 격자와 같은 {indicatorPreviewGrid?.values?.length?.toLocaleString() || 0}개 값이 필요합니다.</span>
                    </label>
                {/if}
                {#if indicatorDialog.error}<p class="indicator-modal-error">{indicatorDialog.error}</p>{/if}
            </div>

            <div class="indicator-effect-summary">
                <span style={`--indicator-color:${indicatorDialog.color}`}></span>
                <div>
                    <strong>{indicatorDialog.group} ({indicatorGroupMeta[indicatorDialog.group].english}) · {indicatorGroupMeta[indicatorDialog.group].dimension}</strong>
                    <p>{indicatorDialog.group === '적응역량' ? '값이 높을수록 취약성(V)을 낮추는 방향으로 계산합니다.' : '값이 높을수록 해당 구성요소의 위험 점수를 높이는 방향으로 계산합니다.'}</p>
                </div>
            </div>

            <footer>
                <button type="button" class="indicator-cancel-button" onclick={closeIndicatorDialog}>취소</button>
                <button type="button" class="indicator-submit-button" onclick={addIndicator} disabled={!indicatorPreviewGrid || !indicatorDialog.label.trim() || indicatorDialog.processing || (['json', 'geotiff'].includes(indicatorDialog.dataMode) && !indicatorDialog.uploadedValues)}>
                    {indicatorDialog.processing ? '저장 중…' : '보관 후 현재 대안에 연결'}
                </button>
            </footer>
            {/if}
        </section>
    </div>
{/if}

{#if supabaseSaveDialog}
    <div class="save-progress-modal-backdrop" role="presentation">
        <div class="save-progress-modal" role="dialog" aria-modal="true" aria-labelledby="save-progress-title">
            <span class:running={supabaseSaveDialog.state === 'saving'} class:success={supabaseSaveDialog.state === 'success'} class:error={supabaseSaveDialog.state === 'error'} class="save-progress-mark">
                {supabaseSaveDialog.state === 'saving' ? '' : supabaseSaveDialog.state === 'success' ? '✓' : '!'}
            </span>
            <h2 id="save-progress-title">{supabaseSaveDialog.title}</h2>
            <p>{supabaseSaveDialog.message}</p>
            {#if supabaseSaveDialog.state === 'saving'}
                <div class="save-progress-bar"><i></i></div>
                <small>창을 닫지 말고 잠시 기다려 주세요.</small>
            {:else}
                {#if supabaseSaveDialog.conflict}
                    <button type="button" onclick={() => saveCurrentDraftToSupabase(true)}>내 작업을 별도 대안으로 저장</button>
                {/if}
                <button type="button" onclick={() => supabaseSaveDialog = null}>확인</button>
            {/if}
        </div>
    </div>
{/if}

{#if supabaseHistoryOpen}
    <div class="saved-draft-modal-backdrop" role="presentation" onclick={(event) => {
        if (event.currentTarget === event.target) supabaseHistoryOpen = false;
    }}>
        <div class="saved-draft-modal saved-draft-workspace" class:comparison-open={supabaseHistoryTab === 'compare'} role="dialog" aria-modal="true" aria-labelledby="saved-draft-modal-title">
            <header>
                <div>
                    <span>{supabaseHistoryTab === 'compare' ? 'ALTERNATIVE COMPARISON' : 'SAVED ALTERNATIVES'}</span>
                    <h2 id="saved-draft-modal-title">{supabaseHistoryTab === 'compare' ? '대안 겹침 비교' : supabaseHistoryTab === 'manage' ? '저장본 관리' : '저장본 불러오기'}</h2>
                    <p>{region} · {config.label} · {supabaseBusy ? '저장본 조회 중' : `저장본 ${supabaseDrafts.length}개`}</p>
                </div>
                <button type="button" class="saved-draft-close" aria-label={supabaseHistoryTab === 'compare' ? '대안 겹침 비교 닫기' : '불러오기 닫기'} onclick={() => supabaseHistoryOpen = false}>×</button>
            </header>
            <div class="saved-draft-content">
            {#if supabaseHistoryTab === 'compare'}
                {#if supabaseBusy}<p class="saved-draft-empty">저장 이력을 불러오는 중입니다.</p>{:else}
                    <div class="saved-draft-comparison">
                        {#key regionCode}<AlternativeOverlap rows={supabaseDrafts} {regionCode} {hazard} onOpenResult={openComparisonResult} />{/key}
                    </div>
                {/if}
            {:else}
            {#if supabaseHistoryTab === 'manage'}
                <div class="draft-management-toolbar">
                    <p>현재 지역·재해의 저장본입니다. 삭제하면 휴지통으로 이동하며 복원할 수 있습니다.</p>
                    <button type="button" onclick={toggleDraftTrash} disabled={supabaseBusy}>{showDeletedDrafts ? '저장본 목록 보기' : '휴지통 보기'}</button>
                </div>
                {#if draftManagement}
                    <form class="draft-management-editor" onsubmit={(event) => { event.preventDefault(); confirmDraftManagement(); }}>
                        <strong>{draftManagement.row.set_name}</strong>
                        {#if draftManagement.action === 'rename'}
                            <label>저장본 제목 <input aria-label="새 저장본 제목" bind:value={draftManagementName} maxlength="120" required /></label>
                        {:else}
                            <p>{draftManagement.action === 'delete' ? '이 저장본을 휴지통으로 이동할까요? 다른 수정 이력은 유지됩니다.' : '이 저장본을 복원할까요?'}</p>
                        {/if}
                        {#if draftManagementError}<p role="alert">{draftManagementError}</p>{/if}
                        <button type="submit" disabled={supabaseBusy}>{draftManagement.action === 'rename' ? '제목 저장' : draftManagement.action === 'delete' ? '휴지통으로 이동' : '복원 확인'}</button>
                        <button type="button" disabled={supabaseBusy} onclick={() => draftManagement = null}>취소</button>
                    </form>
                {/if}
            {/if}
            <div class="saved-draft-table-head" aria-hidden="true">
                <span>제목</span>
                <span>작성자</span>
                <span>날짜</span>
            </div>
            <div class="saved-draft-rows" aria-label="저장 이력">
                {#if supabaseBusy}
                    <p class="saved-draft-empty">저장 이력을 불러오는 중입니다.</p>
                {:else if supabaseDrafts.length}
                    {#each savedRegionGroups as group}
                        <h3 style="margin:16px 20px 8px;color:#165e4e">{group.name}</h3>
                        {#each group.regions as item}
                        <details open={savedRegionCount === 1} style="margin:8px 12px;border:1px solid #dce5e2;border-radius:8px">
                            <summary style="cursor:pointer;padding:12px;font-weight:600">{item.name} · 저장본 {item.rows.length}개 · 분석 대안 {item.analyzed}개 {item.code === regionCode ? '· 현재 지역' : ''}</summary>
                            {#each item.rows as savedDraft}
                        <button type="button" class="saved-draft-row" disabled={showDeletedDrafts} onclick={() => loadSupabaseDraft(savedDraft)}>
                            <span>
                                <strong>{savedDraft.set_name || savedDraft.analysis_version || '제목 없는 저장본'}</strong>
                                <small>{savedDraft.analysis_version || '버전 미기록'}</small>
                                {#if savedDraft.parent_id}<small>이전 저장본의 수정 이력 · {savedDraft.lineage_id?.slice(0, 8)}</small>{/if}
                                {#if item.code !== regionCode}<small>이 지역으로 이동하여 불러오기</small>{/if}
                            </span>
                            <span>{savedDraft.created_by_user || '작업자 미기록'}</span>
                            <time>{new Date(savedDraft.created_at).toLocaleString('ko-KR')}</time>
                        </button>
                        {#if supabaseHistoryTab === 'manage'}
                            <div class="draft-row-actions">
                                {#if showDeletedDrafts}
                                    <button type="button" onclick={() => openDraftManagement(savedDraft, 'restore')}>복원</button>
                                {:else}
                                    <button type="button" onclick={() => openDraftManagement(savedDraft, 'rename')}>이름 변경</button>
                                    <button type="button" onclick={() => openDraftManagement(savedDraft, 'delete')}>삭제</button>
                                {/if}
                            </div>
                        {/if}
                    {/each}
                        </details>
                        {/each}
                    {/each}
                {:else}
                    <p class="saved-draft-empty">{showDeletedDrafts ? '휴지통이 비어 있습니다.' : '불러올 저장본이 없습니다.'}</p>
                {/if}
            </div>
            {/if}
            </div>
            <footer>
                <span>{supabaseStatus}</span>
                <button type="button" onclick={refreshSupabaseDrafts} disabled={supabaseBusy}>
                    {supabaseBusy ? '조회 중' : '새로고침'}
                </button>
            </footer>
        </div>
    </div>
{/if}

{#if handoffReviewOpen}
    <div class="handoff-review-modal-backdrop" onclick={(event) => event.target === event.currentTarget && closeHandoffReview()}>
        <section class="handoff-review-modal" role="dialog" aria-modal="true" aria-labelledby="handoff-review-title">
            <header>
                <h2 id="handoff-review-title">주관부서 지원도구로 검토 요청</h2>
                <button type="button" class="handoff-review-close" onclick={closeHandoffReview} aria-label="닫기">×</button>
            </header>
            <div class="handoff-review-body">
                <div class="handoff-review-row">
                    <span>대상 지역·재해</span>
                    <strong>{region} · {config.label}</strong>
                    <small>행정구역 코드 {regionCode}</small>
                </div>
                <div class="handoff-review-row">
                    <span>분석 조건</span>
                    <strong>{hazardDatasetMode === 'observed' ? '최근 5년 · 2021~2025' : `${hazardScenario.toUpperCase()} · ${hazardFuturePeriod}`}</strong>
                    <small>{gridUnit} 격자 · 지표 {enabledCount}개 사용</small>
                </div>
                <fieldset class="handoff-review-scope">
                    <legend>전달 범위</legend>
                    <label>
                        <input type="radio" name="handoff-scope" value="current" checked={handoffScope === 'current'} onchange={() => (handoffScope = 'current')} />
                        현재 대안만 <small>({alternatives[activeAlternative]?.name} · 후보 {candidateList.length}개)</small>
                    </label>
                    <label>
                        <input type="radio" name="handoff-scope" value="all" checked={handoffScope === 'all'} onchange={() => (handoffScope = 'all')} />
                        전체 대안 <small>({handoffAlternativeCount}개 대안 · {handoffCandidateCount}개 후보)</small>
                    </label>
                </fieldset>
                <label class="handoff-review-note">
                    전달 메모 <span class="handoff-review-optional">(선택 사항)</span>
                    <textarea rows="2" placeholder="검토 담당자에게 전달할 메모를 입력하세요" value={handoffNote} oninput={(event) => (handoffNote = event.currentTarget.value)}></textarea>
                </label>
                <p class="handoff-review-note-text">선정 대안, 필지 후보와 분석 조건이 함께 기록됩니다.</p>
            </div>
            <footer>
                <button type="button" class="secondary-action" onclick={closeHandoffReview}>취소</button>
                <button type="button" class="decision-action" onclick={confirmHandoffReview} disabled={handoffScope === 'current' ? !candidateList.length : !handoffCandidateCount}>검토 요청</button>
            </footer>
        </section>
    </div>
{/if}

{#if handoffDialog}
    <div class="handoff-modal-backdrop" role="dialog" aria-modal="true" aria-label="주관부서 전달 완료">
        <section class="handoff-modal">
            <span class="handoff-modal-mark">완료</span>
            <h2>{handoffDialog.relayOk ? '주관부서 지원도구로 전달했습니다' : '전달 패키지를 저장했습니다'}</h2>
            <p>
                {#if handoffDialog.relayOk}
                    {handoffDialog.region} {handoffDialog.hazardLabel} 기후적응실천권역 검토 요청이 주관부서 인박스에 등록되었습니다.
                {:else}
                    {handoffDialog.region} {handoffDialog.hazardLabel} 기후적응실천권역 검토 요청을 현재 도구에 저장했습니다. 주관부서 페이지를 새로고침한 뒤 다시 전달해 주세요.
                {/if}
                이 화면은 그대로 유지됩니다.
            </p>
            <dl>
                <div><dt>대안</dt><dd>{handoffDialog.alternativeCount}개</dd></div>
                <div><dt>후보지</dt><dd>{handoffDialog.candidateCount}개</dd></div>
                <div><dt>패키지</dt><dd>{handoffDialog.packageId}</dd></div>
            </dl>
            <div class="handoff-modal-actions">
                <button type="button" class="secondary-modal-button" onclick={recallDepartmentHandoff}>요청 회수</button>
                <button type="button" onclick={() => handoffDialog = null}>확인</button>
            </div>
        </section>
    </div>
{/if}
