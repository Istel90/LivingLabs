<script>
    import { onMount } from 'svelte';

    const portalToolsUrl = 'http://127.0.0.1:4173/tools';

    onMount(() => {
        window.location.replace(portalToolsUrl);
    });
</script>

<svelte:head>
    <title>지원도구 페이지로 이동 중</title>
    <meta http-equiv="refresh" content={`0; url=${portalToolsUrl}`} />
</svelte:head>

<main>
    <p>메인 포털의 지원도구 페이지로 이동 중입니다.</p>
    <a href={portalToolsUrl}>이동하지 않으면 여기를 클릭하세요.</a>
</main>

<style>
    main {
        min-height: 100vh;
        display: grid;
        place-content: center;
        gap: 0.75rem;
        text-align: center;
        font-family: Pretendard, Arial, sans-serif;
    }

    a {
        color: #004494;
        font-weight: 700;
    }
</style>

