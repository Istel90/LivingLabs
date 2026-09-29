// Calculation extracted unchanged from PriorityManagementArea; server-only import.
export function calculateRisk(sourceIndicators, { gridUnit = '100m', dimensionWeights = { H: 1, E: 1, V: 1 }, nationalLab = false } = {}) {
    const vLambda = 0.5;
    function isGridValueCollection(values) {
        return Array.isArray(values) || ArrayBuffer.isView(values) || values instanceof Map;
    }

    function gridValueCollectionSize(values) {
        if (values instanceof Map) return values.size;
        return Number(values?.length) || 0;
    }

    function clamp01(value) {
        return Math.min(1, Math.max(0, value));
    }

    function isIndicatorAvailable(item) {
        return ['available', 'partial'].includes(item.dataStatus) && (!item.supportedGridUnits || item.supportedGridUnits.includes(gridUnit));
    }

    function usableIndicator(item) {
        return item.enabled && isIndicatorAvailable(item);
    }

    function weightedGeometricMean(scores, weights) {
        const safeWeights = {
            H: Math.max(0, Number(weights.H) || 0),
            E: Math.max(0, Number(weights.E) || 0),
            V: Math.max(0, Number(weights.V) || 0)
        };
        const totalWeight = safeWeights.H + safeWeights.E + safeWeights.V;
        if (totalWeight <= 0) return 0;

        return Math.pow(
            Math.pow(Math.max(scores.H, 0.0001), safeWeights.H) *
            Math.pow(Math.max(scores.E, 0.0001), safeWeights.E) *
            Math.pow(Math.max(scores.V, 0.0001), safeWeights.V),
            1 / totalWeight
        );
    }

    function finiteGridValue(value) {
        if (value === null || value === undefined || value === '') return null;
        const number = Number(value);
        return Number.isFinite(number) ? clamp01(number) : null;
    }

    function gridValue(item, index) {
        if (!isGridValueCollection(item.gridValues)) return null;
        return finiteGridValue(item.gridValues instanceof Map ? item.gridValues.get(index) : item.gridValues[index]);
    }

    function weightedCellMean(items, index, valueGetter = gridValue) {
        let weightedSum = 0;
        let totalWeight = 0;

        items.forEach((item) => {
            const weight = Math.max(0, Number(item.weight) || 0);
            if (weight <= 0) return;

            const value = valueGetter(item, index);
            if (value === null) return;

            weightedSum += weight * value;
            totalWeight += weight;
        });

        return totalWeight > 0 ? weightedSum / totalWeight : null;
    }

    function summarizeGridValues(values) {
        const validValues = [];
        let min = Infinity;
        let max = -Infinity;
        let sum = 0;
        for (const value of values) {
            if (!Number.isFinite(value)) continue;
            validValues.push(value);
            min = Math.min(min, value);
            max = Math.max(max, value);
            sum += value;
        }
        if (!validValues.length) {
            return {
                validCells: 0,
                min: null,
                max: null,
                mean: null,
                topCount: 0,
                topThreshold: null
            };
        }

        const sorted = [...validValues].sort((left, right) => right - left);
        const topCount = Math.max(1, Math.ceil(sorted.length * 0.1));

        return {
            validCells: validValues.length,
            min,
            max,
            mean: sum / validValues.length,
            topCount,
            topThreshold: sorted[topCount - 1]
        };
    }

    function stripIndicatorForResult(item) {
        const { gridValues, ...resultItem } = item;
        return {
            ...resultItem,
            gridValues: isGridValueCollection(gridValues) ? gridValues : null
        };
    }

    function computeGridAnalysis(sourceIndicators) {
        const availableIndicators = sourceIndicators.filter(usableIndicator);
        const reference = availableIndicators.find((item) =>
            isGridValueCollection(item.gridValues) &&
            gridValueCollectionSize(item.gridValues) &&
            item.gridMeta?.columns &&
            item.gridMeta?.rows
        );

        if (!reference) return null;

        const columns = Number(reference.gridMeta.columns);
        const rows = Number(reference.gridMeta.rows);
        const cellCount = columns * rows;
        const gridIndicators = availableIndicators.filter((item) =>
            isGridValueCollection(item.gridValues) &&
            (item.gridValues instanceof Map || item.gridValues.length >= cellCount) &&
            Number(item.gridMeta?.columns) === columns &&
            Number(item.gridMeta?.rows) === rows
        );
        const sameCoordinates = (item) => ['originX', 'originY', 'pixelWidth', 'pixelHeight'].every((key) =>
            Number.isFinite(Number(item.gridMeta?.transform?.[key])) &&
            Math.abs(Number(item.gridMeta.transform[key]) - Number(reference.gridMeta.transform?.[key])) < 0.001
        ) && item.gridMeta?.crs === reference.gridMeta.crs;
        const misaligned = availableIndicators.filter((item) => !gridIndicators.includes(item) || !sameCoordinates(item));
        if (misaligned.length) throw new Error(`공통 격자와 정렬되지 않은 지표: ${misaligned.map((item) => item.label).join(', ')}`);
        const byGroup = (group) => gridIndicators.filter((item) => item.group === group);
        const hItems = byGroup('기후위험');
        const eItems = byGroup('노출');
        const sensitivityItems = byGroup('민감도');
        const adaptiveItems = byGroup('적응역량');

        if (!hItems.length) return null;
        const hazardOnly = nationalLab && (!eItems.length || !sensitivityItems.length || !adaptiveItems.length);
        if (!hazardOnly && (!eItems.length || !sensitivityItems.length || !adaptiveItems.length)) return null;

        const createEmptyValues = () => {
            const values = new Float32Array(cellCount);
            values.fill(Number.NaN);
            return values;
        };
        const hValues = createEmptyValues();
        const eValues = createEmptyValues();
        const sensitivityValues = createEmptyValues();
        const adaptiveCapacityValues = createEmptyValues();
        const vValues = createEmptyValues();
        const riskValues = createEmptyValues();
        const canUseSparseIndices = gridIndicators.every((item) =>
            Array.isArray(item.gridValidIndices) && item.gridValidIndices.length
        );
        const analysisIndices = canUseSparseIndices
            ? [...new Set(gridIndicators.flatMap((item) => item.gridValidIndices))]
            : Array.from({ length: cellCount }, (_, index) => index);
        const riskValidIndices = [];

        for (const index of analysisIndices) {
            const hScore = weightedCellMean(hItems, index);
            const eScore = weightedCellMean(eItems, index);
            const sensitivityScore = weightedCellMean(sensitivityItems, index);
            const adaptiveCapacityForV = weightedCellMean(
                adaptiveItems,
                index,
                (item, cellIndex) => {
                    const value = gridValue(item, cellIndex);
                    if (value === null) return null;
                    return item.direction === 'negative' ? 1 - value : value;
                }
            );

            hValues[index] = hScore ?? Number.NaN;
            eValues[index] = eScore ?? Number.NaN;
            sensitivityValues[index] = sensitivityScore ?? Number.NaN;
            adaptiveCapacityValues[index] = adaptiveCapacityForV ?? Number.NaN;

            if (hazardOnly && Number.isFinite(hScore)) {
                riskValues[index] = hScore;
                riskValidIndices.push(index);
            } else if (
                Number.isFinite(hScore) &&
                Number.isFinite(eScore) &&
                Number.isFinite(sensitivityScore) &&
                Number.isFinite(adaptiveCapacityForV)
            ) {
                const vScore = clamp01((vLambda * sensitivityScore) + ((1 - vLambda) * adaptiveCapacityForV));
                const riskScore = weightedGeometricMean({ H: hScore, E: eScore, V: vScore }, dimensionWeights);
                vValues[index] = vScore;
                riskValues[index] = riskScore;
                riskValidIndices.push(index);
            }
        }

        const hStats = summarizeGridValues(hValues);
        const eStats = summarizeGridValues(eValues);
        const sensitivityStats = summarizeGridValues(sensitivityValues);
        const adaptiveStats = summarizeGridValues(adaptiveCapacityValues);
        const vStats = summarizeGridValues(vValues);
        const riskStats = summarizeGridValues(riskValues);

        if (!riskStats.validCells) return null;

        return {
            dimensionScores: {
                H: hStats.mean,
                E: eStats.mean,
                V: vStats.mean
            },
            sensitivityScore: sensitivityStats.mean,
            adaptiveCapacityForV: adaptiveStats.mean,
            riskScore: riskStats.mean,
            hazardOnly,
            gridResult: {
                hazardOnly,
                gridUnit,
                columns,
                rows,
                extent: reference.gridMeta.extent,
                transform: reference.gridMeta.transform,
                crs: reference.gridMeta.crs,
                validIndices: riskValidIndices,
                valueEncoding: hazardOnly
                    ? 'row-major 100m cells; preliminary Risk equals normalized Hazard score'
                    : 'row-major 100m cells aligned to the regional analysis grid',
                values: riskValues,
                hValues,
                eValues,
                sensitivityValues,
                adaptiveCapacityValues,
                vValues,
                stats: {
                    ...riskStats,
                    hMean: hStats.mean,
                    eMean: eStats.mean,
                    sensitivityMean: sensitivityStats.mean,
                    adaptiveCapacityMean: adaptiveStats.mean,
                    vMean: vStats.mean
                }
            }
        };
    }

    function computeAnalysis(sourceIndicators) {
        const gridAnalysis = computeGridAnalysis(sourceIndicators);

        if (gridAnalysis) {
            return {
                gridUnit,
                formula: gridAnalysis.hazardOnly
                    ? 'Preliminary Risk = normalized Hazard score (H-only until nationwide E/V is connected)'
                    : 'Weighted geometric mean: (H^wH × E^wE × V^wV)^(1/Σw)',
                hazardOnly: gridAnalysis.hazardOnly,
                dimensionScores: gridAnalysis.dimensionScores,
                sensitivityScore: gridAnalysis.sensitivityScore,
                adaptiveCapacityForV: gridAnalysis.adaptiveCapacityForV,
                dimensionWeights: { ...dimensionWeights },
                riskScore: gridAnalysis.riskScore,
                gridResult: gridAnalysis.gridResult,
                parcelCandidates: [],
                indicators: sourceIndicators.filter(usableIndicator).map(stripIndicatorForResult)
            };
        }

        throw new Error('선택한 H/E/V 지표가 겹치는 유효 격자가 없습니다. 지표의 자료 범위와 결측 셀을 확인하세요.');
    }
    return computeAnalysis(sourceIndicators);
}
