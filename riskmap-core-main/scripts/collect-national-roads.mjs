import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workspaceRoot = resolve(projectRoot, '..');
const outputRoot = resolve(
    workspaceRoot,
    'data',
    'LivingLabs_flood_national',
    '05_adaptive_capacity',
    'roads',
    'ITS_LINK_v2'
);
const baseUrl = 'https://portal.esrikr.com/arcgis/rest/services/ITS_LINK_v2/FeatureServer';
const pageSize = 5000;

async function fetchJson(url) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
            const response = await fetch(url, {
                signal: AbortSignal.timeout(180000),
                headers: { Accept: 'application/json' }
            });
            if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
            const data = await response.json();
            if (data.error) throw new Error(JSON.stringify(data.error));
            return data;
        } catch (error) {
            if (attempt === 3) throw error;
            await new Promise((done) => setTimeout(done, 2 ** (attempt + 1) * 1000));
        }
    }
}

async function resumeState(directory) {
    const names = await readdir(directory).catch(() => []);
    const chunks = names.filter((name) => /^chunk_\d+\.json$/.test(name)).sort();
    const summaryPath = resolve(directory, 'download_summary.json');
    try {
        const summary = JSON.parse(await readFile(summaryPath, 'utf8'));
        if (summary.pages === chunks.length)
            return { page: summary.pages, total: summary.features };
    } catch {}
    let total = 0;
    for (const chunk of chunks)
        total +=
            JSON.parse(await readFile(resolve(directory, chunk), 'utf8')).features?.length || 0;
    return { page: chunks.length, total };
}

async function collectLayer(layerId) {
    const directory = resolve(outputRoot, `layer_${layerId}`);
    await mkdir(directory, { recursive: true });
    let { page, total } = await resumeState(directory);
    while (true) {
        const query = new URL(`${baseUrl}/${layerId}/query`);
        query.searchParams.set('where', '1=1');
        query.searchParams.set('outFields', '*');
        query.searchParams.set('returnGeometry', 'true');
        query.searchParams.set('outSR', '5179');
        query.searchParams.set('orderByFields', 'objectid');
        query.searchParams.set('resultOffset', String(total));
        query.searchParams.set('resultRecordCount', String(pageSize));
        query.searchParams.set('f', 'json');
        const data = await fetchJson(query);
        const features = data.features || [];
        if (!features.length) break;
        await writeFile(
            resolve(directory, `chunk_${String(page).padStart(5, '0')}.json`),
            JSON.stringify({ source: `${baseUrl}/${layerId}`, features }),
            'utf8'
        );
        total += features.length;
        page += 1;
        await writeFile(
            resolve(directory, 'download_summary.json'),
            JSON.stringify(
                { source: `${baseUrl}/${layerId}`, features: total, pages: page },
                null,
                2
            ),
            'utf8'
        );
        console.log(`roads layer ${layerId}: ${total.toLocaleString()}`);
        if (features.length < pageSize && !data.exceededTransferLimit) break;
    }
    return total;
}

const counts = [];
for (let layerId = 0; layerId < 4; layerId += 1) counts.push(await collectLayer(layerId));
console.log(
    JSON.stringify({ ok: true, counts, total: counts.reduce((sum, count) => sum + count, 0) })
);
