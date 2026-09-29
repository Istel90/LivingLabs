import { parentPort, workerData } from 'node:worker_threads';
import { calculateRisk } from './risk-engine.mjs';

try {
    const inputs = workerData.indicators.map(item => ({ ...item, enabled: true,
        dataStatus: 'available', gridValues: new Map(item.entries) }));
    const result = calculateRisk(inputs, workerData);
    delete result.indicators;
    for (const key of ['values', 'hValues', 'eValues', 'sensitivityValues', 'adaptiveCapacityValues', 'vValues']) {
        const entries = [];
        result.gridResult[key].forEach((value, index) => { if (Number.isFinite(value)) entries.push([index, value]); });
        result.gridResult[key] = entries;
    }
    parentPort.postMessage({ schemaVersion: 1, result });
} catch (error) {
    parentPort.postMessage({ error: error.message });
}
