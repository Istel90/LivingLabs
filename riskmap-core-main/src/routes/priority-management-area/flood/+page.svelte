<script>
    import { onMount } from 'svelte';
    import { base } from '$app/paths';
    import SelectedRegionMap from '$lib/maps/SelectedRegionMap.svelte';

    let regionName = '지자체 미선택';
    let regionCode = '-';

    onMount(() => {
        const params = new URLSearchParams(window.location.search);
        regionName = params.get('regionName') || regionName;
        regionCode = params.get('regionCode') || regionCode;
    });
</script>

<svelte:head>
    <title>홍수 중점관리구역 선정</title>
</svelte:head>

<main>
    <section>
        <span>준비 중</span>
        <h1>홍수 중점관리구역 선정</h1>
        <dl>
            <div><dt>선택 지역</dt><dd>{regionName}</dd></div>
            <div><dt>행정구역 코드</dt><dd>{regionCode}</dd></div>
        </dl>
        <SelectedRegionMap {regionCode} {regionName} height="400px" />
        <p>침수위험도, 저지대 인구, 취약시설, 배수 인프라 데이터를 연결할 분석 화면입니다.</p>
        <a href={`${base}/priority-management-area`}>재해 유형 선택으로 돌아가기</a>
    </section>
</main>

<style>
    main { min-height: 100vh; display: grid; padding: 2rem; place-items: center; background: #f4f7fb; font-family: Pretendard, Arial, sans-serif; }
    section { width: min(920px, 100%); padding: 3rem; border: 1px solid #dce4ee; border-radius: 1rem; background: white; color: #10233f; }
    span { display: inline-block; padding: .35rem .75rem; border-radius: 999px; background: #e8f1fa; color: #2869a8; font-weight: 700; }
    h1 { margin: 1rem 0; }
    dl { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; padding: 1rem; border-radius: .75rem; background: #f5f8fb; }
    dt { color: #65768b; font-size: .85rem; }
    dd { margin: .25rem 0 0; font-weight: 700; }
    p { color: #53647a; line-height: 1.7; }
    a { color: #004494; font-weight: 700; }
</style>
