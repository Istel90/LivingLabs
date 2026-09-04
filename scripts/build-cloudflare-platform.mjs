import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

process.env.VITE_VWORLD_PROXY_URL ||= 'https://ehjygntjhqkddtcnvjdj.supabase.co/functions/v1/vworld-data';
process.env.VITE_ANALYSIS_API_URL ||= '';
process.env.VITE_SUPABASE_URL ||= 'https://ehjygntjhqkddtcnvjdj.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY ||= 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoanlnbnRqaHFrZGR0Y252amRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxOTI1MzUsImV4cCI6MjA5Nzc2ODUzNX0.FiVXQDoxivCu72eheahCaBLVmpfjikT7HLu4tvdrP9k';
const siteOrigin = (process.env.CLOUDFLARE_SITE_ORIGIN || 'https://livinglabs-platform.pages.dev').replace(/\/$/, '');
process.env.VITE_PORTAL_TOOLS_URL ||= `${siteOrigin}/tools#adaptation-support-tools`;
process.env.VITE_LEAD_DEPARTMENT_TOOL_URL ||= `${siteOrigin}/lead-department-tool`;

await import('./build-unified-platform.mjs');

const workspaceRoot = resolve(import.meta.dirname, '..');
const workerTemplate = readFileSync(join(workspaceRoot, 'cloudflare', 'postgis-proxy-worker.js'), 'utf8');
const workerSource = workerTemplate
  .replace('__POSTGIS_ORIGIN__', JSON.stringify((process.env.POSTGIS_TUNNEL_ORIGIN || '').replace(/\/$/, '')))
  .replace('__POSTGIS_TUNNEL_TOKEN__', JSON.stringify(process.env.POSTGIS_TUNNEL_TOKEN || ''));

writeFileSync(join(workspaceRoot, 'pages-dist', '_worker.js'), workerSource, 'utf8');
writeFileSync(join(workspaceRoot, 'pages-dist', '_routes.json'), `${JSON.stringify({
  version: 1,
  include: [
    '/cadastre/*',
    '/population/*',
    '/internal-tools/population/*',
    '/hazard-grid',
    '/flood-grid',
    '/analysis-grid',
  ],
  exclude: [],
}, null, 2)}\n`, 'utf8');
