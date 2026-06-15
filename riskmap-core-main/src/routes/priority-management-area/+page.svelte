<script>
    import { base } from '$app/paths';
    import SelectedRegionMap from '$lib/maps/SelectedRegionMap.svelte';
    import REGION_CSV from '../../../../shared/data/administrative-regions/sido_sgg_codes.csv?raw';

    function parseCsv(text) {
        return text
            .trim()
            .split(/\r?\n/)
            .slice(1)
            .map((line) => line.split(',').map((value) => value.trim()));
    }

    const regions = parseCsv(REGION_CSV)
        .map(([sido, fullName, code]) => ({
            sido,
            fullName,
            code,
            sigungu: fullName.replace(`${sido} `, '')
        }))
        .filter((region) => region.sido && region.fullName && region.code);
    const sidos = Array.from(new Set(regions.map((region) => region.sido)));

    let selectedSido = $state('경기도');
    let selectedRegionCode = $state('41110');
    let availableRegions = $derived(regions.filter((region) => region.sido === selectedSido));
    let selectedRegion = $derived(
        regions.find((region) => region.code === selectedRegionCode) || availableRegions[0]
    );

    function changeSido(event) {
        selectedSido = event.currentTarget.value;
        selectedRegionCode = regions.find((region) => region.sido === selectedSido)?.code || '';
    }

    function toolUrl(path) {
        const params = new URLSearchParams({
            regionCode: selectedRegion?.code || '',
            regionName: selectedRegion?.fullName || ''
        });
        return `${base}/priority-management-area/${path}?${params.toString()}`;
    }
</script>

<svelte:head>
    <title>중점관리구역 선정 지원도구</title>
</svelte:head>

<main>
    <header>
        <span>Priority Management Area</span>
        <h1>중점관리구역 선정 지원도구</h1>
        <p>분석할 지자체와 재해 유형을 선택하세요. 행정구역 코드는 공통 데이터와 자동으로 매칭됩니다.</p>
    </header>

    <section class="region-panel">
        <div>
            <label for="sido">시도</label>
            <select id="sido" value={selectedSido} onchange={changeSido}>
                {#each sidos as sido}
                    <option value={sido}>{sido}</option>
                {/each}
            </select>
        </div>
        <div>
            <label for="sigungu">시군구</label>
            <select id="sigungu" bind:value={selectedRegionCode}>
                {#each availableRegions as region}
                    <option value={region.code}>{region.sigungu}</option>
                {/each}
            </select>
        </div>
        <dl>
            <div><dt>선택 지역</dt><dd>{selectedRegion?.fullName}</dd></div>
            <div><dt>행정구역 코드</dt><dd>{selectedRegion?.code}</dd></div>
        </dl>
    </section>

    <section class="map-panel">
        <div>
            <h2>선택 지역 미리보기</h2>
            <p>공통 시군구 중심 좌표로 이동하며, OpenStreetMap 베이스맵 위에 VWorld 행정경계를 표시합니다.</p>
        </div>
        <SelectedRegionMap
            regionCode={selectedRegion?.code}
            regionName={selectedRegion?.fullName}
            height="360px"
        />
    </section>

    <section class="hazards">
        <a href={toolUrl('heatwave')}>
            <span class="icon heat">☀</span>
            <small>현재 샘플 제공</small>
            <h2>폭염</h2>
            <p>기후위험·노출·취약성 지표를 결합하여 폭염 중점관리구역을 선정합니다.</p>
            <strong>폭염 분석 시작 →</strong>
        </a>
        <a href={toolUrl('flood')}>
            <span class="icon flood">≋</span>
            <small>구조 준비 완료</small>
            <h2>홍수</h2>
            <p>침수위험, 노출 인구, 취약시설 데이터를 활용할 홍수 분석 도구입니다.</p>
            <strong>홍수 분석 열기 →</strong>
        </a>
    </section>
</main>

<style>
    main { min-height: 100vh; padding: 4rem max(1.5rem, calc((100vw - 1120px) / 2)); background: #f4f7fb; color: #10233f; font-family: Pretendard, Arial, sans-serif; }
    header { max-width: 760px; margin-bottom: 2rem; }
    header span, small { color: #16734b; font-weight: 700; }
    h1 { margin: .75rem 0; font-size: clamp(2rem, 4vw, 3.25rem); }
    p { color: #5b6c82; line-height: 1.7; }
    .region-panel { display: grid; grid-template-columns: 1fr 1fr 1.3fr; gap: 1rem; padding: 1.5rem; border: 1px solid #d9e2ec; border-radius: 1rem; background: white; }
    label, dt { display: block; margin-bottom: .5rem; color: #53647a; font-size: .85rem; font-weight: 700; }
    select { width: 100%; padding: .8rem; border: 1px solid #cbd7e4; border-radius: .55rem; background: white; font: inherit; }
    dl { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; margin: 0; padding: .25rem 0 0 1rem; border-left: 1px solid #e0e7ef; }
    dd { margin: 0; font-weight: 700; }
    .map-panel { display: grid; grid-template-columns: minmax(220px, .7fr) minmax(0, 1.5fr); gap: 1.25rem; margin-top: 1.5rem; padding: 1.25rem; border: 1px solid #d9e2ec; border-radius: 1rem; background: white; }
    .map-panel h2 { margin-top: .25rem; }
    .hazards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.25rem; margin-top: 1.5rem; }
    .hazards a { padding: 2rem; border: 1px solid #d9e2ec; border-radius: 1rem; background: white; color: inherit; text-decoration: none; box-shadow: 0 .8rem 2rem rgb(15 36 64 / 6%); transition: transform 160ms ease; }
    .hazards a:hover { transform: translateY(-3px); }
    .icon { display: grid; width: 3.5rem; height: 3.5rem; margin-bottom: 1rem; place-items: center; border-radius: 1rem; color: white; font-size: 2rem; }
    .heat { background: #e9713f; }
    .flood { background: #3978ba; }
    h2 { margin: .5rem 0; font-size: 1.65rem; }
    strong { color: #004494; }
    @media (max-width: 760px) { .region-panel, .map-panel, .hazards { grid-template-columns: 1fr; } dl { padding-left: 0; border-left: 0; } }
</style>
