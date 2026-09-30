import { analysisJsonReplacer } from '../data/analysisSerialization.js';
function stripIndicatorForResult(item) { return { ...item }; }
export function alternativeStatusLabel(alternative) {
    const currentStatus = alternative?.status || '검토중';
    if (currentStatus === '선정' || currentStatus === '검토완료') return currentStatus;

    const hasAnalysis = Boolean(alternative?.analysisDone && alternative?.analysisResult);
    if (!hasAnalysis) return '검토중';

    const hasParcelCandidates = Array.isArray(alternative?.analysisResult?.parcelCandidates)
        && alternative.analysisResult.parcelCandidates.length > 0;
    return hasParcelCandidates ? '분석완료' : '리스크분석완료';
}

export function normalizeDraftAlternative(alternative, index) {
    return {
        ...alternative,
        id: alternative?.id || `alternative-${index + 1}`,
        status: alternativeStatusLabel(alternative),
        settings: alternative?.settings || null,
        analysisResult: alternative?.analysisResult || null,
        appliedIndicators: Array.isArray(alternative?.appliedIndicators) ? alternative.appliedIndicators : [],
        analysisDone: Boolean(alternative?.analysisDone && alternative?.analysisResult),
        analysisMessage: alternative?.analysisMessage || null,
        parcelCandidateMessage: alternative?.parcelCandidateMessage || null,
        selectedCandidate: Number.isInteger(alternative?.selectedCandidate) ? alternative.selectedCandidate : 0,
        detailCandidateKey: alternative?.detailCandidateKey || null,
        activeLayer: alternative?.activeLayer || 'Risk'
    };
}

export function compactCandidateForSupabase(candidate) {
    if (!candidate) return candidate;
    const { features, ...compactCandidate } = candidate;
    return compactCandidate;
}

export function compactAnalysisResultForSupabase(result) {
    if (!result) return null;
    const grid = result.gridResult;
    return {
        ...result,
        gridResult: grid ? {
            ...grid,
            hValues: undefined,
            eValues: undefined,
            sensitivityValues: undefined,
            adaptiveCapacityValues: undefined,
            vValues: undefined
        } : null,
        parcelCandidates: (result.parcelCandidates || []).map(compactCandidateForSupabase)
    };
}

export function buildSupabaseDraftPayload(fullPayload) {
    return JSON.parse(JSON.stringify({
        ...fullPayload,
        analysisResult: undefined,
        indicators: undefined,
        appliedIndicators: undefined,
        alternatives: fullPayload.alternatives.map((alternative) => ({
            ...alternative,
            analysisResult: compactAnalysisResultForSupabase(alternative.analysisResult),
            appliedIndicators: (alternative.appliedIndicators || []).map(stripIndicatorForResult),
            settings: alternative.settings ? {
                ...alternative.settings,
                indicators: (alternative.settings.indicators || []).map(stripIndicatorForResult)
            } : null
        }))
    }, analysisJsonReplacer));
}
