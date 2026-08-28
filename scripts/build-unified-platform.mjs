import {
  cpSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const outputRoot = join(workspaceRoot, "pages-dist");
const stagingRoot = `${outputRoot}.next`;
const previousRoot = `${outputRoot}.previous`;
const vworldProxyUrl =
  process.env.VITE_VWORLD_PROXY_URL || "http://127.0.0.1:4173/vworld-data";
const analysisApiUrl = process.env.VITE_ANALYSIS_API_URL || "";
const requestedModes = new Set(process.argv.slice(2));
const prepareOnly = requestedModes.has("--prepare-only");
const activateOnly = requestedModes.has("--activate-only");

if (prepareOnly && activateOnly) {
  throw new Error("Prepare-only and activate-only cannot be used together.");
}

function runBuild(label, cwd, extraEnv) {
  console.log(`\n[build] ${label}`);
  const result = spawnSync(npmCommand, ["run", "build"], {
    cwd,
    env: {
      ...process.env,
      ...extraEnv,
    },
    shell: process.platform === "win32",
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(
      `${label} build failed with exit code ${result.status ?? "unknown"}${result.error ? `: ${result.error.message}` : ""}`,
    );
  }
}

if (!activateOnly) {
  runBuild("Portal", workspaceRoot, {
    PAGES_BASE_PATH: "/",
    VITE_INTERNAL_TOOLS_ORIGIN: "/internal-tools",
    VITE_SURVEY_PLATFORM_URL: "/survey/",
    VITE_VWORLD_PROXY_URL: vworldProxyUrl,
    VITE_ANALYSIS_API_URL: analysisApiUrl,
  });

  runBuild("Survey", join(workspaceRoot, "Survey platform for collaboration"), {
    PAGES_BASE_PATH: "/survey/",
    VITE_PORTAL_TOOLS_URL: "/tools#adaptation-support-tools",
  });

  runBuild("Internal tools", join(workspaceRoot, "riskmap-core-main"), {
    PAGES_BASE_PATH: "/internal-tools",
    VITE_PORTAL_TOOLS_URL:
      "http://127.0.0.1:4173/tools#adaptation-support-tools",
    VITE_LEAD_DEPARTMENT_TOOL_URL: "http://127.0.0.1:4173/lead-department-tool",
    VITE_VWORLD_PROXY_URL: vworldProxyUrl,
    VITE_ANALYSIS_API_URL: analysisApiUrl,
  });

  const portalDist = join(workspaceRoot, "dist");
  const surveyDist = join(
    workspaceRoot,
    "Survey platform for collaboration",
    "dist",
  );
  const internalToolsDist = join(workspaceRoot, "riskmap-core-main", "build");

  for (const path of [portalDist, surveyDist, internalToolsDist]) {
    if (!existsSync(path)) throw new Error(`Missing build output: ${path}`);
  }

  rmSync(stagingRoot, { recursive: true, force: true });
  mkdirSync(stagingRoot, { recursive: true });

  cpSync(portalDist, stagingRoot, { recursive: true });
  cpSync(surveyDist, join(stagingRoot, "survey"), { recursive: true });
  cpSync(internalToolsDist, join(stagingRoot, "internal-tools"), {
    recursive: true,
  });

  for (const path of [
    join(stagingRoot, "index.html"),
    join(stagingRoot, "survey", "index.html"),
    join(stagingRoot, "internal-tools", "index.html"),
  ]) {
    if (!existsSync(path)) throw new Error(`Incomplete unified build: ${path}`);
  }

  const revisionResult = spawnSync("git", ["rev-parse", "--short=12", "HEAD"], {
    cwd: workspaceRoot,
    encoding: "utf8",
  });
  const buildInfo = {
    schemaVersion: "livinglabs-unified-build/v1",
    builtAt: new Date().toISOString(),
    sourceRevision:
      revisionResult.status === 0 ? revisionResult.stdout.trim() : null,
  };
  writeFileSync(
    join(stagingRoot, ".livinglabs-build.json"),
    JSON.stringify(buildInfo, null, 2) + "\n",
    "utf8",
  );
}

if (prepareOnly) {
  console.log(`\n[build] Unified platform prepared at ${stagingRoot}`);
  console.log(
    "[build] Run with --activate-only after stopping the platform server.",
  );
  process.exit(0);
}

if (!existsSync(stagingRoot)) {
  throw new Error(`Prepared unified build is missing: ${stagingRoot}`);
}

rmSync(previousRoot, { recursive: true, force: true });
let currentMoved = false;

try {
  if (existsSync(outputRoot)) {
    renameSync(outputRoot, previousRoot);
    currentMoved = true;
  }
  renameSync(stagingRoot, outputRoot);
} catch (error) {
  if (currentMoved && !existsSync(outputRoot) && existsSync(previousRoot)) {
    renameSync(previousRoot, outputRoot);
  }
  throw error;
}

console.log(`\n[build] Unified platform assembled atomically at ${outputRoot}`);
console.log(`[build] Previous known-good build retained at ${previousRoot}`);
