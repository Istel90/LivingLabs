import { getPlatformHandoffConfig } from './platformHandoffs.js';

export const LIVINGLAB_TABLES = {
  regions: 'regions',
  priorityAreaSets: 'priority_area_sets',
  priorityAreaOptions: 'priority_area_options',
  parcelCandidates: 'parcel_candidates',
  candidateParcels: 'candidate_parcels',
  selectedPriorityAreas: 'selected_priority_areas',
  adaptationProjects: 'adaptation_projects',
  adaptationPlacements: 'adaptation_placements',
  projectReviewPackages: 'project_review_packages',
  projectReviewItems: 'project_review_items',
  handoffRequests: 'handoff_requests',
  reviewEvents: 'review_events',
  evaluationCriteriaSets: 'evaluation_criteria_sets',
  evaluationIndicators: 'evaluation_indicators',
  evaluationRuns: 'evaluation_runs',
  evaluationResults: 'evaluation_results'
};

const FILTER_OPERATORS = ['eq.', 'neq.', 'gt.', 'gte.', 'lt.', 'lte.', 'like.', 'ilike.', 'is.', 'in.', 'cs.', 'cd.', 'ov.'];

function workflowConfig() {
  return getPlatformHandoffConfig();
}

function restUrl(table, params = {}) {
  const { url } = workflowConfig();
  const endpoint = new URL(`${url}/rest/v1/${table}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') endpoint.searchParams.set(key, value);
  });
  return endpoint.toString();
}

function headers(extra = {}) {
  const { key } = workflowConfig();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

function encodeFilter(value) {
  if (Array.isArray(value)) return `in.(${value.join(',')})`;
  if (typeof value === 'string' && FILTER_OPERATORS.some((operator) => value.startsWith(operator))) return value;
  if (value === null) return 'is.null';
  return `eq.${value}`;
}

function queryParams({ select = '*', filters = {}, order, limit } = {}) {
  const params = { select };
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined) params[key] = encodeFilter(value);
  });
  if (order) params.order = order;
  if (limit) params.limit = String(limit);
  return params;
}

async function request(table, { method = 'GET', params, body, prefer, accept = 'application/json' } = {}) {
  const config = workflowConfig();
  if (!config.enabled) throw new Error('Supabase workflow config is missing');

  const response = await fetch(restUrl(table, params), {
    method,
    headers: headers({
      Accept: accept,
      ...(prefer ? { Prefer: prefer } : {})
    }),
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store'
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(`[${table}] ${response.status} ${response.statusText}${message ? `: ${message}` : ''}`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export async function selectRows(table, options = {}) {
  const data = await request(table, {
    params: queryParams(options)
  });
  return Array.isArray(data) ? data : [];
}

export async function insertRows(table, rows, { returning = 'representation' } = {}) {
  const payload = Array.isArray(rows) ? rows : [rows];
  const data = await request(table, {
    method: 'POST',
    params: { select: '*' },
    body: payload,
    prefer: `return=${returning}`
  });
  return Array.isArray(data) ? data : [];
}

export async function insertRow(table, row, options = {}) {
  const rows = await insertRows(table, row, options);
  return rows[0] ?? null;
}

export async function updateRows(table, filters, patch, { returning = 'representation' } = {}) {
  const data = await request(table, {
    method: 'PATCH',
    params: queryParams({ select: '*', filters }),
    body: patch,
    prefer: `return=${returning}`
  });
  return Array.isArray(data) ? data : [];
}

export async function deleteRows(table, filters) {
  await request(table, {
    method: 'DELETE',
    params: queryParams({ filters }),
    prefer: 'return=minimal'
  });
  return true;
}

export async function ensureRegion(region) {
  const regionCode = region.region_code || region.regionCode;
  if (!regionCode) throw new Error('region_code is required');
  const payload = {
    region_code: regionCode,
    region_name: region.region_name || region.regionName || region.name || regionCode,
    sido_name: region.sido_name || region.sidoName || null,
    sigungu_name: region.sigungu_name || region.sigunguName || null,
    default_center: region.default_center || region.defaultCenter || null,
    default_zoom: region.default_zoom || region.defaultZoom || null,
    vworld_admin_code: region.vworld_admin_code || region.vworldAdminCode || regionCode,
    is_active: region.is_active ?? true
  };

  const data = await request(LIVINGLAB_TABLES.regions, {
    method: 'POST',
    params: { on_conflict: 'region_code', select: '*' },
    body: payload,
    prefer: 'resolution=merge-duplicates,return=representation'
  });
  return Array.isArray(data) ? data[0] : data;
}

export async function createPriorityAreaSet(areaSet) {
  return insertRow(LIVINGLAB_TABLES.priorityAreaSets, {
    status: 'draft',
    created_by_tool: 'priority_area_tool',
    ...areaSet
  });
}

export async function createPriorityAreaOption(option) {
  return insertRow(LIVINGLAB_TABLES.priorityAreaOptions, {
    status: 'draft',
    geometry: option.geometry || {},
    ...option
  });
}

export async function createParcelCandidate(candidate) {
  return insertRow(LIVINGLAB_TABLES.parcelCandidates, {
    status: 'draft',
    geometry: candidate.geometry || {},
    ...candidate
  });
}

export async function createCandidateParcels(parcels) {
  if (!Array.isArray(parcels) || parcels.length === 0) return [];
  return insertRows(
    LIVINGLAB_TABLES.candidateParcels,
    parcels.map((parcel) => ({
      geometry: parcel.geometry || {},
      ...parcel
    }))
  );
}

export async function createPriorityAreaReviewRequest({ areaSetId, regionCode, title, memo, payloadSummary, createdByTool = 'priority_area_tool' }) {
  const requestRow = await insertRow(LIVINGLAB_TABLES.handoffRequests, {
    request_type: 'priority_area_review',
    from_tool: 'priority_area_tool',
    to_tool: 'lead_department_tool',
    region_code: regionCode,
    area_set_id: areaSetId,
    title,
    memo: memo || null,
    status: 'requested',
    payload_summary: payloadSummary || null,
    created_by_tool: createdByTool
  });

  if (requestRow?.id) {
    await addReviewEvent({
      handoff_id: requestRow.id,
      actor_tool: createdByTool,
      action: 'created_request',
      memo,
      payload_snapshot: payloadSummary || null
    });
  }

  return requestRow;
}

export async function listHandoffRequests({ toTool, fromTool, regionCode, requestType, statuses = ['requested', 'opened', 'in_review', 'returned'], limit = 20 } = {}) {
  const filters = {};
  if (toTool) filters.to_tool = toTool;
  if (fromTool) filters.from_tool = fromTool;
  if (regionCode) filters.region_code = regionCode;
  if (requestType) filters.request_type = requestType;
  if (statuses?.length) filters.status = statuses;

  return selectRows(LIVINGLAB_TABLES.handoffRequests, {
    filters,
    order: 'updated_at.desc.nullslast,created_at.desc',
    limit
  });
}

export async function openHandoffRequest(handoffId, actorTool) {
  const rows = await updateRows(
    LIVINGLAB_TABLES.handoffRequests,
    { id: handoffId },
    { status: 'opened', opened_at: new Date().toISOString() }
  );
  await addReviewEvent({
    handoff_id: handoffId,
    actor_tool: actorTool,
    action: 'opened_request'
  });
  return rows[0] ?? null;
}

export async function getPriorityAreaSetGraph(areaSetId) {
  const [sets, options] = await Promise.all([
    selectRows(LIVINGLAB_TABLES.priorityAreaSets, { filters: { id: areaSetId }, limit: 1 }),
    selectRows(LIVINGLAB_TABLES.priorityAreaOptions, { filters: { area_set_id: areaSetId }, order: 'option_no.asc' })
  ]);

  const optionIds = options.map((option) => option.id);
  const candidates = optionIds.length
    ? await selectRows(LIVINGLAB_TABLES.parcelCandidates, { filters: { option_id: optionIds }, order: 'rank.asc' })
    : [];
  const candidateIds = candidates.map((candidate) => candidate.id);
  const parcels = candidateIds.length
    ? await selectRows(LIVINGLAB_TABLES.candidateParcels, { filters: { parcel_candidate_id: candidateIds } })
    : [];

  return {
    areaSet: sets[0] ?? null,
    options,
    parcelCandidates: candidates,
    candidateParcels: parcels
  };
}

export async function selectPriorityArea({ areaSetId, optionId, regionCode, selectedName, selectionReason, memo, actorTool = 'lead_department_tool', actorRole }) {
  const selected = await insertRow(LIVINGLAB_TABLES.selectedPriorityAreas, {
    area_set_id: areaSetId,
    option_id: optionId,
    region_code: regionCode,
    selected_name: selectedName,
    selection_reason: selectionReason || null,
    memo: memo || null,
    selected_by_tool: actorTool,
    selected_by_role: actorRole || null,
    selection_status: 'selected'
  });

  await Promise.all([
    updateRows(LIVINGLAB_TABLES.priorityAreaOptions, { area_set_id: areaSetId }, { status: 'not_selected' }),
    updateRows(LIVINGLAB_TABLES.priorityAreaSets, { id: areaSetId }, { status: 'selected' })
  ]);
  await updateRows(LIVINGLAB_TABLES.priorityAreaOptions, { id: optionId }, { status: 'selected' });

  return selected;
}

export async function createAdaptationProject(project) {
  return insertRow(LIVINGLAB_TABLES.adaptationProjects, {
    status: 'draft',
    created_by_tool: 'lead_department_tool',
    ...project
  });
}

export async function createAdaptationPlacement(placement) {
  return insertRow(LIVINGLAB_TABLES.adaptationPlacements, {
    status: 'draft',
    version_no: 1,
    ...placement
  });
}

export async function createProjectReviewPackage({ packageRow, items = [], handoff }) {
  const handoffRow = await insertRow(LIVINGLAB_TABLES.handoffRequests, {
    request_type: 'project_review',
    from_tool: 'lead_department_tool',
    to_tool: 'responsible_department_tool',
    status: 'requested',
    created_by_tool: 'lead_department_tool',
    ...handoff
  });

  const reviewPackage = await insertRow(LIVINGLAB_TABLES.projectReviewPackages, {
    handoff_id: handoffRow.id,
    status: 'requested',
    from_tool: 'lead_department_tool',
    to_tool: 'responsible_department_tool',
    created_by_tool: 'lead_department_tool',
    ...packageRow
  });

  await updateRows(LIVINGLAB_TABLES.handoffRequests, { id: handoffRow.id }, { project_review_package_id: reviewPackage.id });

  const reviewItems = items.length
    ? await insertRows(
        LIVINGLAB_TABLES.projectReviewItems,
        items.map((item, index) => ({
          review_package_id: reviewPackage.id,
          item_order: item.item_order ?? index + 1,
          status: 'requested',
          ...item
        }))
      )
    : [];

  await addReviewEvent({
    handoff_id: handoffRow.id,
    project_review_package_id: reviewPackage.id,
    actor_tool: 'lead_department_tool',
    action: 'sent_to_responsible_department',
    payload_snapshot: {
      itemCount: reviewItems.length,
      selectedAreaId: reviewPackage.selected_area_id
    }
  });

  return { handoff: handoffRow, reviewPackage, reviewItems };
}

export async function createResponsibleRevisionReply({ parentHandoffId, reviewPackageId, regionCode, title, memo, payloadSummary }) {
  const reply = await insertRow(LIVINGLAB_TABLES.handoffRequests, {
    parent_handoff_id: parentHandoffId,
    request_type: 'revision_reply',
    from_tool: 'responsible_department_tool',
    to_tool: 'lead_department_tool',
    region_code: regionCode,
    project_review_package_id: reviewPackageId,
    title,
    memo: memo || null,
    status: 'returned',
    payload_summary: payloadSummary || null,
    created_by_tool: 'responsible_department_tool'
  });

  await addReviewEvent({
    handoff_id: reply.id,
    project_review_package_id: reviewPackageId,
    actor_tool: 'responsible_department_tool',
    action: 'returned_to_lead_department',
    memo,
    payload_snapshot: payloadSummary || null
  });

  return reply;
}

export async function addReviewEvent(event) {
  return insertRow(LIVINGLAB_TABLES.reviewEvents, event);
}

function numericValue(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function uuidOrNull(value) {
  if (typeof value !== 'string') return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function normalizeGeometryType(value) {
  return ['point', 'line', 'polygon', 'none'].includes(value) ? value : 'point';
}

function placementGeometry(placement = {}) {
  const points = Array.isArray(placement.points) ? placement.points : [];
  return {
    type: 'placement',
    points,
    source: placement.source || null
  };
}

function placementQuantity(project = {}, placement = {}) {
  if (Number.isFinite(Number(placement.measure))) return Number(placement.measure);
  const points = Array.isArray(placement.points) ? placement.points.length : 0;
  if (project.geometryType === 'point' || project.default_geometry_type === 'point') return points;
  return numericValue(placement.quantity, points);
}

function projectTargetUnit(project = {}) {
  if (project.unit) return project.unit;
  if (project.geometryType === 'line') return 'm';
  if (project.geometryType === 'polygon') return 'sqm';
  return 'count';
}

function candidateKey(candidate, index) {
  return String(candidate.id || candidate.name || candidate.rank || index + 1);
}

function candidateGeometry(candidate = {}) {
  const geometry = candidate.geometry && typeof candidate.geometry === 'object'
    ? candidate.geometry
    : {};
  return {
    ...geometry,
    center: geometry.center ?? candidate.center ?? null,
    bounds: geometry.bounds ?? candidate.bounds ?? null,
    features: Array.isArray(geometry.features)
      ? geometry.features
      : (Array.isArray(candidate.features) ? candidate.features : [])
  };
}

function graphCandidateToPayload(candidate, parcels = [], option = {}) {
  const pnuList = parcels.map((parcel) => parcel.pnu).filter(Boolean);
  const attributes = candidate.attributes || {};
  const geometry = candidate.geometry || {};
  const center = geometry.center || candidate.centroid || null;
  const bounds = geometry.bounds || null;
  const features = Array.isArray(geometry.features) ? geometry.features : [];
  const risk = numericValue(candidate.risk_score, attributes.risk, attributes.scores?.risk);
  const h = numericValue(candidate.h_score, attributes.h, attributes.scores?.h);
  const e = numericValue(candidate.e_score, attributes.e, attributes.scores?.e);
  const v = numericValue(candidate.v_score, attributes.v, attributes.scores?.v);

  return {
    id: candidate.id,
    sourceCandidateKey: attributes.sourceCandidateKey || candidate.id,
    alternativeId: option.id,
    alternativeName: option.option_name,
    rank: candidate.rank,
    name: candidate.candidate_name || `필지 후보 ${String(candidate.rank || 0).padStart(2, '0')}`,
    risk,
    h,
    e,
    v,
    score: risk,
    reason: attributes.reason || attributes.legacyCandidate?.reason || null,
    basis: attributes.basis || attributes.legacyCandidate?.basis || null,
    parcelCount: candidate.parcel_count ?? pnuList.length,
    hotspotCount: attributes.hotspotCount ?? attributes.legacyCandidate?.hotspotCount ?? null,
    totalAreaSqm: numericValue(candidate.area_m2, attributes.totalAreaSqm),
    totalAreaLabel: attributes.totalAreaLabel || null,
    pnuList,
    pnuTotal: pnuList.length,
    center,
    bounds,
    features,
    scores: { risk, h, e, v, score: risk },
    attributes: {
      ...attributes,
      pnuList,
      parcelCount: candidate.parcel_count ?? pnuList.length,
      featureTotal: attributes.featureTotal ?? features.length
    },
    geometry,
    geometryMode: attributes.geometryMode || 'compact'
  };
}

function graphToPriorityPayload({ areaSet, request, options, parcelCandidates, candidateParcels }) {
  if (!areaSet) return null;

  const parcelsByCandidate = new Map();
  candidateParcels.forEach((parcel) => {
    const key = parcel.parcel_candidate_id;
    if (!parcelsByCandidate.has(key)) parcelsByCandidate.set(key, []);
    parcelsByCandidate.get(key).push(parcel);
  });

  const candidatesByOption = new Map();
  parcelCandidates.forEach((candidate) => {
    const key = candidate.option_id;
    if (!candidatesByOption.has(key)) candidatesByOption.set(key, []);
    candidatesByOption.get(key).push(candidate);
  });

  const alternatives = options.map((option) => {
    const candidates = (candidatesByOption.get(option.id) || [])
      .sort((a, b) => (a.rank || 0) - (b.rank || 0))
      .map((candidate) => graphCandidateToPayload(candidate, parcelsByCandidate.get(candidate.id) || [], option));
    const riskValues = candidates.map((candidate) => Number(candidate.scores?.risk ?? candidate.risk)).filter(Number.isFinite);
    return {
      id: option.id,
      sourceAlternativeId: option.attributes?.sourceAlternativeId || option.id,
      name: option.option_name,
      status: option.status,
      description: option.summary,
      gridUnit: option.attributes?.gridUnit,
      analysisMessage: option.attributes?.analysisMessage,
      summary: {
        candidateCount: candidates.length,
        averageRisk: riskValues.length ? riskValues.reduce((sum, value) => sum + value, 0) / riskValues.length : null,
        maxRisk: riskValues.length ? Math.max(...riskValues) : null
      },
      candidates
    };
  });
  const candidates = alternatives.flatMap((alternative) => alternative.candidates);

  return {
    packageId: request?.id || areaSet.id,
    sourcePackageId: request?.payload_summary?.source_package_id || areaSet.source_job_id || null,
    workflowRequestId: request?.id || null,
    areaSetId: areaSet.id,
    schemaVersion: 'priority-management-handoff/v1',
    source: 'priority-management-area',
    target: 'lead-department-tool',
    createdAt: areaSet.created_at,
    deliveredToLeadAt: request?.created_at || areaSet.submitted_at || areaSet.created_at,
    deliveryStatus: 'sent-to-lead',
    projectName: areaSet.set_name,
    hazard: areaSet.hazard_type,
    hazardLabel: request?.payload_summary?.hazard_label || areaSet.analysis_conditions?.hazardLabel || areaSet.hazard_type,
    region: request?.payload_summary?.region_name || areaSet.analysis_conditions?.regionName || areaSet.region_code,
    regionCode: areaSet.region_code,
    formula: areaSet.analysis_conditions?.formula || null,
    dimensionWeights: areaSet.analysis_conditions?.dimensionWeights || null,
    commonDataItems: areaSet.analysis_conditions?.commonDataItems || [],
    alternatives,
    candidates,
    candidateBundle: {
      model: 'area_set > options > parcel_candidates > candidate_parcels',
      alternativeCount: alternatives.filter((alternative) => alternative.candidates.length).length,
      candidateCount: candidates.length
    }
  };
}

export async function savePriorityAreaHandoffPayload(payload) {
  if (!payload?.regionCode || !Array.isArray(payload.alternatives)) return null;

  await ensureRegion({
    region_code: payload.regionCode,
    region_name: payload.region || payload.regionName || payload.regionCode,
    sigungu_name: payload.region || payload.regionName || null
  });

  const areaSet = await createPriorityAreaSet({
    region_code: payload.regionCode,
    set_name: payload.projectName || `${payload.region || payload.regionCode} 중점관리구역 분석`,
    hazard_type: payload.hazard || payload.hazardLabel || 'unknown',
    scenario_name: payload.scenarioName || null,
    analysis_version: payload.schemaVersion || 'priority-management-handoff/v1',
    analysis_conditions: {
      formula: payload.formula || null,
      dimensionWeights: payload.dimensionWeights || null,
      commonDataItems: payload.commonDataItems || [],
      hazardLabel: payload.hazardLabel || null,
      regionName: payload.region || null
    },
    source_job_id: payload.packageId || null,
    status: 'requested',
    submitted_at: payload.deliveredToLeadAt || new Date().toISOString(),
    description: payload.candidateBundle?.model || null
  });
  if (!areaSet?.id) throw new Error('Failed to create priority_area_sets row');

  const savedOptions = [];
  const savedCandidates = [];
  const savedParcels = [];

  for (const [optionIndex, alternative] of payload.alternatives.entries()) {
    const candidates = Array.isArray(alternative.candidates) ? alternative.candidates : [];
    if (!candidates.length) continue;
    const riskValues = candidates.map((candidate) => Number(candidate.scores?.risk ?? candidate.risk)).filter(Number.isFinite);
    const option = await createPriorityAreaOption({
      area_set_id: areaSet.id,
      option_no: optionIndex + 1,
      option_name: alternative.name || `대안 ${optionIndex + 1}`,
      rank: optionIndex + 1,
      summary: alternative.description || alternative.analysisMessage || null,
      risk_score: numericValue(alternative.summary?.averageRisk, riskValues.length ? riskValues.reduce((sum, value) => sum + value, 0) / riskValues.length : null),
      hotspot_threshold: alternative.hotspotThreshold || null,
      geometry: alternative.geometry || {},
      attributes: {
        sourceAlternativeId: alternative.id || null,
        gridUnit: alternative.gridUnit || null,
        analysisMessage: alternative.analysisMessage || null,
        summary: alternative.summary || null
      },
      status: 'requested'
    });
    if (!option?.id) continue;
    savedOptions.push(option);

    for (const [candidateIndex, candidate] of candidates.entries()) {
      const rank = Number(candidate.rank || candidateIndex + 1);
      const pnuList = Array.from(new Set((Array.isArray(candidate.pnuList)
        ? candidate.pnuList
        : (Array.isArray(candidate.attributes?.pnuList) ? candidate.attributes.pnuList : []))
        .map((pnu) => String(pnu || '').trim())
        .filter(Boolean)));
      const parcelCandidate = await createParcelCandidate({
        option_id: option.id,
        rank,
        candidate_name: candidate.name || `필지 후보 ${String(rank).padStart(2, '0')}`,
        risk_score: numericValue(candidate.scores?.risk, candidate.risk, candidate.score),
        h_score: numericValue(candidate.scores?.h, candidate.h),
        e_score: numericValue(candidate.scores?.e, candidate.e),
        v_score: numericValue(candidate.scores?.v, candidate.v),
        area_m2: numericValue(candidate.totalAreaSqm, candidate.attributes?.totalAreaSqm),
        geometry: candidateGeometry(candidate),
        centroid: candidate.center || candidate.geometry?.center || null,
        parcel_count: numericValue(candidate.parcelCount, candidate.attributes?.parcelCount, pnuList.length),
        address_summary: candidate.area || candidate.attributes?.area || null,
        attributes: {
          ...candidate.attributes,
          sourceCandidateKey: candidateKey(candidate, candidateIndex),
          alternativeId: alternative.id || null,
          alternativeName: alternative.name || null,
          reason: candidate.reason || candidate.attributes?.reason || null,
          basis: candidate.basis || candidate.attributes?.basis || null,
          hotspotCount: candidate.hotspotCount ?? candidate.attributes?.hotspotCount ?? null,
          totalAreaLabel: candidate.totalAreaLabel || candidate.attributes?.totalAreaLabel || null,
          geometryMode: candidate.geometryMode || candidate.attributes?.geometryMode || 'compact'
        },
        status: 'requested'
      });
      if (!parcelCandidate?.id) continue;
      savedCandidates.push(parcelCandidate);

      const parcelRows = pnuList.map((pnu) => ({
        parcel_candidate_id: parcelCandidate.id,
        pnu: String(pnu),
        geometry: {},
        attributes: {
          sourceCandidateKey: candidateKey(candidate, candidateIndex),
          candidateRank: rank,
          candidateName: candidate.name || null
        },
        source: 'priority-management-handoff'
      }));
      const parcels = await createCandidateParcels(parcelRows);
      savedParcels.push(...parcels);
    }
  }

  const request = await createPriorityAreaReviewRequest({
    areaSetId: areaSet.id,
    regionCode: payload.regionCode,
    title: payload.projectName || `${payload.region || payload.regionCode} 중점관리구역 검토`,
    memo: `${savedOptions.length}개 대안 · ${savedCandidates.length}개 후보`,
    payloadSummary: {
      schema_version: 'priority-management-handoff/v1',
      source_package_id: payload.packageId || null,
      hazard_label: payload.hazardLabel || null,
      region_name: payload.region || null,
      option_count: savedOptions.length,
      candidate_count: savedCandidates.length,
      parcel_count: savedParcels.length,
      source_payload: {
        ...payload,
        workflowAreaSetId: areaSet.id
      }
    }
  });

  return { areaSet, options: savedOptions, parcelCandidates: savedCandidates, candidateParcels: savedParcels, request };
}

export async function getLatestPriorityAreaHandoffPayload(regionCode) {
  const requests = await listHandoffRequests({
    toTool: 'lead_department_tool',
    fromTool: 'priority_area_tool',
    regionCode,
    requestType: 'priority_area_review',
    statuses: ['requested', 'opened', 'in_review', 'returned'],
    limit: 1
  });
  const request = requests[0];
  if (!request?.area_set_id) return null;

  const sourcePayload = request.payload_summary?.source_payload;
  if (sourcePayload?.schemaVersion === 'priority-management-handoff/v1') {
    return {
      ...sourcePayload,
      packageId: request.id,
      sourcePackageId: sourcePayload.packageId,
      workflowRequestId: request.id,
      areaSetId: request.area_set_id,
      deliveredToLeadAt: request.created_at || sourcePayload.deliveredToLeadAt,
      deliveryStatus: 'sent-to-lead'
    };
  }

  const graph = await getPriorityAreaSetGraph(request.area_set_id);
  return graphToPriorityPayload({ ...graph, request });
}

async function saveLeadProjectsAndPlacements(payload, areaSetId) {
  const projects = Array.isArray(payload?.adaptationProjects) ? payload.adaptationProjects : [];
  const placements = Array.isArray(payload?.adaptationPlacements) ? payload.adaptationPlacements : [];
  if (!projects.length && !placements.length) return { projects: [], placements: [] };

  const projectMap = new Map(projects.map((project) => [project.id, project]));
  placements.forEach((placement) => {
    if (!projectMap.has(placement.projectId)) {
      projectMap.set(placement.projectId, {
        id: placement.projectId,
        title: placement.projectTitle || placement.item || 'Adaptation placement',
        part: payload.hazardLabel || payload.hazard || 'adaptation',
        item: placement.item || placement.projectTitle || 'placement',
        geometryType: placement.geometryType || 'point',
        goal: null
      });
    }
  });

  const savedProjects = [];
  const savedPlacements = [];
  const savedProjectBySourceId = new Map();

  for (const project of projectMap.values()) {
    const row = await createAdaptationProject({
      region_code: payload.regionCode,
      sector: project.part || project.sector || payload.hazardLabel || payload.hazard || 'adaptation',
      hazard_type: payload.hazard || payload.hazardLabel || 'unknown',
      project_type: project.item || project.projectType || 'adaptation_project',
      project_name: project.title || project.projectName || project.item || 'Adaptation project',
      description: project.description || null,
      default_geometry_type: normalizeGeometryType(project.geometryType || project.default_geometry_type),
      target_quantity: numericValue(project.goal, project.targetQuantity),
      target_unit: projectTargetUnit(project),
      effect_metric: project.effectMetric || null,
      default_effect_params: project.effectSpec || project.defaultEffectParams || {},
      status: 'active',
      created_by_tool: 'lead_department_tool'
    });
    if (row?.id) {
      savedProjects.push(row);
      savedProjectBySourceId.set(project.id, row);
    }
  }

  for (const placement of placements) {
    const sourceProject = projectMap.get(placement.projectId) || {};
    const project = savedProjectBySourceId.get(placement.projectId);
    if (!project?.id) continue;
    const row = await createAdaptationPlacement({
      project_id: project.id,
      area_set_id: areaSetId || null,
      geometry: placementGeometry(placement),
      geometry_type: normalizeGeometryType(placement.geometryType || sourceProject.geometryType),
      quantity: placementQuantity(sourceProject, placement),
      unit: projectTargetUnit(sourceProject),
      proposed_by_tool: 'lead_department_tool',
      status: 'sent_to_responsible',
      memo: placement.projectTitle || placement.item || null,
      effect_summary: placement.effectSummary || null
    });
    if (row?.id) savedPlacements.push(row);
  }

  return { projects: savedProjects, placements: savedPlacements };
}

export async function saveLeadToResponsibleHandoffPayload(payload) {
  if (!payload?.regionCode) return null;

  await ensureRegion({
    region_code: payload.regionCode,
    region_name: payload.region || payload.regionName || payload.regionCode,
    sigungu_name: payload.region || payload.regionName || null
  });

  const areaSetId = uuidOrNull(payload.areaSetId || payload.workflowAreaSetId);
  let savedProjects = [];
  let savedPlacements = [];
  try {
    const saved = await saveLeadProjectsAndPlacements(payload, areaSetId);
    savedProjects = saved.projects;
    savedPlacements = saved.placements;
  } catch (error) {
    console.warn('[livinglabWorkflowData] project placement mirror failed', error);
  }

  const alternatives = Array.isArray(payload.alternatives) ? payload.alternatives : [];
  const candidateCount = alternatives.reduce((sum, alternative) => (
    sum + (Array.isArray(alternative.candidates) ? alternative.candidates.length : 0)
  ), 0);
  const payloadSummary = {
    schema_version: 'lead-to-responsible-handoff/v1',
    source_package_id: payload.packageId || null,
    priority_workflow_request_id: uuidOrNull(payload.workflowRequestId) || null,
    area_set_id: areaSetId,
    alternative_count: alternatives.length,
    candidate_count: candidateCount,
    project_count: Array.isArray(payload.adaptationProjects) ? payload.adaptationProjects.length : 0,
    placement_count: Array.isArray(payload.adaptationPlacements) ? payload.adaptationPlacements.length : 0,
    mirrored_project_count: savedProjects.length,
    mirrored_placement_count: savedPlacements.length,
    source_payload: {
      ...payload,
      priorityWorkflowRequestId: payload.workflowRequestId || null,
      workflowAreaSetId: areaSetId,
      workflowProjectIds: savedProjects.map((project) => project.id),
      workflowPlacementIds: savedPlacements.map((placement) => placement.id)
    }
  };

  const handoff = await insertRow(LIVINGLAB_TABLES.handoffRequests, {
    request_type: 'project_review',
    from_tool: 'lead_department_tool',
    to_tool: 'responsible_department_tool',
    region_code: payload.regionCode,
    area_set_id: areaSetId,
    title: payload.projectName || `${payload.region || payload.regionCode} project review`,
    memo: `${alternatives.length} alternatives, ${candidateCount} candidates, ${payloadSummary.placement_count} placements`,
    status: 'requested',
    payload_summary: payloadSummary,
    created_by_tool: 'lead_department_tool'
  });

  if (handoff?.id) {
    await addReviewEvent({
      handoff_id: handoff.id,
      actor_tool: 'lead_department_tool',
      action: 'sent_to_responsible_department',
      payload_snapshot: payloadSummary
    });
  }

  return { handoff, projects: savedProjects, placements: savedPlacements };
}

export async function getLatestLeadToResponsibleHandoffPayload(regionCode) {
  const requests = await listHandoffRequests({
    toTool: 'responsible_department_tool',
    fromTool: 'lead_department_tool',
    regionCode,
    requestType: 'project_review',
    statuses: ['requested', 'opened', 'in_review', 'returned'],
    limit: 1
  });
  const request = requests[0];
  const sourcePayload = request?.payload_summary?.source_payload;
  if (sourcePayload?.schemaVersion !== 'lead-to-responsible-handoff/v1') return null;

  return {
    ...sourcePayload,
    packageId: request.id,
    sourcePackageId: sourcePayload.packageId,
    workflowRequestId: request.id,
    workflowLeadToResponsibleRequestId: request.id,
    priorityWorkflowRequestId: sourcePayload.priorityWorkflowRequestId || request.payload_summary?.priority_workflow_request_id || null,
    areaSetId: request.area_set_id || sourcePayload.areaSetId || sourcePayload.workflowAreaSetId || null,
    deliveredToResponsibleAt: request.created_at || sourcePayload.leadReviewedAt,
    deliveryStatus: 'sent-to-responsible'
  };
}

export async function saveResponsibleReviewResponsePayload(payload) {
  if (!payload?.regionCode) return null;

  await ensureRegion({
    region_code: payload.regionCode,
    region_name: payload.region || payload.regionName || payload.regionCode,
    sigungu_name: payload.region || payload.regionName || null
  });

  const summary = {
    schema_version: 'responsible-to-lead-review/v1',
    source_package_id: payload.packageId || null,
    original_package_id: payload.originalPackageId || null,
    project_count: Array.isArray(payload.responsibleProjects) ? payload.responsibleProjects.length : 0,
    placement_count: Array.isArray(payload.responsibleProjects)
      ? payload.responsibleProjects.reduce((sum, project) => sum + (Array.isArray(project.features) ? project.features.length : 0), 0)
      : 0,
    source_payload: payload
  };

  return createResponsibleRevisionReply({
    parentHandoffId: uuidOrNull(payload.originalWorkflowRequestId || payload.workflowLeadToResponsibleRequestId || payload.workflowRequestId),
    reviewPackageId: uuidOrNull(payload.workflowProjectReviewPackageId),
    regionCode: payload.regionCode,
    title: payload.projectName || `${payload.region || payload.regionCode} responsible review reply`,
    memo: `${summary.project_count} projects, ${summary.placement_count} placements`,
    payloadSummary: summary
  });
}

export async function getLatestResponsibleReviewResponsePayload(regionCode) {
  const requests = await listHandoffRequests({
    toTool: 'lead_department_tool',
    fromTool: 'responsible_department_tool',
    regionCode,
    requestType: 'revision_reply',
    statuses: ['returned', 'requested', 'opened', 'in_review'],
    limit: 1
  });
  const request = requests[0];
  const sourcePayload = request?.payload_summary?.source_payload;
  if (sourcePayload?.schemaVersion !== 'responsible-to-lead-review/v1') return null;

  return {
    ...sourcePayload,
    packageId: request.id,
    sourcePackageId: sourcePayload.packageId,
    workflowRequestId: request.id,
    returnedToLeadAt: request.created_at || sourcePayload.reviewedAt,
    reviewStatus: 'returned'
  };
}

export async function recallPriorityAreaReviewRequests({ regionCode, packageId } = {}) {
  const requests = await listHandoffRequests({
    toTool: 'lead_department_tool',
    fromTool: 'priority_area_tool',
    regionCode,
    requestType: 'priority_area_review',
    statuses: ['requested', 'opened', 'in_review', 'returned'],
    limit: 50
  });

  const targets = packageId
    ? requests.filter((request) => (
        request.id === packageId ||
        request.payload_summary?.source_package_id === packageId ||
        request.payload_summary?.source_payload?.packageId === packageId
      ))
    : requests;

  await Promise.all(targets.map((request) => (
    updateRows(
      LIVINGLAB_TABLES.handoffRequests,
      { id: request.id },
      { status: 'closed', resolved_at: new Date().toISOString() },
      { returning: 'minimal' }
    )
  )));

  return targets.length;
}

export async function clearDemoWorkflowData({ regionCode } = {}) {
  const filters = regionCode ? { region_code: regionCode, is_demo: true } : { is_demo: true };

  await deleteRows(LIVINGLAB_TABLES.evaluationResults, { id: 'not.is.null' });
  await deleteRows(LIVINGLAB_TABLES.evaluationRuns, { id: 'not.is.null' });
  await deleteRows(LIVINGLAB_TABLES.projectReviewItems, { id: 'not.is.null' });
  await deleteRows(LIVINGLAB_TABLES.reviewEvents, { id: 'not.is.null' });
  await deleteRows(LIVINGLAB_TABLES.handoffRequests, filters);
  await deleteRows(LIVINGLAB_TABLES.projectReviewPackages, filters);
  await deleteRows(LIVINGLAB_TABLES.adaptationPlacements, filters);
  await deleteRows(LIVINGLAB_TABLES.adaptationProjects, filters);
  await deleteRows(LIVINGLAB_TABLES.selectedPriorityAreas, regionCode ? { region_code: regionCode } : { id: 'not.is.null' });
  await deleteRows(LIVINGLAB_TABLES.priorityAreaSets, filters);
  return true;
}
