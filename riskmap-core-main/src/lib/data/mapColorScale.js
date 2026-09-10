// Display-only scaling: never writes to analysis values or hotspot thresholds.
export const MAP_RAMP = 'linear-gradient(90deg,#2166ac,#67a9cf,#ffffbf,#fdae61,#b2182b)';
const stops = [[33,102,172],[103,169,207],[255,255,191],[253,174,97],[178,24,43]];
export function displayScale(values, mode = 'detail') {
    const sorted = values.filter(Number.isFinite).slice().sort((a,b) => a-b);
    if (!sorted.length) return null;
    const min = sorted[0], max = sorted.at(-1);
    let low = mode === 'common' ? 0 : min, high = mode === 'common' ? 1 : max;
    if (mode === 'detail' && sorted.length >= 20) {
        low = sorted[Math.floor((sorted.length-1)*0.05)];
        high = sorted[Math.ceil((sorted.length-1)*0.95)];
        if (high === low) { low = min; high = max; }
    }
    return { min, max, low, high, constant: min === max, clipped: low > min || high < max };
}
export function displayColor(value, scale) {
    const t = scale.constant ? 0.5 : Math.max(0,Math.min(1,(value-scale.low)/(scale.high-scale.low)));
    const p = t*4, i = Math.min(3,Math.floor(p)), f = p-i;
    return `rgb(${stops[i].map((c,j) => Math.round(c+(stops[i+1][j]-c)*f)).join(',')})`;
}
