<script>
    import { base } from '$app/paths';
    import { onMount } from 'svelte';

    const labels = {
        lst_hot_observation_frequency_35c: '35℃ 이상 지표면온도 관측빈도',
        lst_summer_p90: '여름철 지표면온도 상위 10%',
        lst_annual_summer_p90: '연도별 여름철 지표면온도 상위 10% 평균',
        lst_summer_p90_trend: '여름철 고온 추세',
        ndbi_summer_median: '여름철 시가화지수 중앙값',
        ndmi_summer_dry: '여름철 건조도',
        ndvi_summer_cover_frequency: '여름철 식생피복 빈도',
        mndwi_summer_wet_frequency: '여름철 수분·습지 빈도',
        built_surface_probability: '건축 표면 확률',
        bare_surface_probability: '나지 표면 확률',
        tree_cover_probability: '수목 피복 확률',
        green_cover_probability: '녹지 피복 확률',
        water_wetland_probability: '수역·습지 확률',
        elevation: '고도',
        slope: '경사도',
        aspect: '사면향'
    };

    let manifest = null;
    let error = '';

    onMount(async () => {
        try {
            const response = await fetch(`${base}/analysis-data/national/gee-indicator-manifest.json`);
            if (!response.ok) throw new Error(`현황자료 응답 오류 (${response.status})`);
            manifest = await response.json();
        } catch (loadError) {
            error = loadError instanceof Error ? loadError.message : '전국 지표 현황을 불러오지 못했습니다.';
        }
    });

    $: indicators = manifest?.indicators || [];
    $: completed = indicators.filter((item) => item.status === 'COMPLETED');
    $: totalBytes = completed.reduce((sum, item) => sum + Number(item.sizeBytes || 0), 0);
    $: progress = indicators.length ? Math.round((completed.length / indicators.length) * 100) : 0;

    function sizeLabel(bytes) {
        const value = Number(bytes || 0);
        return value >= 1024 ** 2 ? `${(value / 1024 ** 2).toFixed(1)} MiB` : `${(value / 1024).toFixed(1)} KiB`;
    }

    function dateLabel(value) {
        if (!value) return '기존 완료자료';
        return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' }).format(new Date(value));
    }
</script>

<svelte:head>
    <title>전국 100m 지표 구축 현황 | Climate Risk Lab</title>
    <meta name="description" content="전국 100m 기후·환경·지형 지표의 GEE 생성 및 검증 현황" />
</svelte:head>

<main>
    <header>
        <div class="header-inner">
            <div>
                <span class="eyebrow">NATIONAL 100M INDICATOR BUILD</span>
                <h1>전국 100m 지표 구축 현황</h1>
                <p>계획·최적화 실험실 확장을 위해 생성한 위성·토지피복·지형 지표의 공개 검토용 현황입니다.</p>
            </div>
            <nav>
                <a href={`${base}/climate-hazard-lab`}>전국 기후위험 실험실</a>
                <a href={`${base}/`}>지원도구로 돌아가기</a>
            </nav>
        </div>
    </header>

    {#if error}
        <section class="message error">{error}</section>
    {:else if !manifest}
        <section class="message">현황자료를 불러오는 중입니다.</section>
    {:else}
        <section class="summary">
            <article><span>전체 진행률</span><strong>{progress}%</strong><small>{completed.length}/{indicators.length}개 완료</small></article>
            <article><span>공간해상도</span><strong>{manifest.scaleMeters}m</strong><small>{manifest.crs}</small></article>
            <article><span>분석기간</span><strong>{manifest.landsatPeriod?.startYear}–{manifest.landsatPeriod?.endYear}</strong><small>6–9월 여름철</small></article>
            <article><span>검증 데이터</span><strong>{sizeLabel(totalBytes)}</strong><small>MD5·파일크기 기록</small></article>
        </section>

        <section class="notice">
            <div><b>공개 범위</b><p>이 페이지는 지표 생성 상태와 검증 메타데이터를 공유합니다. 원본 GeoTIFF는 약 100m 전국 격자 자료로 별도 저장하며 GitHub Pages에는 포함하지 않습니다.</p></div>
            <div><b>자료 성격</b><p>현재 자료는 계획·최적화 기능 검증용 구축본입니다. 정책 적용 전 산식, 결측처리, 정확도와 최신성에 대한 추가 검토가 필요합니다.</p></div>
        </section>

        <section class="catalog">
            <div class="section-title"><div><span>INDICATOR CATALOG</span><h2>완료 지표 목록</h2></div><time>최종 갱신 {dateLabel(manifest.updatedAt)}</time></div>
            <div class="grid">
                {#each indicators as item, index}
                    <article>
                        <div class="card-top"><span class="number">{String(index + 1).padStart(2, '0')}</span><span class:done={item.status === 'COMPLETED'} class="status">{item.status === 'COMPLETED' ? '완료' : item.status}</span></div>
                        <h3>{labels[item.id] || item.id}</h3>
                        <code>{item.id}</code>
                        <dl>
                            <div><dt>파일</dt><dd>{item.file}</dd></div>
                            <div><dt>크기</dt><dd>{sizeLabel(item.sizeBytes)}</dd></div>
                            <div><dt>완료</dt><dd>{dateLabel(item.completedAt)}</dd></div>
                            <div><dt>MD5</dt><dd class="hash">{item.md5}</dd></div>
                        </dl>
                    </article>
                {/each}
            </div>
        </section>
    {/if}
</main>

<style>
    :global(body){margin:0;background:#f2f5f4;color:#17312f;font-family:Inter,Pretendard,"Noto Sans KR",Arial,sans-serif}main{min-height:100vh}header{background:linear-gradient(125deg,#102f2d,#17685e);color:white}.header-inner{max-width:1280px;margin:auto;padding:52px 28px;display:flex;justify-content:space-between;gap:30px;align-items:end}.eyebrow,.section-title span{font-size:11px;font-weight:900;letter-spacing:.14em;color:#9ee4cd}h1{margin:10px 0 12px;font:700 40px/1.15 Georgia,"Noto Serif KR",serif}header p{max-width:760px;margin:0;color:#d5e8e3;line-height:1.7}nav{display:flex;flex-wrap:wrap;gap:8px}nav a{border:1px solid #ffffff55;border-radius:7px;color:white;padding:10px 13px;text-decoration:none;font-size:12px;font-weight:800}.summary,.notice,.catalog,.message{max-width:1280px;margin-left:auto;margin-right:auto}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:28px}.summary article{border:1px solid #d7e2df;border-radius:12px;background:white;padding:20px;box-shadow:0 10px 24px #163d3510}.summary span,.summary small{display:block;color:#6e817d;font-size:11px;font-weight:800}.summary strong{display:block;margin:9px 0 5px;color:#17685e;font-size:28px}.notice{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:0 28px}.notice div{border-left:3px solid #d28843;background:#fff9f1;padding:15px 17px}.notice b{font-size:12px;color:#9b5525}.notice p{margin:5px 0 0;color:#685e55;font-size:12px;line-height:1.6}.catalog{padding:38px 28px 70px}.section-title{display:flex;justify-content:space-between;align-items:end;margin-bottom:18px}.section-title span{color:#17705f}.section-title h2{margin:5px 0 0;font-size:26px}.section-title time{color:#71827e;font-size:11px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.grid article{min-width:0;border:1px solid #d9e3e0;border-radius:12px;background:white;padding:17px;box-shadow:0 8px 18px #163d350b}.card-top{display:flex;justify-content:space-between}.number{color:#9aaaa7;font-size:11px;font-weight:900}.status{border-radius:999px;background:#f1f5f4;color:#647773;padding:4px 8px;font-size:9px;font-weight:900}.status.done{background:#e4f7ef;color:#08755f}.grid h3{margin:14px 0 5px;font-size:16px}.grid code{color:#657a76;font-size:10px}.grid dl{display:grid;gap:7px;margin:15px 0 0;border-top:1px solid #edf1f0;padding-top:12px}.grid dl div{display:grid;grid-template-columns:42px minmax(0,1fr);gap:8px;font-size:10px}.grid dt{color:#83918e;font-weight:800}.grid dd{margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#334d48}.hash{font-family:monospace}.message{padding:80px 28px;text-align:center}.error{color:#b42318}@media(max-width:900px){.header-inner{align-items:start;flex-direction:column}.summary{grid-template-columns:1fr 1fr}.grid{grid-template-columns:1fr 1fr}}@media(max-width:600px){h1{font-size:31px}.summary,.notice,.grid{grid-template-columns:1fr}.section-title{align-items:start;flex-direction:column;gap:8px}}
</style>
