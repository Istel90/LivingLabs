import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Agent as HttpsAgent, request as httpsRequest } from 'node:https';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workspaceRoot = resolve(root, '..');
const handoffStorePath = resolve(workspaceRoot, '.runtime-logs', 'priority-handoffs.json');
const responsibleHandoffStorePath = resolve(workspaceRoot, '.runtime-logs', 'responsible-handoffs.json');
const responsibleReviewStorePath = resolve(workspaceRoot, '.runtime-logs', 'responsible-review-responses.json');
const envPath = resolve(root, '.env.local');
const env = {};

try {
  const content = readFileSync(envPath, 'utf8');
  content.split(/\r?\n/).forEach((line) => {
    const cleanLine = line.replace(/^\uFEFF/, '');
    const match = cleanLine.match(/^([^#=\s]+)=(.*)$/);
    if (match) env[match[1]] = match[2].trim();
  });
} catch {
  // The proxy can still start, but VWorld requests will return a clear error.
}

const apiKey = env.VITE_VWORLD_API_KEY || '';
const domain = env.VITE_VWORLD_DOMAIN || 'http://127.0.0.1:4175/';
const allowInsecureTls = env.VWORLD_ALLOW_INSECURE_TLS === 'true' || process.env.VWORLD_ALLOW_INSECURE_TLS === 'true';
const httpsAgent = allowInsecureTls ? new HttpsAgent({ rejectUnauthorized: false }) : undefined;
const port = Number(process.env.VWORLD_PROXY_PORT || process.argv.find((arg) => arg.startsWith('--port='))?.split('=')[1] || 4176);

function send(response, status, body, contentType = 'application/json; charset=utf-8') {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
  });
  response.end(body);
}

function readJsonBody(request) {
  return new Promise((resolveBody, reject) => {
    let data = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      data += chunk;
      if (data.length > 2_000_000) {
        reject(new Error('Request body too large'));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolveBody(data ? JSON.parse(data) : null);
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    request.on('error', reject);
  });
}

function readHandoffStore(storePath = handoffStorePath) {
  try {
    if (!existsSync(storePath)) return {};
    const parsed = JSON.parse(readFileSync(storePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeHandoffStore(store, storePath = handoffStorePath) {
  writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf8');
}

async function handleStoredHandoffRoute(request, response, url, { storePath, schemaVersion }) {
  if (request.method === 'GET') {
    const regionCode = url.searchParams.get('regionCode') || '';
    const store = readHandoffStore(storePath);
    send(response, 200, JSON.stringify({
      ok: true,
      payload: regionCode ? store[regionCode] || null : null,
    }));
    return true;
  }

  if (request.method === 'POST') {
    try {
      const payload = await readJsonBody(request);
      if (!payload?.regionCode || payload?.schemaVersion !== schemaVersion) {
        send(response, 400, JSON.stringify({ ok: false, error: `Invalid ${schemaVersion} payload` }));
        return true;
      }
      const store = readHandoffStore(storePath);
      store[payload.regionCode] = {
        ...payload,
        storedAt: new Date().toISOString(),
      };
      writeHandoffStore(store, storePath);
      send(response, 200, JSON.stringify({ ok: true, packageId: payload.packageId, regionCode: payload.regionCode }));
    } catch (error) {
      send(response, 400, JSON.stringify({ ok: false, error: error?.message || 'Failed to store handoff' }));
    }
    return true;
  }

  if (request.method === 'DELETE') {
    const regionCode = url.searchParams.get('regionCode') || '';
    const store = readHandoffStore(storePath);
    if (regionCode) delete store[regionCode];
    writeHandoffStore(store, storePath);
    send(response, 200, JSON.stringify({ ok: true, regionCode }));
    return true;
  }

  return false;
}

function fetchVWorldData(searchParams) {
  return new Promise((resolvePromise, reject) => {
    if (!apiKey) {
      reject(new Error('Missing VITE_VWORLD_API_KEY'));
      return;
    }

    const url = new URL('https://api.vworld.kr/req/data');
    const query = {
      service: 'data',
      version: '2.0',
      request: 'GetFeature',
      format: 'json',
      geometry: 'true',
      attribute: 'true',
      crs: 'EPSG:4326',
      size: '1000',
      page: '1',
    };

    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
    for (const [key, value] of searchParams.entries()) {
      if (!['key', 'domain'].includes(key)) url.searchParams.set(key, value);
    }
    url.searchParams.set('key', apiKey);
    url.searchParams.set('domain', domain);

    const request = httpsRequest(url, { method: 'GET', timeout: 20000, agent: httpsAgent }, (upstream) => {
      let data = '';
      upstream.setEncoding('utf8');
      upstream.on('data', (chunk) => {
        data += chunk;
      });
      upstream.on('end', () => {
        resolvePromise({ statusCode: upstream.statusCode || 502, body: data });
      });
    });

    request.on('timeout', () => {
      request.destroy(new Error('VWorld request timeout'));
    });
    request.on('error', reject);
    request.end();
  });
}

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    send(response, 204, '');
    return;
  }

  const url = new URL(request.url || '/', `http://127.0.0.1:${port}`);
  if (url.pathname === '/health') {
    send(response, 200, JSON.stringify({ ok: true, service: 'vworld-data-proxy' }));
    return;
  }

  if (url.pathname === '/priority-handoff') {
    if (request.method === 'GET') {
      const regionCode = url.searchParams.get('regionCode') || '';
      const store = readHandoffStore();
      send(response, 200, JSON.stringify({
        ok: true,
        payload: regionCode ? store[regionCode] || null : null,
      }));
      return;
    }

    if (request.method === 'POST') {
      try {
        const payload = await readJsonBody(request);
        if (!payload?.regionCode || payload?.schemaVersion !== 'priority-management-handoff/v1') {
          send(response, 400, JSON.stringify({ ok: false, error: 'Invalid priority handoff payload' }));
          return;
        }
        const store = readHandoffStore();
        store[payload.regionCode] = {
          ...payload,
          storedAt: new Date().toISOString(),
        };
        writeHandoffStore(store);
        send(response, 200, JSON.stringify({ ok: true, packageId: payload.packageId, regionCode: payload.regionCode }));
      } catch (error) {
        send(response, 400, JSON.stringify({ ok: false, error: error?.message || 'Failed to store handoff' }));
      }
      return;
    }

    if (request.method === 'DELETE') {
      const regionCode = url.searchParams.get('regionCode') || '';
      const store = readHandoffStore();
      if (regionCode) delete store[regionCode];
      writeHandoffStore(store);
      send(response, 200, JSON.stringify({ ok: true, regionCode }));
      return;
    }
  }

  if (url.pathname === '/responsible-handoff') {
    if (await handleStoredHandoffRoute(request, response, url, {
      storePath: responsibleHandoffStorePath,
      schemaVersion: 'lead-to-responsible-handoff/v1',
    })) return;
  }

  if (url.pathname === '/responsible-review-response') {
    if (await handleStoredHandoffRoute(request, response, url, {
      storePath: responsibleReviewStorePath,
      schemaVersion: 'responsible-to-lead-review/v1',
    })) return;
  }

  if (url.pathname !== '/vworld-data') {
    send(response, 404, JSON.stringify({ error: 'Not found' }));
    return;
  }

  try {
    const result = await fetchVWorldData(url.searchParams);
    send(response, result.statusCode, result.body);
  } catch (error) {
    send(response, 502, JSON.stringify({
      response: {
        status: 'ERROR',
        error: {
          code: 'LOCAL_PROXY_ERROR',
          text: error?.message || 'Local VWorld proxy failed',
        },
      },
    }));
  }
});

server.listen(port, '127.0.0.1', () => {
  try {
    console.log(`VWorld data proxy listening on http://127.0.0.1:${port}/vworld-data`);
  } catch {
    // Hidden Windows background processes may not have a writable console.
  }
});
