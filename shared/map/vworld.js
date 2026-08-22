export const VWORLD_WMS_URL = 'https://api.vworld.kr/req/wms';
export const VWORLD_DATA_URL = 'https://api.vworld.kr/req/data';
export const VWORLD_BASE_TILE_URL = 'https://xdworld.vworld.kr/2d/Base/service/{z}/{x}/{y}.png';
export const VWORLD_DEFAULT_DOMAIN = 'https://istel90.github.io/LivingLabs/';

export const VWORLD_WMS_LAYERS = {
  sidoBoundary: 'lt_c_adsido',
  sigunguBoundary: 'lt_c_adsigg',
  emdBoundary: 'lt_c_ademd',
  cadastral: 'lp_pa_cbnd_bubun',
};

export const VWORLD_DATASETS = {
  sidoBoundary: 'LT_C_ADSIDO_INFO',
  sigunguBoundary: 'LT_C_ADSIGG_INFO',
  eupMyeonDongBoundary: 'LT_C_ADEMD_INFO',
  cadastral: 'LP_PA_CBND_BUBUN',
};

export function getVWorldApiKey() {
  return import.meta.env.VITE_VWORLD_API_KEY || '';
}

export function hasVWorldApiKey() {
  return Boolean(getVWorldApiKey());
}

export function canUseRemoteVWorldData() {
  return Boolean(getVWorldProxyUrl() || getVWorldApiKey());
}

export function canUseVWorldData() {
  return Boolean(getCadastreApiBaseUrl() || canUseRemoteVWorldData());
}

export function getVWorldDomain() {
  return import.meta.env.VITE_VWORLD_DOMAIN || VWORLD_DEFAULT_DOMAIN;
}

export function getVWorldProxyUrl() {
  return import.meta.env.VITE_VWORLD_PROXY_URL || '';
}

export function getCadastreApiBaseUrl() {
  const configuredUrl = import.meta.env.VITE_CADASTRE_API_URL || '';
  if (configuredUrl) return configuredUrl;

  const location = globalThis.location;
  if (!location || !['127.0.0.1', 'localhost'].includes(location.hostname)) return '';

  // The Vite development server proxies /cadastre to the local data service.
  // The combined production server exposes the same route on its own origin.
  return location.origin;
}

export function canUseLocalCadastre() {
  return Boolean(getCadastreApiBaseUrl());
}

export function createCadastreBboxUrl(box, options = {}) {
  const baseUrl = getCadastreApiBaseUrl();
  if (!baseUrl) return '';

  const url = new URL('/cadastre/bbox', baseUrl);
  url.searchParams.set('bbox', [box.minLng, box.minLat, box.maxLng, box.maxLat].join(','));
  url.searchParams.set('limit', String(options.limit ?? 1000));
  url.searchParams.set('simplifyMeters', String(options.simplifyMeters ?? 0));
  return url.toString();
}

export function createVWorldWmsOptions(layer, options = {}) {
  return {
    format: 'image/png',
    key: getVWorldApiKey(),
    domain: getVWorldDomain(),
    layers: layer,
    styles: layer,
    version: '1.3.0',
    transparent: true,
    ...options,
  };
}

export function createVWorldDataUrl(data, params = {}) {
  const proxyUrl = getVWorldProxyUrl();
  const baseUrl = globalThis.location?.origin || 'http://127.0.0.1';
  const url = new URL(proxyUrl || VWORLD_DATA_URL, baseUrl);
  const query = {
    service: 'data',
    version: '2.0',
    request: 'GetFeature',
    format: 'json',
    data,
    ...(proxyUrl ? {} : { key: getVWorldApiKey(), domain: getVWorldDomain() }),
    geometry: true,
    attribute: true,
    crs: 'EPSG:4326',
    size: 1000,
    page: 1,
    ...params,
  };

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
}
