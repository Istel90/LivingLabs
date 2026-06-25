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
