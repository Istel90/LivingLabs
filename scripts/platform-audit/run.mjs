import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
export function validate(kind, status, type, body) {
  if (status !== 200) throw new Error(`HTTP ${status}`);
  if (kind === 'html') {
    if (!type.includes('text/html') || !/<html[\s>]/i.test(body)) throw new Error('Expected HTML page');
    return;
  }
  const value = JSON.parse(body);
  if (!value || typeof value !== 'object' || value.error || value.ok === false) throw new Error('Invalid/error JSON');
  if (kind === 'health' && (value.ok !== true || value.ready !== true)) throw new Error('Database not ready');
  if (kind === 'version' && !value.version) throw new Error('Missing build version');
  if (kind === 'json' && Object.keys(value).length === 0) throw new Error('Empty JSON');
}
export async function run() {
  const config = JSON.parse(await readFile(path.join(here, 'checks.json'), 'utf8'));
  const started = new Date();
  const output = path.join(root, 'output/platform-audit', started.toISOString().replace(/[:.]/g, '-'));
  await mkdir(output, { recursive: true });
  const report = { startedAt: started.toISOString(), packageVersion: '1.0.0', overall: 'INCOMPLETE', http: [], browser: [] };
  try { report.gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch { report.gitHead = null; }
  for (const [environment, origin] of Object.entries(config.origins)) {
    for (const check of config.http) {
      const row = { environment, id: check.id, url: origin + check.path, status: 'FAIL' };
      const begin = Date.now();
      try {
        const response = await fetch(row.url, { redirect: 'error', signal: AbortSignal.timeout(20000), headers: { 'Cache-Control': 'no-cache' } });
        row.httpStatus = response.status;
        const body = await response.text();
        validate(check.kind, response.status, response.headers.get('content-type') || '', body);
        if (check.kind === 'version') row.buildVersion = JSON.parse(body).version;
        row.status = 'PASS';
      } catch (error) { row.error = error.message; if (error.cause?.code) row.errorCode = error.cause.code; }
      row.durationMs = Date.now() - begin;
      report.http.push(row);
      console.log(`${environment} ${check.id}: ${row.status}${row.error ? ` (${row.error})` : ''}`);
    }
  }
  for (const environment of Object.keys(config.origins)) {
    for (const check of config.browser) report.browser.push({ environment, ...check, status: 'NOT_RUN', evidence: null });
  }
  report.finishedAt = new Date().toISOString();
  if (report.http.some(r => r.status === 'FAIL')) report.overall = 'FAIL';
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await writeFile(path.join(output, 'README.md'), `# Platform audit\n\nStarted: ${report.startedAt}\n\nOverall: ${report.overall}\n\nHTTP checks: ${report.http.filter(r => r.status === 'PASS').length}/${report.http.length}\n\nBrowser checks remain NOT_RUN until an agent executes the checklist and attaches evidence. HTTP success is not end-to-end success.\n`);
  console.log(`REPORT=${path.join(output, 'report.json')}`);
  process.exitCode = report.overall === 'FAIL' ? 1 : 0;
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run();
