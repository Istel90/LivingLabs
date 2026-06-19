export const VWORLD_WMS_URL = 'https://api.vworld.kr/req/wms';
export const VWORLD_DATA_URL = 'https://api.vworld.kr/req/data';
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

export function getVWorldDomain() {
  return import.meta.env.VITE_VWORLD_DOMAIN || VWORLD_DEFAULT_DOMAIN;
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
