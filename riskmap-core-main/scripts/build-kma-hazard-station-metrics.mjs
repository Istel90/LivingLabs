import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const rawDir = path.join(projectRoot, 'data', 'raw', 'kma', 'asos-daily');
const outputPath = path.join(projectRoot, 'static', 'analysis-data', 'climate', 'kma-asos-hazard-station-metrics-2021-2025.json');
const baselineYears = Array.from({ length: 30 }, (_, index) => 1991 + index);
const targetYears = [2021, 2022, 2023, 2024, 2025];
const allYears = [...baselineYears, ...targetYears];
const args = Object.fromEntries(process.argv.slice(2).map((argument) => {
    const [key, value = 'true'] = argument.replace(/^--/, '').split('=');
    return [key, value];
}));
const concurrency = Math.max(1, Math.min(32, Number(args.concurrency) || 16));

function loadEnv(filePath) {
    if (!existsSync(filePath)) return {};
    return Object.fromEntries(
        readFileSync(filePath, 'utf8')
            .replace(/^\uFEFF/, '')
            .split(/\r?\n/)
            .map((line) => line.match(/^([^#=\s]+)=(.*)$/))
            .filter(Boolean)
            .map((match) => [match[1], match[2].trim()])
    );
}

const env = {
    ...process.env,
    ...loadEnv(path.join(workspaceRoot, '.env.local')),
    ...loadEnv(path.join(projectRoot, '.env.local'))
};
if (!env.KMA_API_KEY) throw new Error('KMA_API_KEY is missing');

function dateStringsForYear(year) {
    const dates = [];
    const cursor = new Date(Date.UTC(year, 0, 1));
    while (cursor.getUTCFullYear() === year) {
        dates.push(cursor.toISOString().slice(0, 10).replaceAll('-', ''));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
}

async function fetchKmaText(pathname, params) {
    const url = new URL('https://apihub.kma.go.kr/api/typ01/url/' + pathname);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    url.searchParams.set('help', '0');
    url.searchParams.set('authKey', env.KMA_API_KEY);

    let lastError;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
        try {
            const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
            if (!response.ok) throw new Error('KMA HTTP ' + response.status);
            const text = new TextDecoder('euc-kr').decode(await response.arrayBuffer());
            if (text.includes('"status" : 403') || text.includes('"status":403')) throw new Error('KMA API permission denied');
            return text;
        } catch (error) {
            lastError = error;
            await new Promise((resolve) => setTimeout(resolve, attempt * 700));
        }
    }
    throw lastError;
}

function parseStations(payload) {
    return payload
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => /^\d+\s+\d/.test(line))
        .map((line) => {
            const values = line.split(/\s+/);
            return {
                id: values[0],
                longitude: Number(values[1]),
                latitude: Number(values[2]),
                name: values[10] || '관측소 ' + values[0]
            };
        })
        .filter((station) => Number.isFinite(station.longitude) && Number.isFinite(station.latitude));
}

function temperature(values, index) {
    const value = Number(values[index]);
    return Number.isFinite(value) && value > -90 ? value : null;
}

function parseDaily(payload) {
    return payload
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => /^\d{8},\d+,/.test(line))
        .map((line) => {
            const values = line.split(',');
            return {
                date: values[0],
                stationId: values[1],
                taAvg: temperature(values, 10),
                taMax: temperature(values, 11),
                taMin: temperature(values, 13)
            };
        });
}

async function fetchYear(year) {
    const cachePath = path.join(rawDir, year + '.json');
    if (existsSync(cachePath)) {
        const cached = JSON.parse(await fs.readFile(cachePath, 'utf8'));
        console.log(year + ' cache ' + cached.length.toLocaleString() + ' rows');
        return cached;
    }

    const dates = dateStringsForYear(year);
    const rowsByDate = new Array(dates.length);
    let nextIndex = 0;
    let completed = 0;

    async function worker() {
        while (true) {
            const index = nextIndex;
            nextIndex += 1;
            if (index >= dates.length) return;
            const payload = await fetchKmaText('kma_sfcdd.php', { tm: dates[index], stn: 0 });
            rowsByDate[index] = parseDaily(payload);
            completed += 1;
            if (completed % 25 === 0 || completed === dates.length) {
                console.log(year + ' ' + completed + '/' + dates.length);
            }
        }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, dates.length) }, () => worker()));
    const rows = rowsByDate.flat();
    await fs.mkdir(rawDir, { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify(rows));
    console.log(year + ' saved ' + rows.length.toLocaleString() + ' rows');
    return rows;
}

function percentile(sortedValues, probability) {
    if (!sortedValues.length) return NaN;
    const position = (sortedValues.length - 1) * probability;
    const lowerIndex = Math.floor(position);
    const upperIndex = Math.ceil(position);
    const weight = position - lowerIndex;
    return sortedValues[lowerIndex] + ((sortedValues[upperIndex] - sortedValues[lowerIndex]) * weight);
}

function calendarDay(dateText) {
    const month = Number(dateText.slice(4, 6));
    const day = Number(dateText.slice(6, 8));
    if (month === 2 && day === 29) return null;
    const date = new Date(Date.UTC(2001, month - 1, day));
    return Math.floor((date - Date.UTC(2001, 0, 1)) / 86400000);
}

function circularDistance(left, right, length = 365) {
    const distance = Math.abs(left - right);
    return Math.min(distance, length - distance);
}

function warmSpellStats(flags) {
    let total = 0;
    let maximum = 0;
    let run = 0;
    for (const flag of flags) {
        if (flag) {
            run += 1;
        } else {
            if (run >= 6) total += run;
            maximum = Math.max(maximum, run);
            run = 0;
        }
    }
    if (run >= 6) total += run;
    maximum = Math.max(maximum, run);
    return { total, maximum };
}

function mean(values) {
    const finite = values.filter(Number.isFinite);
    return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

function round(value, digits = 3) {
    if (!Number.isFinite(value)) return null;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function groupByStation(rows) {
    const grouped = new Map();
    for (const row of rows) {
        if (!grouped.has(row.stationId)) grouped.set(row.stationId, []);
        grouped.get(row.stationId).push(row);
    }
    grouped.forEach((stationRows) => stationRows.sort((left, right) => left.date.localeCompare(right.date)));
    return grouped;
}

function buildThresholds(baselineRows) {
    const byCalendarDay = Array.from({ length: 365 }, () => []);
    for (const row of baselineRows) {
        const day = calendarDay(row.date);
        if (day !== null && Number.isFinite(row.taMax)) byCalendarDay[day].push(row.taMax);
    }
    return byCalendarDay.map((_, targetDay) => {
        const samples = [];
        byCalendarDay.forEach((values, sourceDay) => {
            if (circularDistance(targetDay, sourceDay) <= 2) samples.push(...values);
        });
        samples.sort((left, right) => left - right);
        return samples.length >= 100 ? percentile(samples, 0.9) : NaN;
    });
}

function yearlyRows(rows) {
    const grouped = new Map();
    for (const row of rows) {
        const year = Number(row.date.slice(0, 4));
        if (!grouped.has(year)) grouped.set(year, []);
        grouped.get(year).push(row);
    }
    return grouped;
}

function computeMetrics(targetRows, thresholds) {
    const years = yearlyRows(targetRows);
    const annual = [...years.entries()].map(([year, rows]) => {
        const ordered = rows.filter((row) => calendarDay(row.date) !== null);
        const warmFlags = ordered.map((row) => {
            const day = calendarDay(row.date);
            return Number.isFinite(row.taMax) && Number.isFinite(thresholds[day]) && row.taMax > thresholds[day];
        });
        const warmSpell = warmSpellStats(warmFlags);
        return {
            year,
            h04: ordered.filter((row) => Number.isFinite(row.taMax) && row.taMax >= 33).length,
            h05: ordered.filter((row) => Number.isFinite(row.taMin) && row.taMin >= 25).length,
            h06: warmSpell.total,
            h07: Math.max(...ordered.map((row) => row.taMax).filter(Number.isFinite)),
            h08: warmFlags.filter(Boolean).length,
            h09: warmSpell.maximum
        };
    });

    return {
        H01: round(mean(targetRows.map((row) => row.taAvg))),
        H02: round(mean(targetRows.map((row) => row.taMax))),
        H03: round(mean(targetRows.map((row) => row.taMin))),
        H04: round(mean(annual.map((item) => item.h04))),
        H05: round(mean(annual.map((item) => item.h05))),
        H06: round(mean(annual.map((item) => item.h06))),
        H07: round(mean(annual.map((item) => item.h07))),
        H08: round(mean(annual.map((item) => item.h08))),
        H09: round(mean(annual.map((item) => item.h09)))
    };
}

async function main() {
    const stationCatalog = parseStations(await fetchKmaText('stn_inf.php', { inf: 'SFC', stn: 0 }));
    const stationById = new Map(stationCatalog.map((station) => [station.id, station]));
    const rowsByYear = new Map();
    for (const year of allYears) rowsByYear.set(year, await fetchYear(year));

    const baselineRows = baselineYears.flatMap((year) => rowsByYear.get(year));
    const targetRows = targetYears.flatMap((year) => rowsByYear.get(year));
    const baselineByStation = groupByStation(baselineRows);
    const targetByStation = groupByStation(targetRows);
    const expectedBaselineDays = baselineYears.reduce((sum, year) => sum + dateStringsForYear(year).length, 0);
    const expectedTargetDays = targetYears.reduce((sum, year) => sum + dateStringsForYear(year).length, 0);

    const stations = [];
    for (const [stationId, rows] of targetByStation.entries()) {
        const station = stationById.get(stationId);
        const baseline = baselineByStation.get(stationId) || [];
        const targetCompleteness = rows.filter((row) => Number.isFinite(row.taMax) && Number.isFinite(row.taMin)).length / expectedTargetDays;
        const baselineCompleteness = baseline.filter((row) => Number.isFinite(row.taMax)).length / expectedBaselineDays;
        if (!station || targetCompleteness < 0.8 || baselineCompleteness < 0.8) continue;
        const thresholds = buildThresholds(baseline);
        if (thresholds.filter(Number.isFinite).length < 365) continue;
        stations.push({
            ...station,
            targetCompleteness: round(targetCompleteness, 4),
            baselineCompleteness: round(baselineCompleteness, 4),
            metrics: computeMetrics(rows, thresholds)
        });
    }

    const output = {
        schemaVersion: 'kma-asos-hazard-stations/v1',
        generatedAt: new Date().toISOString(),
        source: 'KMA API Hub ASOS daily observations (kma_sfcdd.php)',
        observedPeriod: '2021-01-01/2025-12-31',
        baselinePeriod: '1991-01-01/2020-12-31',
        method: {
            spatialization: 'IDW using nearest 8 eligible ASOS stations, power 2',
            H01: 'mean daily mean temperature',
            H02: 'mean daily maximum temperature',
            H03: 'mean daily minimum temperature',
            H04: 'mean annual count of days with TX >= 33C',
            H05: 'mean annual count of days with TN >= 25C',
            H06: 'mean annual WSDI, runs >= 6 days above calendar-day TX90',
            H07: 'mean annual maximum daily maximum temperature (TXx)',
            H08: 'mean annual count above calendar-day TX90 (TX90p)',
            H09: 'mean annual maximum warm-spell run length (WSDIx)'
        },
        units: { H01: '°C', H02: '°C', H03: '°C', H04: '일/년', H05: '일/년', H06: '일/년', H07: '°C', H08: '일/년', H09: '일/년' },
        stationCount: stations.length,
        stations: stations.sort((left, right) => Number(left.id) - Number(right.id))
    };

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
    console.log('Generated ' + stations.length + ' eligible ASOS stations at ' + outputPath);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});