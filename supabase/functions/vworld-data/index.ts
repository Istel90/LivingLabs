const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'no-store',
};

const VWORLD_DATA_URL = 'https://api.vworld.kr/req/data';
const ALLOWED_DATASETS = new Set([
  'LT_C_ADSIDO_INFO',
  'LT_C_ADSIGG_INFO',
  'LT_C_ADEMD_INFO',
  'LP_PA_CBND_BUBUN',
]);
const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }

  const apiKey = Deno.env.get('VWORLD_API_KEY') || '';
  const domain = Deno.env.get('VWORLD_DOMAIN') || 'https://istel90.github.io/LivingLabs/';

  if (!apiKey) {
    return json({ ok: false, error: 'Missing VWORLD_API_KEY' }, 500);
  }

  const incomingUrl = new URL(request.url);
  const upstreamUrl = new URL(VWORLD_DATA_URL);
  const defaults = {
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

  Object.entries(defaults).forEach(([key, value]) => {
    upstreamUrl.searchParams.set(key, value);
  });

  incomingUrl.searchParams.forEach((value, key) => {
    if (!['key', 'domain'].includes(key)) {
      upstreamUrl.searchParams.set(key, value);
    }
  });

  upstreamUrl.searchParams.set('key', apiKey);
  upstreamUrl.searchParams.set('domain', domain);

  const dataset = upstreamUrl.searchParams.get('data') || '';
  if (!ALLOWED_DATASETS.has(dataset)) {
    return json({ ok: false, error: 'Unsupported VWorld dataset' }, 400);
  }

  const requestedSize = Number(upstreamUrl.searchParams.get('size'));
  const requestedPage = Number(upstreamUrl.searchParams.get('page'));
  upstreamUrl.searchParams.set(
    'size',
    String(Number.isFinite(requestedSize) ? Math.min(1000, Math.max(1, requestedSize)) : 1000),
  );
  upstreamUrl.searchParams.set(
    'page',
    String(Number.isFinite(requestedPage) ? Math.min(10, Math.max(1, requestedPage)) : 1),
  );

  try {
    const upstreamResponse = await fetchWithRetry(upstreamUrl);
    const body = await upstreamResponse.text();
    const contentType =
      upstreamResponse.headers.get('content-type') || 'application/json; charset=utf-8';

    return new Response(body, {
      status: upstreamResponse.status,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
      },
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'VWorld upstream request failed',
      },
      502,
    );
  }
});

async function fetchWithRetry(url: URL, attempts = 3) {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!TRANSIENT_STATUS.has(response.status) || attempt === attempts - 1) return response;
      await response.body?.cancel();
      lastError = new Error(`VWorld upstream ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) throw error;
    } finally {
      clearTimeout(timer);
    }

    // A failing VWorld node often recovers after roughly a second. Spacing retries
    // avoids immediately landing on the same transient 502 response again.
    await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
  }

  throw lastError || new Error('VWorld upstream request failed');
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}
