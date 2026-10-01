import { parentPort, workerData } from 'node:worker_threads';
import { createHotspotPoints, hotspotRequestBoxes, parcelScoreRecords, clusterParcelRecords } from './practice-area-engine.mjs';
import { enrichPracticeDistricts } from '../src/lib/data/practiceDistricts.js';

try {
    if (workerData.stage === 'prepare') {
        const { grid: input, boundaryFeatures } = workerData;
        const grid = { ...input, stats: { topThreshold: input.topThreshold } };
        for (const key of ['values', 'hValues', 'eValues', 'vValues']) grid[key] = new Float64Array(input.rows * input.columns).fill(NaN);
        for (const [index, risk, h, e, v] of input.entries) {
            grid.values[index] = risk;
            grid.hValues[index] = h === null ? NaN : h;
            grid.eValues[index] = e === null ? NaN : e;
            grid.vValues[index] = v === null ? NaN : v;
        }
        const hotspots = createHotspotPoints(grid, boundaryFeatures);
        if (!hotspots.length) throw new Error('hotspot-empty');
        parentPort.postMessage({ hotspots, boxes: hotspotRequestBoxes(hotspots) });
    } else {
        const records = parcelScoreRecords(workerData.features, workerData.hotspots);
        if (!records.length) throw new Error('intersection-empty');
        const candidates = enrichPracticeDistricts(clusterParcelRecords(records).map(candidate => workerData.source === 'vworld'
            ? { ...candidate, basis: 'VWorld LP_PA_CBND_BUBUN + 100m hotspot cell-parcel intersection' } : candidate), workerData.hazard);
        parentPort.postMessage({ candidates: candidates.map(({ features, ...candidate }) => ({
            ...candidate,
            features: (features || []).map(feature => ({ type: feature.type, geometry: feature.geometry,
                properties: { pnu: feature.properties?.pnu || feature.properties?.PNU || feature.properties?.id || '',
                    candidateRank: candidate.rank, candidateName: candidate.name, candidateRisk: candidate.risk } })),
            featureLimit: features?.length || 0, featureTotal: features?.length || 0
        })), intersectedParcels: records.length });
    }
} catch (error) {
    parentPort.postMessage({ error: error.message });
}
