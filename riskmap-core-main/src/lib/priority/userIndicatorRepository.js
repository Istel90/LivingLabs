import { validateUserIndicator } from '../../../../shared/data/priority/userIndicatorContract.js';
export const userIndicatorLibraryEnabled = import.meta.env?.VITE_USER_INDICATOR_LIBRARY_ENABLED !== 'false';
const endpoint = '/user-indicators';
async function request(url, options) {
    if (!userIndicatorLibraryEnabled) throw new Error('사용자 지표 등록·연결은 개발 사이트에서 이용할 수 있습니다.');
    const response = await fetch(url, {...options, signal:AbortSignal.timeout(60000)});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '사용자 지표 보관소에 연결하지 못했습니다.');
    return data;
}
export const listUserIndicators = regionCode => request(`${endpoint}?regionCode=${encodeURIComponent(regionCode)}`);
export const readUserIndicator = id => request(`${endpoint}?id=${encodeURIComponent(id)}`);
export async function saveUserIndicator(item) {
    const entries = [];
    item.gridValues.forEach((v,i) => { if (typeof v === 'number' && Number.isFinite(v)) entries.push([i,v]); });
    const payload = {...item, entries};
    delete payload.gridValues;
    validateUserIndicator(payload);
    return request(endpoint, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
}
export function connectUserIndicator(record, groupMeta, weight = 1) {
    const meta = groupMeta[record.group];
    if (!meta) throw new Error('지표 분류를 확인하세요.');
    return {
        id:record.id, customDatasetId:record.id, datasetVersion:record.version,
        custom:true, label:record.label, description:record.description, group:record.group,
        icon:meta.icon, dimension:meta.dimension, direction:meta.direction,
        color:record.color, regionCode:record.regionCode, weight, enabled:true,
        dataStatus:'available', supportedGridUnits:['100m'], sourceType:record.sourceType,
        sourceLabel:record.sourceLabel, gridMeta:record.gridMeta,
        dataPath:`${endpoint}?id=${encodeURIComponent(record.id)}`,
        ...(record.entries ? {gridValues:new Map(record.entries)} : {}),
    };
}
export async function loadUserIndicator(item, regionCode) {
    if (item.regionCode !== regionCode) throw new Error('사용자 지표의 지역과 현재 지역이 다릅니다.');
    const record = await readUserIndicator(item.customDatasetId);
    if (record.regionCode !== regionCode || record.version !== item.datasetVersion) throw new Error('사용자 지표의 지역 또는 버전이 맞지 않습니다.');
    return {...item, gridValues:new Map(record.entries), gridMeta:record.gridMeta, loadError:null};
}
