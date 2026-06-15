const DEG_TO_RAD = Math.PI / 180;
const DEFAULT_SOLAR = { solar_09_kst: 250, solar_12_kst: 580, solar_15_kst: 480 };

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function shadeAreaPerUnit(item, solarAltitudeDeg) {
    const width = Math.max(0.1, Number(item.widthM) || 0.1);
    const height = Math.max(0.1, Number(item.heightM) || 0.1);
    const shadowLength = height / Math.tan(clamp(solarAltitudeDeg, 1, 89) * DEG_TO_RAD);
    const canopyArea = item.shape === 'circle' ? Math.PI * Math.pow(width / 2, 2) : width * width;
    return canopyArea + width * shadowLength;
}

export function calculateTemperatureEffect({
    interventions,
    solar = DEFAULT_SOLAR,
    solarAltitudeDeg = 45,
    assessmentAreaM2 = 10000,
    albedo = 0.15,
    kTemp = 0.0067
}) {
    const areaM2 = Math.max(1, Number(assessmentAreaM2) || 1);
    const items = interventions.map((item) => {
        const count = Math.max(0, Number(item.count) || 0);
        const transmission = clamp(Number(item.transmission) || 0, 0, 1);
        const shadeAreaM2 = shadeAreaPerUnit(item, solarAltitudeDeg) * count * (1 - transmission);
        return { ...item, count, shadeAreaM2 };
    });
    const shadeAreaM2 = items.reduce((sum, item) => sum + item.shadeAreaM2, 0);
    const shadeFraction = clamp(shadeAreaM2 / areaM2, 0, 1);
    const times = [
        ['09:00', Number(solar.solar_09_kst) || DEFAULT_SOLAR.solar_09_kst],
        ['12:00', Number(solar.solar_12_kst) || DEFAULT_SOLAR.solar_12_kst],
        ['15:00', Number(solar.solar_15_kst) || DEFAULT_SOLAR.solar_15_kst]
    ].map(([time, solarWm2]) => ({
        time,
        solarWm2,
        deltaTC: kTemp * (1 - albedo) * solarWm2 * shadeFraction
    }));

    const blockedPower = times.map((row) => row.solarWm2 * shadeAreaM2);
    const blockedEnergyMJ =
        ((((blockedPower[0] + blockedPower[1]) / 2) * 3 * 3600) +
            (((blockedPower[1] + blockedPower[2]) / 2) * 3 * 3600)) /
        1_000_000;

    return {
        items,
        shadeAreaM2,
        shadeFraction,
        blockedEnergyMJ,
        meanDeltaTC: times.reduce((sum, row) => sum + row.deltaTC, 0) / times.length,
        maxDeltaTC: Math.max(...times.map((row) => row.deltaTC)),
        times,
        method: '수관폭·시설폭 기반 그림자 면적 × 시군구 09/12/15시 일사량'
    };
}
