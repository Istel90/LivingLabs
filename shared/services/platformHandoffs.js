const TABLE_NAME = 'platform_handoffs';

function normalizeSupabaseUrl(rawUrl) {
  if (!rawUrl) return '';
  return rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
}

function getEnvValue(key) {
  try {
    return import.meta?.env?.[key] || '';
  } catch {
    return '';
  }
}

export function getPlatformHandoffConfig() {
  const url = normalizeSupabaseUrl(getEnvValue('VITE_SUPABASE_URL'));
  const key = getEnvValue('VITE_SUPABASE_ANON_KEY') || getEnvValue('VITE_SUPABASE_PUBLISHABLE_KEY');
  return { url, key, enabled: Boolean(url && key) };
}

function restUrl(path, params = {}) {
  const { url } = getPlatformHandoffConfig();
  const endpoint = new URL(`${url}/rest/v1/${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') endpoint.searchParams.set(key, value);
  });
  return endpoint.toString();
}

function headers(extra = {}) {
  const { key } = getPlatformHandoffConfig();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

function pickRegionName(payload = {}) {
  return payload.region || payload.regionName || payload.selectedRegion || '';
}

function pickPackageId(payload = {}) {
  return payload.packageId || payload.id || `${payload.regionCode || 'region'}-${Date.now()}`;
}

export function platformHandoffRow(kind, payload = {}, status = 'requested') {
  return {
    kind,
    region_code: payload.regionCode || payload.selectedRegionCode || '',
    region_name: pickRegionName(payload),
    package_id: pickPackageId(payload),
    source_package_id: payload.sourcePackageId || payload.sourcePackageID || null,
    status,
    payload
  };
}

export async function savePlatformHandoff(kind, payload, status = 'requested') {
  const config = getPlatformHandoffConfig();
  if (!config.enabled || !payload) return false;

  try {
    const response = await fetch(restUrl(TABLE_NAME, { select: 'id,package_id,status' }), {
      method: 'POST',
      headers: headers({ Prefer: 'return=representation' }),
      body: JSON.stringify(platformHandoffRow(kind, payload, status))
    });
    return response.ok;
  } catch (error) {
    console.warn('[platformHandoffs] save failed', error);
    return false;
  }
}

export async function listPlatformHandoffs({ kind, regionCode, statuses, limit = 20 } = {}) {
  const config = getPlatformHandoffConfig();
  if (!config.enabled) return [];

  const params = {
    select: '*',
    order: 'updated_at.desc',
    limit: String(limit)
  };
  if (kind) params.kind = `eq.${kind}`;
  if (regionCode) params.region_code = `eq.${regionCode}`;
  if (Array.isArray(statuses) && statuses.length) params.status = `in.(${statuses.join(',')})`;

  try {
    const response = await fetch(restUrl(TABLE_NAME, params), {
      method: 'GET',
      headers: headers({ Accept: 'application/json' }),
      cache: 'no-store'
    });
    if (!response.ok) return [];
    const rows = await response.json();
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.warn('[platformHandoffs] list failed', error);
    return [];
  }
}

export async function getLatestPlatformHandoff(kind, regionCode, statuses = ['requested', 'reviewing', 'risk_done', 'sent', 'completed']) {
  const rows = await listPlatformHandoffs({ kind, regionCode, statuses, limit: 1 });
  return rows[0]?.payload || null;
}

export async function markPlatformHandoffStatus(kind, { regionCode, packageId, status = 'recalled' } = {}) {
  const config = getPlatformHandoffConfig();
  if (!config.enabled) return false;

  const params = { kind: `eq.${kind}` };
  if (regionCode) params.region_code = `eq.${regionCode}`;
  if (packageId) params.package_id = `eq.${packageId}`;

  try {
    const response = await fetch(restUrl(TABLE_NAME, params), {
      method: 'PATCH',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ status })
    });
    return response.ok;
  } catch (error) {
    console.warn('[platformHandoffs] status update failed', error);
    return false;
  }
}

export async function clearPlatformHandoffs() {
  const config = getPlatformHandoffConfig();
  if (!config.enabled) return false;

  try {
    const response = await fetch(restUrl(TABLE_NAME, { id: 'not.is.null' }), {
      method: 'DELETE',
      headers: headers({ Prefer: 'return=minimal' })
    });
    return response.ok;
  } catch (error) {
    console.warn('[platformHandoffs] clear failed', error);
    return false;
  }
}
