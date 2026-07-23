import { getPlatformHandoffConfig } from './platformHandoffs.js';

const AREA_SET_TABLE = 'priority_area_sets';
const REGION_TABLE = 'regions';

function endpoint(table, params = {}) {
  const { url } = getPlatformHandoffConfig();
  const target = new URL(`${url}/rest/v1/${table}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      target.searchParams.set(key, value);
    }
  });
  return target.toString();
}

function requestHeaders(extra = {}) {
  const { key } = getPlatformHandoffConfig();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

async function ensureRegion(regionCode, regionName) {
  const response = await fetch(endpoint(REGION_TABLE, {
    on_conflict: 'region_code'
  }), {
    method: 'POST',
    headers: requestHeaders({
      Prefer: 'resolution=merge-duplicates,return=minimal'
    }),
    body: JSON.stringify({
      region_code: regionCode,
      region_name: regionName,
      is_active: true,
      updated_at: new Date().toISOString()
    })
  });

  if (!response.ok) {
    throw new Error(`지역 기준정보 저장 실패 (${response.status})`);
  }
}

export async function listPriorityAreaDrafts({ regionCode, hazardType, limit = 30 }) {
  const { enabled } = getPlatformHandoffConfig();
  if (!enabled) return [];

  const params = {
    select: 'id,set_name,hazard_type,analysis_version,analysis_conditions,created_by_user,created_at,updated_at,status',
    region_code: `eq.${regionCode}`,
    hazard_type: `eq.${hazardType}`,
    status: 'eq.draft',
    order: 'created_at.desc',
    limit: String(limit)
  };
  const response = await fetch(endpoint(AREA_SET_TABLE, params), {
    headers: requestHeaders({ Accept: 'application/json' }),
    cache: 'no-store'
  });
  if (!response.ok) {
    throw new Error(`저장 이력 조회 실패 (${response.status})`);
  }
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

export async function savePriorityAreaDraft({
  regionCode,
  regionName,
  hazardType,
  projectName,
  actorUser,
  draftPayload
}) {
  const { enabled } = getPlatformHandoffConfig();
  if (!enabled) throw new Error('Supabase 연결 설정이 없습니다.');

  await ensureRegion(regionCode, regionName);
  const previous = await listPriorityAreaDrafts({ regionCode, hazardType, limit: 100 });
  const revision = previous.reduce((largest, row) => {
    const value = Number(String(row.analysis_version || '').replace(/^draft\//, ''));
    return Number.isFinite(value) ? Math.max(largest, value) : largest;
  }, 0) + 1;
  const savedAt = new Date().toISOString();
  const row = {
    region_code: regionCode,
    set_name: `${projectName || regionName} 저장본 ${revision}`,
    hazard_type: hazardType,
    scenario_name: projectName || null,
    analysis_version: `draft/${revision}`,
    analysis_conditions: {
      schema: 'priority-area-supabase-draft/v1',
      actorUser: actorUser || null,
      savedAt,
      draftPayload
    },
    status: 'draft',
    created_by_tool: 'priority_area_tool',
    created_by_user: actorUser || null,
    description: `${regionName} ${hazardType} 기후적응실천권역 작업 저장본`,
    is_demo: true,
    updated_at: savedAt
  };
  const response = await fetch(endpoint(AREA_SET_TABLE, {
    select: 'id,set_name,analysis_version,created_by_user,created_at,status'
  }), {
    method: 'POST',
    headers: requestHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(row)
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase 저장 실패 (${response.status}): ${message}`);
  }
  const savedRows = await response.json();
  return savedRows[0] || null;
}

export function draftPayloadFromRow(row) {
  return row?.analysis_conditions?.draftPayload || null;
}

export async function clearPriorityAreaDrafts() {
  const { enabled } = getPlatformHandoffConfig();
  if (!enabled) return false;

  try {
    const response = await fetch(endpoint(AREA_SET_TABLE, {
      status: 'eq.draft',
      is_demo: 'eq.true'
    }), {
      method: 'DELETE',
      headers: requestHeaders({ Prefer: 'return=minimal' })
    });
    return response.ok;
  } catch (error) {
    console.warn('[priorityAreaDrafts] clear failed', error);
    return false;
  }
}
