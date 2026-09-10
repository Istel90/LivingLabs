export function groupRegionalDrafts(rows, lookupRegion) {
    const groups = new Map();
    for (const row of rows) {
        const payload = row.analysis_conditions?.draftPayload;
        const code = String(row.region_code || payload?.regionCode || 'unknown');
        const region = lookupRegion(code);
        const name = region?.fullName || payload?.region || `지역 미확인 (${code})`;
        const sido = region?.sido || '기타·미확인';
        if (!groups.has(sido)) groups.set(sido, new Map());
        const regions = groups.get(sido);
        if (!regions.has(code)) regions.set(code, { code, name, rows: [], analyzed: 0 });
        const group = regions.get(code);
        group.rows.push(row);
        group.analyzed += (payload?.alternatives || []).filter(a => a.analysisResult?.gridResult).length;
    }
    return [...groups].sort(([a],[b]) => a.localeCompare(b,'ko')).map(([name, regions]) => ({ name,
        regions: [...regions.values()].sort((a,b) => a.name.localeCompare(b.name,'ko')) }));
}
