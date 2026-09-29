// Ordering and labels are presentation data; the map registers the implementations.
export const MAP_DISPLAY_CONTROLS = Object.freeze([
    { id: 'administrative-boundary', uiType: 'toggle', label: '행정경계', title: '시군구 행정경계 표시', action: 'administrativeBoundary' },
    { id: 'analysis-boundary', uiType: 'toggle', label: '분석지역 경계', action: 'analysisBoundary' },
    { id: 'grayscale-map', uiType: 'toggle', label: '흑백 지도', action: 'grayscaleMap' }
]);

export function validateDisplayControls(controls, actions) {
    const ids = new Set();
    for (const control of controls) {
        if (ids.has(control.id) || control.uiType !== 'toggle' || !control.label ||
            typeof actions[control.action]?.get !== 'function' || typeof actions[control.action]?.set !== 'function') {
            throw new Error(`Invalid display control: ${control.id}`);
        }
        ids.add(control.id);
    }
    return true;
}
