import { browser } from '$app/environment';

function repairMapSize() {
    const mapWrap = document.querySelector('.tool-shell .map-wrap');
    const regionWrap = mapWrap?.querySelector('.region-map-wrap');
    const regionMap = mapWrap?.querySelector('.region-map');
    if (!mapWrap || !regionWrap || !regionMap) return false;

    regionWrap.style.height = '100%';
    regionWrap.style.minHeight = '100%';
    regionMap.style.height = '100%';
    regionMap.style.minHeight = '100%';
    window.dispatchEvent(new Event('resize'));
    return true;
}

export function load() {
    if (browser) {
        const retry = (attempt = 0) => {
            if (repairMapSize() || attempt >= 12) return;
            window.setTimeout(() => retry(attempt + 1), 100);
        };
        window.setTimeout(() => retry(), 0);
        window.setTimeout(() => repairMapSize(), 350);
        window.setTimeout(() => repairMapSize(), 900);
    }
    return {};
}
