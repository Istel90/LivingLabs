export const USER_INDICATOR_GROUPS = ['기후위험', '노출', '민감도', '적응역량'];
export function validateUserIndicator(input) {
    const { gridMeta: grid, entries } = input || {};
    if (!input || typeof input.label !== 'string' || !input.label.trim() || input.label.length > 120) throw new Error('지표 이름은 1~120자로 입력하세요.');
    if (!USER_INDICATOR_GROUPS.includes(input.group)) throw new Error('지표 분류를 확인하세요.');
    if (!/^\d{5}$/.test(input.regionCode || '')) throw new Error('지역 코드를 확인하세요.');
    if (grid?.crs !== 'EPSG:5179' || grid.gridUnit !== '100m' || !Number.isInteger(grid.rows) || !Number.isInteger(grid.columns) || grid.rows < 1 || grid.columns < 1 || grid.rows * grid.columns > 8000000) throw new Error('EPSG:5179의 100m 격자가 필요합니다.');
    const t = grid.transform;
    if (!t || ![t.originX, t.originY, t.pixelWidth, t.pixelHeight].every(Number.isFinite) || t.pixelWidth !== 100 || Math.abs(t.pixelHeight) !== 100) throw new Error('격자의 좌표와 100m 해상도를 확인하세요.');
    // Match the national raster registration grid even for cropped regional grids.
    if (Math.abs((t.originX - 745900) / 100 - Math.round((t.originX - 745900) / 100)) > 1e-6 || Math.abs((t.originY - 2068600) / 100 - Math.round((t.originY - 2068600) / 100)) > 1e-6) throw new Error('전국 기준 격자와 위치가 맞지 않습니다.');
    if (!Array.isArray(entries) || !entries.length || entries.length > 2000000) throw new Error('유효한 격자값이 필요합니다.');
    const seen = new Set();
    for (const pair of entries) {
        if (!Array.isArray(pair) || pair.length !== 2 || !Number.isInteger(pair[0]) || pair[0] < 0 || pair[0] >= grid.rows * grid.columns || seen.has(pair[0]) || !Number.isFinite(pair[1]) || pair[1] < 0 || pair[1] > 1) throw new Error('중복·범위 초과·결측 격자값을 확인하세요.');
        seen.add(pair[0]);
    }
    return input;
}
