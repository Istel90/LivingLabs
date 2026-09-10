import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getPlatformHandoffConfig } from '../shared/services/platformHandoffs.js';
const destination = resolve(process.argv[2]);
mkdirSync(destination, { recursive: true });
const { url, key } = getPlatformHandoffConfig();
const rows = [];
for (let offset = 0; ; offset += 100) {
  const endpoint = new URL(`${url}/rest/v1/priority_area_sets`);
  endpoint.search = new URLSearchParams({ select: '*', status: 'eq.draft', order: 'created_at.asc,id.asc', limit: '100', offset: String(offset) });
  const response = await fetch(endpoint, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!response.ok) throw new Error(`Backup read failed: ${response.status}`);
  const page = await response.json();
  rows.push(...page);
  if (page.length < 100) break;
}
writeFileSync(resolve(destination, 'supabase-drafts.json'), JSON.stringify(rows));
console.log(JSON.stringify({ backup: destination, savedRows: rows.length, alternatives: rows.map(row => ({ region: row.region_code, hazard: row.hazard_type, version: row.analysis_version, alternatives: (row.analysis_conditions?.draftPayload?.alternatives || []).map(a => ({ name: a.name, grid: Boolean(a.analysisResult?.gridResult), parcels: a.analysisResult?.parcelCandidates?.length || 0 })) })) }, null, 2));
