<script>
    import { base } from '$app/paths';
    import ClimateHazardLab from '$lib/tools/ClimateHazardLab.svelte';
</script>

<svelte:head>
    <title>전국 기후위험 실천권역 시연</title>
    <meta
        name="description"
        content="전국 H01~H10 기후위험 지표를 기반으로 리스크 분석과 유형별 실천권역 도출 과정을 확인하는 공개 시연 페이지"
    />
</svelte:head>

<aside class="demo-notice" aria-label="시연 페이지 안내">
    <div>
        <span>PUBLIC DEMO</span>
        <strong>전국 기후위험 → 리스크 분석 → 유형별 실천권역 도출</strong>
        <p>행정구역과 H01~H10 지표를 선택해 분석 흐름을 확인할 수 있습니다. 실천지구 유형 분류는 현재 아이디어 검증용 샘플 기준입니다.</p>
    </div>
    <nav aria-label="시연 관련 페이지">
        <a href={`${base}/national-indicator-status`}>지표 구축현황</a>
        <a href={`${base}/climate-hazard-lab`}>개발 실험실</a>
    </nav>
</aside>

<ClimateHazardLab hazard="heatwave" nationalLab={true} />

<style>
    .demo-notice {
        position: relative;
        z-index: 20;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
        padding: 14px clamp(18px, 3vw, 44px);
        color: #e8f4ff;
        background: linear-gradient(115deg, #102a43, #0b5d5e 58%, #117a65);
        border-bottom: 1px solid rgba(255, 255, 255, 0.2);
        box-shadow: 0 8px 26px rgba(15, 42, 67, 0.18);
    }

    .demo-notice div {
        min-width: 0;
    }

    .demo-notice span {
        display: inline-block;
        margin-right: 12px;
        padding: 3px 8px;
        border: 1px solid rgba(255, 255, 255, 0.45);
        border-radius: 999px;
        font-size: 0.68rem;
        font-weight: 800;
        letter-spacing: 0.12em;
    }

    .demo-notice strong {
        font-size: 0.96rem;
    }

    .demo-notice p {
        margin: 5px 0 0;
        color: rgba(232, 244, 255, 0.78);
        font-size: 0.78rem;
        line-height: 1.45;
    }

    .demo-notice nav {
        display: flex;
        flex: 0 0 auto;
        gap: 8px;
    }

    .demo-notice a {
        padding: 8px 11px;
        color: white;
        border: 1px solid rgba(255, 255, 255, 0.28);
        border-radius: 8px;
        font-size: 0.76rem;
        font-weight: 700;
        text-decoration: none;
        background: rgba(255, 255, 255, 0.08);
    }

    .demo-notice a:hover {
        background: rgba(255, 255, 255, 0.16);
    }

    @media (max-width: 760px) {
        .demo-notice {
            align-items: flex-start;
            flex-direction: column;
            gap: 10px;
        }

        .demo-notice strong {
            display: block;
            margin-top: 7px;
        }
    }
</style>
