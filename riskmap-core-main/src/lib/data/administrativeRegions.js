import DOWNLOADS_SIGUNGU_BOUNDARIES from '../../../../shared/data/administrative-regions/boundaries/downloads-sigungu-boundaries.json?raw';

export const SIDO_NAMES_BY_CODE = {
    11: '서울특별시',
    26: '부산광역시',
    27: '대구광역시',
    28: '인천광역시',
    29: '광주광역시',
    30: '대전광역시',
    31: '울산광역시',
    36: '세종특별자치시',
    41: '경기도',
    42: '강원특별자치도',
    43: '충청북도',
    44: '충청남도',
    45: '전북특별자치도',
    46: '전라남도',
    47: '경상북도',
    48: '경상남도',
    50: '제주특별자치도',
    51: '강원특별자치도',
    52: '전북특별자치도'
};

const boundaryDocument = JSON.parse(DOWNLOADS_SIGUNGU_BOUNDARIES);

export const boundaryFeaturesByCode = boundaryDocument.featuresByCode || {};

function collectCoordinates(value, points = []) {
    if (!value) return points;
    if (typeof value[0] === 'number' && typeof value[1] === 'number') {
        points.push(value);
        return points;
    }
    value.forEach((item) => collectCoordinates(item, points));
    return points;
}

function boundsForFeatures(features) {
    const points = features.flatMap((feature) => collectCoordinates(feature.geometry?.coordinates));
    if (!points.length) return null;

    const lngs = points.map((point) => point[0]);
    const lats = points.map((point) => point[1]);
    const west = Math.min(...lngs);
    const east = Math.max(...lngs);
    const south = Math.min(...lats);
    const north = Math.max(...lats);

    return { south, west, north, east };
}

function centerForBounds(bounds) {
    if (!bounds) return null;
    return [(bounds.south + bounds.north) / 2, (bounds.west + bounds.east) / 2];
}

function createDirectRegions() {
    return Object.entries(boundaryFeaturesByCode)
        .map(([code, feature]) => {
            const sido = SIDO_NAMES_BY_CODE[code.slice(0, 2)] || '기타';
            const sigungu = feature.properties?.sig_kor_nm || feature.properties?.full_nm || code;
            const bounds = boundsForFeatures([feature]);
            return {
                type: 'sigungu',
                sido,
                sidoCode: code.slice(0, 2),
                code,
                sigungu,
                fullName: `${sido} ${sigungu}`,
                childCodes: [code],
                center: centerForBounds(bounds),
                bounds
            };
        })
        .filter((region) => region.sido !== '기타');
}

function createParentCityRegions(directRegions) {
    const groups = new Map();

    directRegions.forEach((region) => {
        const match = region.sigungu.match(/^(.+시)\s+.+구$/);
        if (!match) return;

        const cityName = match[1];
        const parentCode = `${region.code.slice(0, 4)}0`;
        const key = `${region.sido}|${cityName}|${parentCode}`;
        const current = groups.get(key) || {
            type: 'city',
            sido: region.sido,
            sidoCode: region.sidoCode,
            code: parentCode,
            sigungu: cityName,
            fullName: `${region.sido} ${cityName}`,
            childCodes: []
        };
        current.childCodes.push(region.code);
        groups.set(key, current);
    });

    return [...groups.values()]
        .map((region) => {
            const features = region.childCodes.map((code) => boundaryFeaturesByCode[code]).filter(Boolean);
            const bounds = boundsForFeatures(features);
            return {
                ...region,
                childCodes: [...new Set(region.childCodes)].sort(),
                center: centerForBounds(bounds),
                bounds
            };
        })
        .filter((region) => region.childCodes.length > 1);
}

const directRegions = createDirectRegions();
const parentCityRegions = createParentCityRegions(directRegions);

export const regionOptions = [...directRegions, ...parentCityRegions].sort((a, b) => {
    if (a.sidoCode !== b.sidoCode) return Number(a.sidoCode) - Number(b.sidoCode);
    if (a.fullName !== b.fullName) return a.fullName.localeCompare(b.fullName, 'ko');
    return a.code.localeCompare(b.code);
});

export const sidos = [...new Set(regionOptions.map((region) => region.sido))];

export function getRegionByCode(code) {
    return regionOptions.find((region) => region.code === code) || null;
}

export function getRegionOptionsBySido(sido) {
    return regionOptions.filter((region) => region.sido === sido);
}

export function getBoundaryFeaturesForRegionCode(code) {
    const directFeature = boundaryFeaturesByCode[code];
    if (directFeature) return [directFeature];

    const region = getRegionByCode(code);
    if (!region?.childCodes?.length) return [];

    return region.childCodes.map((childCode) => boundaryFeaturesByCode[childCode]).filter(Boolean);
}

export function getRegionCenter(code) {
    return getRegionByCode(code)?.center || null;
}

export function getRegionBounds(code) {
    return getRegionByCode(code)?.bounds || boundsForFeatures(getBoundaryFeaturesForRegionCode(code));
}

export function getSigunguLabel(region) {
    if (!region) return '';
    return region.fullName.replace(`${region.sido} `, '');
}

export function regionZoom(region) {
    if (!region) return 10;
    if (region.type === 'city') return 11;
    if (region.sigungu.endsWith('구')) return 13;
    if (region.sigungu.endsWith('시') || region.sigungu.endsWith('군')) return 11;
    return 10;
}
