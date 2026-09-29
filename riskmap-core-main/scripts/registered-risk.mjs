import { createSectorConfigs } from '../src/lib/priority/registry.js';
import { configureRegisteredIndicators } from '../src/lib/priority/indicatorData.js';
import { decodeGridValues, cropStaticGridToRegion } from './grid-preparation.mjs';

const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
export async function prepareRegisteredRisk(request, loadDataset) {
    const configs = createSectorConfigs();
    if (!Object.hasOwn(configs, request.sector) || !/^\d{5}$/.test(request.regionCode || '')) fail('부문 또는 지역 코드가 올바르지 않습니다.');
    if (request.gridUnit !== '100m' || typeof request.nationalLab !== 'boolean') fail('지원하지 않는 분석 설정입니다.');
    if (!['observed','future'].includes(request.mode)) fail('자료 모드가 올바르지 않습니다.');
    if (request.mode === 'future' && request.sector !== 'heatwave') fail('이 부문에는 미래 시나리오 자료가 없습니다.');
    if (!Array.isArray(request.indicators) || !request.indicators.length || request.indicators.length > 64) fail('선택 지표 목록이 올바르지 않습니다.');
    const configured = configureRegisteredIndicators(configs[request.sector].indicators, request.regionCode, {datasetMode:request.mode, scenario:request.scenario, period:request.period});
    const seen = new Set();
    const selected = request.indicators.map(selection => {
        const definition = configured.find(i=>i.registryId === selection?.indicatorId);
        if (!definition?.dataSourceId || !['available','partial'].includes(definition.dataStatus) || seen.has(selection.indicatorId)) fail('해당 부문에 사용 가능한 지표가 없거나 중복되었습니다.');
        if (!Number.isFinite(selection.weight) || selection.weight < 0 || selection.weight > 1_000_000) fail('지표 가중치가 올바르지 않습니다.');
        seen.add(selection.indicatorId);
        return {...definition, enabled:true, weight:selection.weight};
    });
    let loaded = [];
    // Sequential loading bounds simultaneous dataset memory and database pressure.
    for (const item of selected) {
        const grid = await loadDataset(new URLSearchParams({dataset:item.dataSourceId,regionCode:request.regionCode,mode:request.mode,scenario:request.scenario || 'ssp245',period:request.period || '2050'}));
        const mean=grid.stats?.normalizedMean ?? grid.stats?.mean;
        if (mean == null || !Number.isFinite(Number(mean)) || !(grid.stats?.validCells > 0)) fail(`${item.label}: 이 지역에 유효한 원자료가 없습니다.`);
        if (!Number.isInteger(grid.rows) || !Number.isInteger(grid.columns) || grid.rows <= 0 || grid.columns <= 0 || grid.rows*grid.columns > 8_000_000) fail('분석 격자 크기를 확인하세요.');
        const decoded=decodeGridValues(grid);
        if(!decoded.values) fail(`${item.label}: 격자를 읽지 못했습니다.`);
        loaded.push({...item,loadedValue:Number(mean),loadError:null,geojson:grid.pointFeatureCollection,
            gridValues:decoded.values,gridValidIndices:decoded.validIndices,
            gridMeta:{gridUnit:grid.gridUnit,rows:grid.rows,columns:grid.columns,extent:grid.extent,transform:grid.transform,crs:grid.crs},
            gridSummary:{...grid.stats,gridUnit:grid.gridUnit,rows:grid.rows,columns:grid.columns,rawUnit:grid.rawUnit||grid.unit||'',normalizedMean:mean,
                normalizationSourceRange:grid.normalizationSourceRange,normalizationMethod:grid.normalizationMethod,sourceResolution:grid.sourceResolution,
                qualityStatus:grid.qualityStatus,method:grid.method,assumptions:grid.assumptions,pointFeatureCount:grid.pointFeatureCount||0}});
    }
    const reference=loaded.find(i=>(i.indicatorCode||i.floodIndicator||i.analysisIndicator)&&i.gridMeta);
    if(reference) loaded=loaded.map(i=>cropStaticGridToRegion(i,reference));
    const indicators=loaded.map(item=>{
        const entries=[];
        item.gridValues.forEach((value,index)=>{if(value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value)))entries.push([index,Number(value)]);});
        return {label:item.label,group:item.group,direction:item.direction,weight:item.weight,gridMeta:item.gridMeta,gridValidIndices:item.gridValidIndices,entries};
    });
    return {input:{schemaVersion:1,gridUnit:request.gridUnit,nationalLab:request.nationalLab,dimensionWeights:request.dimensionWeights,indicators},loaded};
}
