const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'no-store',
};

const VWORLD_DATA_URL = 'https://api.vworld.kr/req/data';

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

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: { Accept: 'application/json' },
    });
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}
