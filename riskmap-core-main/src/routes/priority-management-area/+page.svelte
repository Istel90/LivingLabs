<script>
    import { base } from '$app/paths';
    import { portalToolsUrl } from '$lib/portalLinks.js';
    import SelectedRegionMap from '$lib/maps/SelectedRegionMap.svelte';
    import {
        getRegionByCode,
        getRegionOptionsBySido,
        getSigunguLabel,
        regionOptions,
        sidos
    } from '$lib/data/administrativeRegions.js';

    let selectedSido = $state('경기도');
    let selectedRegionCode = $state('41110');

    let availableRegions = $derived(getRegionOptionsBySido(selectedSido));
    let selectedRegion = $derived(
        getRegionByCode(selectedRegionCode) || availableRegions[0] || regionOptions[0]
    );

    function changeSido(event) {
        selectedSido = event.currentTarget.value;
        selectedRegionCode = getRegionOptionsBySido(selectedSido)[0]?.code || '';
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
    <section class="hero">
        <div class="container">
            <nav class="topbar" aria-label="도구 상단 메뉴">
                <a class="back" href={portalToolsUrl}>지원도구 페이지로 돌아가기</a>
                <span class="badge">Priority Management Area</span>
            </nav>

            <div class="hero-grid">
                <div class="hero-copy">
                    <span class="eyebrow">공간 분석 기반 의사결정</span>
                    <h1>중점관리구역 선정<br />지원도구</h1>
                    <p>
                        분석할 지자체와 재해 유형을 선택하면 공통 행정경계 데이터와 연결해
                        대상지역을 확인하고, 폭염과 홍수 등 재해별 중점관리구역 분석으로 이동합니다.
                    </p>
                </div>

                <div class="region-card" id="region-select">
                    <div class="field">
                        <label for="sido">시도</label>
                        <select id="sido" value={selectedSido} onchange={changeSido}>
                            {#each sidos as sido}
                                <option value={sido}>{sido}</option>
                            {/each}
                        </select>
                    </div>
                    <div class="field">
                        <label for="sigungu">시군구</label>
                        <select id="sigungu" bind:value={selectedRegionCode}>
                            {#each availableRegions as region}
                                <option value={region.code}>{getSigunguLabel(region)}</option>
                            {/each}
                        </select>
                    </div>
                    <dl>
                        <div>
                            <dt>선택 지역</dt>
                            <dd>{selectedRegion?.fullName}</dd>
                        </div>
                        <div>
                            <dt>행정구역 코드</dt>
                            <dd>{selectedRegion?.code}</dd>
                        </div>
                    </dl>
                </div>
            </div>
        </div>
    </section>

    <section class="content container">
        <div class="feature-strip">
            <article>
                <span>01</span>
                <strong>행정경계 연계</strong>
                <p>전국 시군구 경계를 공통 데이터로 관리하고, 시 전체와 구 단위 선택을 함께 지원합니다.</p>
            </article>
            <article>
                <span>02</span>
                <strong>재해 유형 선택</strong>
                <p>폭염, 홍수, 생태계 부문별로 같은 H/E/V 기반 후보지 도출 구조를 제공합니다.</p>
            </article>
            <article>
                <span>03</span>
                <strong>지도 기반 검토</strong>
                <p>선택지역 외곽선을 지도에 직접 표시해 분석 대상 범위를 먼저 확인합니다.</p>
            </article>
        </div>

        <section class="decision-layout" aria-label="대상지역 지도와 재해 유형 선택">
            <section class="map-panel" id="region-preview">
                <div class="map-wrap">
                    <SelectedRegionMap
                        regionCode={selectedRegion?.code}
                        regionName={selectedRegion?.fullName}
                        height="430px"
                        showCadastral={false}
                        locked={true}
                    />
                </div>
            </section>

            <section class="hazards" aria-label="재해 유형 선택">
                <a class="hazard heat" href={toolUrl('heatwave')}>
                    <span class="icon">☀</span>
                    <small>현재 샘플 제공</small>
                    <h2>폭염</h2>
                    <p>기후위험, 노출, 취약성 지표를 결합해 폭염 중점관리구역을 선정합니다.</p>
                    <strong>폭염 분석 시작 →</strong>
                </a>
                <a class="hazard flood" href={toolUrl('flood')}>
                    <span class="icon">≋</span>
                    <small>구조 준비 완료</small>
                    <h2>홍수</h2>
                    <p>침수위험, 노출 인구, 취약시설 데이터를 연결하는 홍수 분석 화면입니다.</p>
                    <strong>홍수 분석 열기 →</strong>
                </a>
                <a class="hazard ecosystem" href={toolUrl('ecosystem')}>
                    <span class="icon">◇</span>
                    <small>구조 준비 완료</small>
                    <h2>생태계</h2>
                    <p>생태축, 토지피복, 서식지 민감도 데이터를 연결할 생태계 분석 화면입니다.</p>
                    <strong>생태계 분석 열기 →</strong>
                </a>
            </section>
        </section>
    </section>
</main>

<style>
    :global(body) {
        margin: 0;
        background: #f3f8f8;
        color: #0f172a;
        font-family: Pretendard, "Noto Sans KR", Arial, sans-serif;
    }

    .container {
        width: min(1180px, calc(100vw - 3rem));
        margin: 0 auto;
    }

    .hero {
        position: relative;
        overflow: hidden;
        background:
            radial-gradient(circle at 82% 20%, rgb(19 116 152 / 34%), transparent 34rem),
            linear-gradient(135deg, #073b52 0%, #064a55 48%, #0f766e 100%);
        color: white;
        padding: 1.25rem 0 6rem;
    }

    .hero::after {
        position: absolute;
        inset: auto -10% -45% 42%;
        height: 28rem;
        content: "";
        border-radius: 999px;
        background: rgb(16 185 129 / 18%);
        filter: blur(70px);
    }

    .topbar {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 2.6rem;
        border: 1px solid rgb(255 255 255 / 18%);
        border-radius: 1.1rem;
        background: linear-gradient(90deg, rgb(4 47 63 / 86%), rgb(8 82 94 / 72%));
        box-shadow: 0 1rem 2.5rem rgb(0 0 0 / 18%);
        padding: .65rem .8rem;
        backdrop-filter: blur(14px);
    }

    .back,
    .badge {
        display: inline-flex;
        align-items: center;
        border: 1px solid rgb(255 255 255 / 28%);
        border-radius: 999px;
        background: rgb(255 255 255 / 16%);
        color: white;
        font-size: .85rem;
        font-weight: 800;
        text-decoration: none;
        padding: .7rem 1rem;
    }

    .badge {
        color: #baf7df;
    }

    .hero-grid {
        position: relative;
        z-index: 1;
        display: grid;
        grid-template-columns: minmax(0, 1.1fr) minmax(360px, .75fr);
        gap: 2rem;
        align-items: end;
    }

    .eyebrow {
        display: inline-flex;
        margin-bottom: 1rem;
        border-radius: 999px;
        background: rgb(255 255 255 / 12%);
        color: #7df0c3;
        font-size: .8rem;
        font-weight: 900;
        letter-spacing: .02em;
        padding: .55rem .85rem;
    }

    h1 {
        max-width: 760px;
        margin: 0;
        font-size: clamp(2.5rem, 5vw, 4.6rem);
        line-height: 1.05;
        letter-spacing: -0.06em;
    }

    .hero-copy h1 {
        color: #ffffff;
        text-shadow: 0 .25rem 1.5rem rgb(0 0 0 / 22%);
    }

    .hero-copy p {
        max-width: 720px;
        margin: 1.4rem 0 0;
        color: rgb(255 255 255 / 92%);
        font-size: 1.08rem;
        line-height: 1.85;
        text-shadow: 0 .1rem .75rem rgb(0 0 0 / 18%);
    }

    .hero-actions {
        display: flex;
        flex-wrap: wrap;
        gap: .8rem;
        margin-top: 2rem;
    }

    .hero-actions a {
        border-radius: .9rem;
        background: #10d59a;
        color: #042f2e;
        font-weight: 900;
        text-decoration: none;
        padding: .95rem 1.2rem;
    }

    .hero-actions .secondary {
        border: 1px solid rgb(255 255 255 / 22%);
        background: rgb(255 255 255 / 10%);
        color: white;
    }

    .region-card {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
        border: 1px solid rgb(255 255 255 / 18%);
        border-radius: 1.5rem;
        background: rgb(255 255 255 / 94%);
        box-shadow: 0 1.5rem 4rem rgb(0 0 0 / 20%);
        color: #10233f;
        padding: 1.25rem;
    }

    .field label,
    dt {
        display: block;
        margin-bottom: .5rem;
        color: #64748b;
        font-size: .82rem;
        font-weight: 900;
    }

    select {
        width: 100%;
        border: 1px solid #d9e4ee;
        border-radius: .9rem;
        background: #f8fafc;
        color: #10233f;
        font: inherit;
        font-weight: 800;
        padding: .9rem;
    }

    dl {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: .8rem;
        margin: 0;
    }

    dl div {
        border-radius: 1rem;
        background: #ecfdf5;
        padding: .9rem;
    }

    dd {
        margin: 0;
        font-size: 1rem;
        font-weight: 900;
    }

    .content {
        position: relative;
        z-index: 2;
        margin-top: -3.3rem;
        padding-bottom: 5rem;
    }

    .feature-strip {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        overflow: hidden;
        border-radius: 1.25rem;
        background: white;
        box-shadow: 0 1.25rem 3.5rem rgb(15 36 64 / 12%);
    }

    .feature-strip article {
        min-height: 6.2rem;
        border-right: 1px solid #e6edf3;
        padding: 1.2rem;
    }

    .feature-strip article:last-child {
        border-right: 0;
    }

    .feature-strip span {
        color: #059669;
        font-size: .92rem;
        font-weight: 950;
    }

    .feature-strip strong {
        display: block;
        margin-top: .3rem;
        color: #0f172a;
        font-size: 1.05rem;
    }

    .feature-strip p {
        margin: .35rem 0 0;
        color: #64748b;
        font-size: .88rem;
        line-height: 1.6;
    }

    .decision-layout {
        display: grid;
        grid-template-columns: minmax(0, 1.45fr) minmax(320px, .72fr);
        gap: 1.25rem;
        align-items: stretch;
        margin-top: 1.5rem;
    }

    .map-panel {
        margin-top: 1.5rem;
        border: 1px solid #e0e8ef;
        border-radius: 1.5rem;
        background: white;
        box-shadow: 0 .9rem 2.5rem rgb(15 36 64 / 8%);
        padding: 1.25rem;
    }

    .decision-layout .map-panel {
        margin-top: 0;
        min-width: 0;
    }

    .map-copy {
        border-radius: 1.25rem;
        background: #f1fbf8;
        padding: 1.3rem;
    }

    .map-copy .eyebrow {
        background: #dff8ef;
        color: #047857;
    }

    h2 {
        margin: .1rem 0 .65rem;
        color: #0f172a;
        font-size: 1.75rem;
        letter-spacing: -0.04em;
    }

    .map-copy p,
    .hazard p {
        color: #64748b;
        line-height: 1.75;
    }

    ul {
        margin: 1rem 0 0;
        padding-left: 1rem;
        color: #334155;
        line-height: 1.9;
    }

    .map-wrap {
        overflow: hidden;
        border: 1px solid #dbe7ee;
        border-radius: 1.25rem;
        background: #eaf5f6;
    }

    .hazards {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1.25rem;
        margin-top: 1.5rem;
    }

    .decision-layout .hazards {
        grid-template-columns: 1fr;
        margin-top: 0;
    }

    .hazard {
        position: relative;
        overflow: hidden;
        min-height: 17rem;
        border-radius: 1.5rem;
        color: white;
        text-decoration: none;
        padding: 2rem;
        box-shadow: 0 1rem 2.5rem rgb(15 36 64 / 12%);
        transition: transform 160ms ease, box-shadow 160ms ease;
    }

    .decision-layout .hazard {
        min-height: 0;
        padding: 1.55rem;
    }

    .hazard:hover {
        transform: translateY(-4px);
        box-shadow: 0 1.5rem 3.5rem rgb(15 36 64 / 18%);
    }

    .hazard::after {
        position: absolute;
        inset: auto -10% -30% 35%;
        height: 15rem;
        content: "";
        border-radius: 999px;
        background: rgb(255 255 255 / 14%);
    }

    .hazard.heat {
        background: linear-gradient(135deg, #0f766e, #0ea5a3);
    }

    .hazard.flood {
        background: linear-gradient(135deg, #0f4c81, #2563eb);
    }

    .hazard.ecosystem {
        background: linear-gradient(135deg, #166534, #65a30d);
    }

    .icon {
        display: grid;
        width: 3.4rem;
        height: 3.4rem;
        place-items: center;
        border-radius: 1rem;
        background: rgb(255 255 255 / 16%);
        font-size: 2rem;
    }

    .hazard small {
        display: block;
        margin-top: 1.2rem;
        color: rgb(255 255 255 / 78%);
        font-weight: 900;
    }

    .decision-layout .hazard small {
        margin-top: .9rem;
    }

    .hazard h2 {
        color: white;
        font-size: 2rem;
    }

    .decision-layout .hazard h2 {
        margin-bottom: .45rem;
        font-size: 1.75rem;
    }

    .hazard p {
        color: rgb(255 255 255 / 78%);
    }

    .hazard strong {
        position: relative;
        z-index: 1;
        color: white;
    }

    @media (max-width: 900px) {
        .hero-grid,
        .decision-layout,
        .hazards,
        .feature-strip,
        .region-card,
        dl {
            grid-template-columns: 1fr;
        }

        .feature-strip article {
            border-right: 0;
            border-bottom: 1px solid #e6edf3;
        }

        .feature-strip article:last-child {
            border-bottom: 0;
        }
    }
</style>
