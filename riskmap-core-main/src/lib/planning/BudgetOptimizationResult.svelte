<script>
    let { result = null, mode = 'spatial', pathway = [] } = $props();
</script>

<article class="result-panel">
    <header>
        <div><span>BUDGET-BASED MULTI-OBJECTIVE RESULT</span><h2>{mode === 'pathway' ? '적응사업 전환경로' : '사업 물량 · 공간배치'}</h2></div>
        <strong>{result ? '계산 결과' : '실행 전'}</strong>
    </header>

    {#if mode === 'pathway'}
        <div class="pathway">
            {#each pathway as step}
                <section><span>{step.stage}</span><div><small>{step.threshold}</small><b>{step.title}</b><p>도입: {step.activate.join(' · ')}</p><em>{step.transition}</em></div></section>
            {/each}
        </div>
    {:else if result}
        <div class="budget-line">
            <span>입력예산 <b>{result.budget.toLocaleString()}</b></span>
            <span>배정액 <b>{result.spent.toLocaleString()}</b></span>
            <span>잔액 <b>{result.remaining.toLocaleString()}</b> 백만원</span>
        </div>
        <div class="mix-grid">
            {#each result.allocations as item}
                <section>
                    <span class="dot" style={`--project-color:${item.color}`}></span>
                    <div><b>{item.name}</b><small>{item.effectLabel}</small></div>
                    <strong>{item.quantity.toLocaleString()}{item.unit}</strong>
                    <em>{item.cost.toLocaleString()}백만원</em>
                </section>
            {/each}
        </div>
        <div class="site-summary"><b>지도 배치 후보 {result.sites.length}개소</b><span>점에 마우스를 올리면 사업과 배정 물량을 확인할 수 있습니다.</span></div>
    {:else}
        <p class="guide">총예산을 입력하고 공간 최적화를 실행하면 사업별 물량과 배치점이 표시됩니다.</p>
    {/if}
</article>

<style>
    .result-panel{border:1px solid #d5dfdb;border-radius:8px;background:white;padding:14px}.result-panel header{display:flex;justify-content:space-between;align-items:start;margin-bottom:10px}.result-panel header span{font-size:8px;letter-spacing:.1em;color:#728780;font-weight:800}.result-panel h2{margin:3px 0 0;font-size:15px}.result-panel header>strong{border-radius:999px;background:#edf5f1;color:#18705f;padding:5px 8px;font-size:9px}.budget-line{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-bottom:8px}.budget-line span{display:grid;gap:2px;border-radius:5px;background:#edf4f1;padding:6px;color:#6b7e78;font-size:7px}.budget-line b{color:#173a37;font-size:10px}.mix-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px}.mix-grid section{display:grid;grid-template-columns:8px 1fr auto;gap:2px 6px;align-items:center;border:1px solid #dce5e2;border-radius:6px;background:#f8faf9;padding:7px}.dot{width:8px;height:8px;border-radius:50%;background:var(--project-color)}.mix-grid section div{display:grid;gap:2px}.mix-grid b{font-size:9px}.mix-grid small{color:#738680;font-size:7px}.mix-grid strong{color:#b84e31;font-size:11px}.mix-grid em{grid-column:3;color:#60736e;font-size:7px;font-style:normal}.site-summary{display:flex;justify-content:space-between;margin-top:9px;border-top:1px solid #e2e8e5;padding-top:8px}.site-summary b{font-size:9px}.site-summary span{color:#71837e;font-size:8px}.guide{display:grid;place-items:center;min-height:120px;color:#71837e;font-size:9px;text-align:center}.pathway{display:grid;gap:5px}.pathway section{display:grid;grid-template-columns:24px 1fr;gap:8px;border:1px solid #dce5e2;border-radius:6px;background:#f8faf9;padding:8px}.pathway section>span{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#18705f;color:white;font-size:9px}.pathway div{display:grid;gap:2px}.pathway small{color:#a44e35;font-size:8px}.pathway b{font-size:10px}.pathway p{margin:0;color:#6f817c;font-size:8px}.pathway em{color:#b84e31;font-size:8px;font-style:normal;font-weight:800}
</style>
