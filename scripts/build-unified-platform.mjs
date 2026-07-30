import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const outputRoot = join(workspaceRoot, 'pages-dist');

function runBuild(label, cwd, extraEnv) {
  console.log(`\n[build] ${label}`);
  const result = spawnSync(npmCommand, ['run', 'build'], {
    cwd,
    env: {
      ...process.env,
      ...extraEnv,
    },
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(
      `${label} build failed with exit code ${result.status ?? 'unknown'}${result.error ? `: ${result.error.message}` : ''}`,
    );
  }
}

runBuild('Portal', workspaceRoot, {
  PAGES_BASE_PATH: '/',
  VITE_INTERNAL_TOOLS_ORIGIN: '/internal-tools',
  VITE_SURVEY_PLATFORM_URL: '/survey/',
  VITE_VWORLD_PROXY_URL: 'http://127.0.0.1:4173',
});

runBuild('Survey', join(workspaceRoot, 'Survey platform for collaboration'), {
  PAGES_BASE_PATH: '/survey/',
  VITE_PORTAL_TOOLS_URL: '/tools#adaptation-support-tools',
});

runBuild('Internal tools', join(workspaceRoot, 'riskmap-core-main'), {
  PAGES_BASE_PATH: '/internal-tools',
  VITE_PORTAL_TOOLS_URL: 'http://127.0.0.1:4173/tools#adaptation-support-tools',
  VITE_LEAD_DEPARTMENT_TOOL_URL: 'http://127.0.0.1:4173/lead-department-tool',
  VITE_VWORLD_PROXY_URL: 'http://127.0.0.1:4173',
});

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

const portalDist = join(workspaceRoot, 'dist');
const surveyDist = join(workspaceRoot, 'Survey platform for collaboration', 'dist');
const internalToolsDist = join(workspaceRoot, 'riskmap-core-main', 'build');

for (const path of [portalDist, surveyDist, internalToolsDist]) {
  if (!existsSync(path)) throw new Error(`Missing build output: ${path}`);
}

cpSync(portalDist, outputRoot, { recursive: true });
cpSync(surveyDist, join(outputRoot, 'survey'), { recursive: true });
cpSync(internalToolsDist, join(outputRoot, 'internal-tools'), { recursive: true });

console.log(`\n[build] Unified platform assembled at ${outputRoot}`);
