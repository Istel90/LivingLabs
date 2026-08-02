<script>
    let {
        catalog,
        budget = 1000,
        onBudgetChange = () => {}
    } = $props();
</script>

<div class="budget-control">
    <label>
        총예산
        <div class="budget-input">
            <input
                type="number"
                min="0"
                max="100000"
                step="10"
                value={budget}
                oninput={(event) => onBudgetChange(Number(event.currentTarget.value))}
            />
            <span>백만원</span>
        </div>
    </label>
    <small>입력한 예산 안에서 사업별 단가와 다목적 점수를 적용해 물량을 배분합니다.</small>
</div>

<div class="objective-box">
    <span>다목적 가치</span>
    <div><i>체감·기온저감</i><b>{catalog.weights.cooling}%</b></div>
    <div><i>형평성</i><b>{catalog.weights.equity}%</b></div>
    <div><i>위험감소</i><b>{catalog.weights.risk}%</b></div>
    <div><i>접근성</i><b>{catalog.weights.access}%</b></div>
</div>

<div class="project-catalog">
    <div class="project-title"><span>현재 적용 가능한 폭염 적응사업</span><small>향후 ‘적응사업 설계’에서 추가</small></div>
    {#each catalog.projects as project}
        <div class="project-row">
            <span class="dot" style={`--project-color:${project.color}`}></span>
            <div><b>{project.name}</b><small>{project.effectLabel}</small></div>
            <strong>{project.unitCost.toLocaleString()}백만원/{project.unit}</strong>
        </div>
    {/each}
</div>

<style>
    .budget-control{display:grid;gap:5px;margin:10px 0}.budget-control label{color:#71837c;font-size:9px;font-weight:800}.budget-control>small{color:#657a74;font-size:8px;line-height:1.45}.budget-input{display:grid;grid-template-columns:1fr auto;align-items:center;margin-top:5px;border:1px solid #cad4cc;border-radius:5px;background:white;overflow:hidden}.budget-input input{width:100%;box-sizing:border-box;border:0!important;margin:0!important;padding:9px!important}.budget-input span{padding:0 9px;color:#315e56;font-size:9px;font-weight:800}.objective-box{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin:10px 0;border:1px solid #dce5e2;border-radius:6px;padding:9px}.objective-box>span{grid-column:1/-1;color:#687c77;font-size:8px;font-weight:800}.objective-box div{display:flex;justify-content:space-between;border-radius:4px;background:#f7faf8;padding:5px}.objective-box i{color:#667b75;font-size:8px;font-style:normal}.objective-box b{color:#174d45;font-size:9px}.project-catalog{display:grid;gap:4px;margin:10px 0;max-height:178px;overflow:auto}.project-title{display:flex;justify-content:space-between;align-items:end;padding-bottom:4px}.project-title span{color:#687c77;font-size:8px;font-weight:800}.project-title small{color:#a45a42;font-size:7px}.project-row{display:grid;grid-template-columns:9px 1fr auto;align-items:center;gap:6px;border:1px solid #e0e7e4;border-radius:5px;background:#fafcfb;padding:6px}.dot{width:8px;height:8px;border-radius:50%;background:var(--project-color)}.project-row div{display:grid;gap:1px}.project-row b{font-size:8px}.project-row small{color:#738680;font-size:7px}.project-row strong{color:#315e56;font-size:7px;white-space:nowrap}
</style>
