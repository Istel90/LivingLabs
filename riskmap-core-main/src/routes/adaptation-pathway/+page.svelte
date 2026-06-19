<script>
    import { base } from '$app/paths';
    import { portalToolsUrl } from '$lib/portalLinks.js';
</script>

<svelte:head>
    <title>사업 적응경로 지원도구</title>
</svelte:head>

<main>
    <section>
        <a class="back-link" href={portalToolsUrl}>지원도구 페이지로 돌아가기</a>
        <span>준비 중</span>
        <h1>사업 적응경로 지원도구</h1>
        <p>
            기후위기 시나리오와 사업 성과를 바탕으로 단계별 적응경로를 구성하는 내부 도구입니다.
        </p>
        <p>공통 베이스맵, 행정경계, 인구 및 격자 데이터를 연계할 예정입니다.</p>
        <a class="primary-link" href={`${base}/priority-management-area/`}>중점관리구역 선정 지원도구로 이동</a>
    </section>
</main>

<style>
    main {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 2rem;
        background: #f4f7fb;
        font-family: Pretendard, Arial, sans-serif;
    }

    section {
        width: min(720px, 100%);
        padding: 3rem;
        border: 1px solid #dce4ee;
        border-radius: 1rem;
        background: white;
        box-shadow: 0 1rem 3rem rgb(15 36 64 / 8%);
    }

    span {
        display: inline-block;
        padding: 0.35rem 0.75rem;
        border-radius: 999px;
        background: #e8f3ee;
        color: #16734b;
        font-weight: 700;
    }

    .back-link {
        display: inline-flex;
        align-items: center;
        margin-bottom: 1.25rem;
        padding: 0.55rem 0.9rem;
        border: 1px solid #bae6fd;
        border-radius: 999px;
        background: #f0fdfa;
        color: #03695f;
        font-size: 0.85rem;
        font-weight: 800;
        text-decoration: none;
    }

    h1 {
        margin: 1rem 0;
        color: #10233f;
        font-size: 2rem;
    }

    p {
        color: #53647a;
        line-height: 1.7;
    }

    .primary-link {
        display: inline-block;
        margin-top: 1rem;
        color: #004494;
        font-weight: 700;
    }
</style>
