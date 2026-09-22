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

export async function listPriorityAreaDrafts({ regionCode, hazardType, limit = 30, offset = 0, draftId, deleted = false }) {
  const { enabled } = getPlatformHandoffConfig();
  if (!enabled) return [];

  const params = {
    select: '*',
    region_code: regionCode ? `eq.${regionCode}` : undefined,
    id: draftId ? `eq.${draftId}` : undefined,
    hazard_type: `eq.${hazardType}`,
    status: deleted ? 'in.(draft,archived)' : 'eq.draft',
    deleted_at: deleted ? undefined : 'is.null',
    or: deleted ? '(deleted_at.not.is.null,status.eq.archived)' : undefined,
    order: 'created_at.desc,id.desc',
    offset: String(offset),
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

export async function listRegionalPriorityAreaDrafts(hazardType, regionCode, deleted = false) {
  const rows = [];
  for (let offset = 0; ; offset += 100) {
    const page = await listPriorityAreaDrafts({ hazardType, regionCode, deleted, offset, limit: 100 });
    rows.push(...page);
    if (page.length < 100) return rows;
  }
}

export async function savePriorityAreaDraft({
  regionCode,
  regionName,
  hazardType,
  projectName,
  actorUser,
  draftPayload,
  parentId = null,
  requestId = crypto.randomUUID()
}) {
  const { enabled } = getPlatformHandoffConfig();
  if (!enabled) throw new Error('Supabase 연결 설정이 없습니다.');

  await ensureRegion(regionCode, regionName);
  const savedAt = new Date().toISOString();
  const row = {
    id: requestId,
    parent_id: parentId,
    region_code: regionCode,
    set_name: '',
    hazard_type: hazardType,
    scenario_name: projectName || null,
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
    on_conflict: 'id'
  }), {
    method: 'POST',
    headers: requestHeaders({ Prefer: 'resolution=ignore-duplicates,return=minimal' }),
    body: JSON.stringify(row)
  });
  if (!response.ok) {
    const error = new Error(response.status === 409
      ? '다른 곳에서 먼저 저장했거나 원본이 삭제되었습니다. 내 작업은 유지됩니다. 별도 대안으로 저장하거나 최신본을 불러오세요.'
      : `대안 저장에 실패했습니다 (${response.status}). 다시 저장하면 같은 요청을 재확인합니다.`);
    error.code = response.status === 409 ? 'DRAFT_CONFLICT' : 'DRAFT_SAVE_FAILED';
    throw error;
  }
  const confirmed = await fetch(endpoint(AREA_SET_TABLE, { id: `eq.${requestId}`, select: '*' }), {
    headers: requestHeaders(), cache: 'no-store'
  });
  if (!confirmed.ok) throw new Error('저장 결과를 확인하지 못했습니다. 다시 저장하면 같은 요청을 확인합니다.');
  const savedRows = await confirmed.json();
  if (!savedRows[0]) throw new Error('저장 결과가 없습니다. 다시 시도해 주세요.');
  if (savedRows[0].deleted_at) throw new Error('이 저장본은 다른 곳에서 삭제되었습니다. 불러오기 목록을 새로고침하세요.');
  return savedRows[0];
}

// Compare-and-swap: never silently overwrite another browser's rename/delete.
export async function managePriorityAreaDraft(row, action, name) {
  if (!Number.isInteger(row.management_version)) throw new Error('저장 관리 DB 업데이트가 필요합니다.');
  const title = String(name || '').trim();
  if (action === 'rename' && (!title || title.length > 120)) throw new Error('제목은 1~120자로 입력하세요.');
  if (!['rename', 'delete', 'restore'].includes(action)) throw new Error('지원하지 않는 관리 작업입니다.');
  const patch = action === 'rename' ? {set_name: title} : {deleted_at: action === 'delete' ? new Date().toISOString() : null};
  if (action === 'restore') patch.status = 'draft';
  const response = await fetch(endpoint(AREA_SET_TABLE, {
    id: `eq.${row.id}`, status: `eq.${row.status}`, management_version: `eq.${row.management_version}`,
    deleted_at: action === 'restore' && row.status === 'archived' ? undefined : action === 'restore' ? 'not.is.null' : 'is.null', select: '*'
  }), {method: 'PATCH', headers: requestHeaders({Prefer: 'return=representation'}), body: JSON.stringify(patch)});
  if (!response.ok) throw new Error(`저장본 관리에 실패했습니다 (${response.status}).`);
  const rows = await response.json();
  if (!rows.length) throw new Error('다른 곳에서 이 저장본을 변경했습니다. 새로고침 후 다시 확인하세요.');
  return rows[0];
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
