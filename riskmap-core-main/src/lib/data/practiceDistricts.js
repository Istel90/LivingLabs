export const PRACTICE_TYPE_ORDER = ['citizen', 'facility', 'planning'];

export const PRACTICE_TYPE_META = {
    citizen: {
        label: '시민실천',
        districtLabel: '시민실천지구',
        shortDescription: '생활권 참여·운영 중심',
        color: '#0f8b6d',
        fillColor: '#34d399'
    },
    facility: {
        label: '시설지원사업',
        districtLabel: '시설지원실천지구',
        shortDescription: '시설 설치·개선 투자 중심',
        color: '#c2410c',
        fillColor: '#fb923c'
    },
    planning: {
        label: '계획행정수단',
        districtLabel: '계획실천지구',
        shortDescription: '계획·기준·지구 관리 중심',
        color: '#4f46e5',
        fillColor: '#818cf8'
    }
};

function numeric(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function candidateKey(candidate, index) {
    return String(candidate?.id || candidate?.parcelCandidateName || candidate?.name || `practice-area-${index + 1}`);
}

function formatArea(value) {
    const area = numeric(value);
    if (area <= 0) return '면적 산정 전';
    if (area >= 10000) return `${(area / 10000).toFixed(area >= 100000 ? 1 : 2)}ha`;
    return `${Math.round(area).toLocaleString()}㎡`;
}

function structuralScale(candidate) {
    return (
        Math.log1p(numeric(candidate?.totalAreaSqm)) * 0.48 +
        Math.log1p(numeric(candidate?.parcelCount)) * 0.34 +
        Math.log1p(numeric(candidate?.hotspotCount)) * 0.18
    );
}

function facilityPriority(candidate) {
    return (
        numeric(candidate?.risk) * 0.62 +
        numeric(candidate?.score, numeric(candidate?.risk)) * 0.23 +
        Math.min(1, numeric(candidate?.hotspotCount) / 30) * 0.15
    );
}

function reasonFor(type, candidate, hazard = 'heatwave') {
    const parcelCount = Math.max(0, Math.round(numeric(candidate?.parcelCount)));
    const hotspotCount = Math.max(0, Math.round(numeric(candidate?.hotspotCount)));
    const risk = numeric(candidate?.risk);
    const area = candidate?.totalAreaLabel || formatArea(candidate?.totalAreaSqm);

    if (type === 'planning') {
        return `면적 ${area}·${parcelCount.toLocaleString()}필지로 공간 규모가 큰 편이어서, 개별 시설보다 계획·관리기준을 함께 검토하는 유형으로 분류했습니다.`;
    }
    if (type === 'facility') {
        const examples = hazard === 'flood'
            ? '빗물저류·배수개선·차수시설'
            : '그늘막·쉼터·쿨루프';
        return `Risk ${risk.toFixed(2)}·hotspot ${hotspotCount.toLocaleString()}셀의 집중도가 높아, ${examples} 등 시설 투자를 우선 검토하는 유형으로 분류했습니다.`;
    }
    const actions = hazard === 'flood'
        ? '침수예보 공유·취약가구 안부 확인·대피훈련'
        : '주민 참여·안부 확인·행동 캠페인';
    return `면적 ${area}·${parcelCount.toLocaleString()}필지의 비교적 작은 생활권이어서, ${actions} 같은 운영형 대응 유형으로 분류했습니다.`;
}

/**
 * 시연용 분류 v1.
 * 전체 후보 중 공간 규모가 큰 약 1/3은 계획행정수단, 남은 후보 중
 * Risk 집중도가 높은 후보는 시설지원사업, 소규모 후보는 시민실천으로 나눈다.
 */
export function enrichPracticeDistricts(sourceCandidates = [], hazard = 'heatwave') {
    const candidates = Array.isArray(sourceCandidates) ? sourceCandidates.filter(Boolean) : [];
    if (!candidates.length) return [];

    const indexed = candidates.map((candidate, index) => ({
        candidate,
        index,
        key: candidateKey(candidate, index),
        structure: structuralScale(candidate),
        facility: facilityPriority(candidate)
    }));
    const typeByKey = new Map();

    if (indexed.length === 1) {
        typeByKey.set(indexed[0].key, 'facility');
    } else if (indexed.length === 2) {
        const byStructure = [...indexed].sort((left, right) => right.structure - left.structure);
        typeByKey.set(byStructure[0].key, 'planning');
        typeByKey.set(byStructure[1].key, 'facility');
    } else {
        const planningCount = Math.max(1, Math.floor(indexed.length / 3));
        const citizenCount = Math.max(1, Math.floor(indexed.length / 3));
        const planning = [...indexed]
            .sort((left, right) => right.structure - left.structure)
            .slice(0, planningCount);
        planning.forEach((item) => typeByKey.set(item.key, 'planning'));

        const remaining = indexed.filter((item) => !typeByKey.has(item.key));
        const citizen = [...remaining]
            .sort((left, right) => (left.structure + left.facility) - (right.structure + right.facility))
            .slice(0, citizenCount);
        citizen.forEach((item) => typeByKey.set(item.key, 'citizen'));
        remaining
            .filter((item) => !typeByKey.has(item.key))
            .forEach((item) => typeByKey.set(item.key, 'facility'));
    }

    const districtSequenceByType = new Map(PRACTICE_TYPE_ORDER.map((type) => [type, 0]));

    return indexed.map(({ candidate, index, key }) => {
        const practiceType = typeByKey.get(key) || 'facility';
        const meta = PRACTICE_TYPE_META[practiceType];
        const rank = numeric(candidate.rank, index + 1);
        const districtNumber = (districtSequenceByType.get(practiceType) || 0) + 1;
        districtSequenceByType.set(practiceType, districtNumber);
        const originalName = candidate.parcelCandidateName || candidate.name || `필지 후보 ${String(rank).padStart(2, '0')}`;
        return {
            ...candidate,
            name: `${meta.districtLabel} ${String(districtNumber).padStart(2, '0')}`,
            parcelCandidateName: originalName,
            districtNumber,
            practiceType,
            practiceTypeLabel: meta.label,
            practiceTypeDescription: meta.shortDescription,
            practiceTypeColor: meta.color,
            practiceTypeFillColor: meta.fillColor,
            classificationVersion: 'sample-v1',
            classificationRule: '공간 규모 상위 약 1/3=계획행정수단, 잔여 후보 중 Risk 집중군=시설지원사업, 소규모 생활권=시민실천',
            classificationReason: reasonFor(practiceType, candidate, hazard)
        };
    });
}
