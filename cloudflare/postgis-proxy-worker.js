const POSTGIS_ORIGIN = __POSTGIS_ORIGIN__;
const POSTGIS_TUNNEL_TOKEN = __POSTGIS_TUNNEL_TOKEN__;

const API_PATHS = [
  /^\/cadastre\/(?:health|parcel|bbox)$/,
  /^\/population\/(?:health|grid)$/,
  /^\/internal-tools\/population\/(?:health|grid)$/,
  /^\/(?:hazard-grid|flood-grid|analysis-grid)$/,
];

function isApiPath(pathname) {
  return API_PATHS.some((pattern) => pattern.test(pathname));
}

export default {
  async fetch(request, env) {
    const incomingUrl = new URL(request.url);
    if (!isApiPath(incomingUrl.pathname)) {
      return env.ASSETS.fetch(request);
    }

    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return Response.json({ ok: false, error: 'Method not allowed' }, { status: 405 });
    }

    if (!POSTGIS_ORIGIN || !POSTGIS_TUNNEL_TOKEN) {
      return Response.json({ ok: false, error: 'PostGIS demo connection is not configured' }, { status: 503 });
    }

    const upstreamPath = incomingUrl.pathname.replace(/^\/internal-tools(?=\/population\/)/, '');
    const upstreamUrl = new URL(`${upstreamPath}${incomingUrl.search}`, `${POSTGIS_ORIGIN}/`);
    const headers = new Headers();
    headers.set('Accept', request.headers.get('Accept') || 'application/json');
    headers.set('X-LivingLabs-Tunnel-Token', POSTGIS_TUNNEL_TOKEN);

    try {
      const upstream = await fetch(upstreamUrl, {
        method: request.method,
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(55000),
      });
      const responseHeaders = new Headers(upstream.headers);
      responseHeaders.set('Cache-Control', 'no-store');
      responseHeaders.set('X-LivingLabs-Data-Source', 'postgis');
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      return Response.json({
        ok: false,
        error: 'PostGIS demo computer is currently unavailable',
      }, { status: 503 });
    }
  },
};
