// Additive identity fields: old UI IDs and the existing draft envelope remain compatible.
export const createResultId = (kind) => `${kind}-${crypto.randomUUID()}`;

export function normalizeAlternativeIdentity(alternative, scope) {
    const alternativeId = alternative.alternativeId ||
        `legacy-alternative:${encodeURIComponent(scope)}:${encodeURIComponent(alternative.id)}`;
    let result = alternative.analysisResult;
    if (result) {
        const riskResultId = result.riskResultId || `legacy-risk:${alternativeId}:${encodeURIComponent(scope)}`;
        const districtResultId = result.districtResultId ||
            (result.parcelCandidates?.length ? `legacy-districts:${riskResultId}` : null);
        result = {
            ...result, riskResultId, alternativeId,
            districtResultId,
            parcelCandidates: (result.parcelCandidates || []).map((candidate, index) => ({
                ...candidate,
                districtId: candidate.districtId || `${districtResultId}:${index + 1}`,
                districtResultId,
                sourceRiskResultId: riskResultId,
            })),
        };
    }
    return { ...alternative, alternativeId, analysisResult: result };
}

export function identifyRiskResult(result, alternative, context) {
    return {
        ...result,
        identitySchema: 1,
        riskResultId: createResultId('risk'),
        alternativeId: alternative.alternativeId,
        calculatedAt: new Date().toISOString(),
        analysisContext: context,
        districtResultId: null,
        parcelCandidates: [],
    };
}

export function identifyDistrictResult(result, candidates) {
    if (!result?.riskResultId) throw new Error('Risk 결과 ID가 필요합니다.');
    const districtResultId = createResultId('districts');
    return {
        ...result, districtResultId, districtsDerivedAt: new Date().toISOString(),
        parcelCandidates: candidates.map((candidate) => ({
            ...candidate,
            districtId: createResultId('district'),
            districtResultId,
            sourceRiskResultId: result.riskResultId,
        })),
    };
}

export function buildResultIndex(alternatives) {
    return {
        schemaVersion: 1,
        alternatives: alternatives.map((alternative) => ({
            alternativeId: alternative.alternativeId,
            name: alternative.name,
            riskResultId: alternative.analysisResult?.riskResultId || null,
            districtResultId: alternative.analysisResult?.districtResultId || null,
            districtIds: (alternative.analysisResult?.parcelCandidates || []).map((candidate) => candidate.districtId),
        })),
    };
}
