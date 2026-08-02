<script>
    let {
        projects = [],
        projectionSeries = [],
        metricLabel = '계획 판단지표',
        metricUnit = '',
        scenario = 'RCP45',
        result = null,
        mode = 'pathway'
    } = $props();

    const currentYear = 2026;
    const executionYears = [2026, 2027, 2028, 2029, 2030];
    const axisYears = [2026, 2030, 2050, 2060, 2070, 2080, 2090, 2100];
    const fallbackEndYears = { umbrella: 2050, shade: 2070, mist: 2080, shelter: 2090, coolroof: 2090, tree: 2100 };
    const xForYear = (year) => 142 + ((year - 2026) / (2100 - 2026)) * 794;
    const valueAtYear = (year) => {
        const ordered = [...projectionSeries].sort((a, b) => a.year - b.year);
        if (!ordered.length) return null;
        const exact = ordered.find((item) => item.year === year);
        if (exact) return exact.value;
        const left = [...ordered].reverse().find((item) => item.year < year) || ordered[0];
        const right = ordered.find((item) => item.year > year) || ordered.at(-1);
        if (!left || !right || left.year === right.year) return left?.value ?? null;
        return left.value + ((right.value - left.value) * ((year - left.year) / (right.year - left.year)));
    };
    const endYear = (project) => project.maxPathwayYear || fallbackEndYears[project.id] || 2100;
    const allocationFor = (projectId) => result?.allocations?.find((item) => item.id === projectId);
    const annualQuantity = (projectId, year) => {
        const quantity = Number(allocationFor(projectId)?.quantity || 0);
        const base = Math.floor(quantity / executionYears.length);
        const remainder = quantity % executionYears.length;
        return base + (executionYears.indexOf(year) < remainder ? 1 : 0);
    };
</script>

<section class="metro-panel">
    <header>
        <div><span>TEMPORAL OPTIMIZATION · ADAPTATION PATHWAY</span><h2>{mode === 'temporal' ? '최근 5년 실행순서와 2100 적응경로' : '적응사업 티핑포인트 매트로맵'}</h2></div>
        <strong>{metricLabel} = 적응목표</strong>
    </header>

    {#if mode === 'temporal'}
        <div class="five-year-window">
            <div class="window-copy"><b>시간 최적화 실행창</b><span>2026~2030년 · 총물량을 5개 연차에 분산</span></div>
            <div class="year-grid">
                {#each executionYears as executionYear}
                    <article>
                        <b>{executionYear}</b>
                        {#if result}
                            {#each projects as project}
                                {@const quantity = annualQuantity(project.id, executionYear)}
                                {#if quantity > 0}<span><i style={`--line:${project.color}`}></i>{project.name} {quantity}{project.unit}</span>{/if}
                            {/each}
                        {:else}<small>예산 기반 연차배분 실행 후 물량 표시</small>{/if}
                    </article>
                {/each}
            </div>
        </div>
    {/if}

    <div class="metro-wrap">
        <svg viewBox="0 0 1000 390" role="img" aria-labelledby="metro-title metro-desc">
            <title id="metro-title">{scenario} {metricLabel} 기반 적응사업별 최대 적용 가능 시점</title>
            <desc id="metro-desc">2026년부터 2100년까지 사업별 노선과 티핑포인트 종점을 표시합니다. 2026년부터 2030년은 시간 최적화 구간입니다.</desc>
            <rect class="five-year-band" x={xForYear(2026) - 12} y="30" width={xForYear(2030) - xForYear(2026) + 24} height="320" rx="10" />
            <text class="band-label" x={xForYear(2026)} y="49">5년 실행창</text>

            {#each axisYears as axisYear}
                <line class="axis-grid" x1={xForYear(axisYear)} y1="60" x2={xForYear(axisYear)} y2="350" />
                <text class="axis-label" x={xForYear(axisYear)} y="374" text-anchor="middle">{axisYear}</text>
            {/each}

            {#each projects as project, index}
                {@const y = 82 + index * 48}
                {@const terminalYear = endYear(project)}
                {@const terminalValue = valueAtYear(terminalYear)}
                <text class="route-label" x="126" y={y + 4} text-anchor="end">{project.name}</text>
                <path class="route-halo" d={`M ${xForYear(2026)} ${y} L ${xForYear(2030)} ${y} L ${xForYear(2050)} ${y} L ${xForYear(terminalYear)} ${y}`} />
                <path class="route-line" style={`--line:${project.color}`} d={`M ${xForYear(2026)} ${y} L ${xForYear(2030)} ${y} L ${xForYear(2050)} ${y} L ${xForYear(terminalYear)} ${y}`} />
                {#each axisYears.filter((axisYear) => axisYear <= terminalYear) as stationYear}
                    <circle class="station" style={`--line:${project.color}`} cx={xForYear(stationYear)} cy={y} r={stationYear === terminalYear ? 7 : 5}>
                        <title>{project.name} · {stationYear}년 {stationYear === terminalYear ? '적용 한계' : '운영 가능'}</title>
                    </circle>
                {/each}
                <rect class="terminal" style={`--line:${project.color}`} x={xForYear(terminalYear) - 6} y={y - 6} width="12" height="12" rx="2" />
                <text class="terminal-label" x={Math.min(940, xForYear(terminalYear) + 10)} y={y - 10} text-anchor={terminalYear >= 2090 ? 'end' : 'start'}>{terminalYear} 한계{terminalValue != null ? ` · ${terminalValue.toFixed(1)}${metricUnit}` : ''}</text>
            {/each}

            <line class="now-line" x1={xForYear(currentYear)} y1="55" x2={xForYear(currentYear)} y2="355" />
            <text class="now-label" x={xForYear(currentYear) + 5} y="68">현재</text>
        </svg>
    </div>
    <p class="assumption">■ 종점은 사업 단독으로 적응목표를 유지하기 어려워지는 가정 티핑포인트입니다. 종점 이후에는 상위 구조대책으로 전환합니다.</p>
</section>

<style>
    .metro-panel{margin-top:12px;border:1px solid #d5dfdb;border-radius:8px;background:white;padding:14px}.metro-panel header{display:flex;justify-content:space-between;align-items:start;margin-bottom:10px}.metro-panel header span{font-size:8px;letter-spacing:.12em;color:#728780;font-weight:800}.metro-panel h2{margin:3px 0 0;font-size:15px}.metro-panel header strong{border-radius:999px;background:#fff1e9;color:#a9472c;padding:6px 9px;font-size:9px}.five-year-window{margin-bottom:10px;border:1px solid #dce5e2;border-radius:7px;background:#f8faf9;padding:9px}.window-copy{display:flex;justify-content:space-between;margin-bottom:7px}.window-copy b{font-size:10px}.window-copy span{color:#6d817a;font-size:8px}.year-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:5px}.year-grid article{display:grid;align-content:start;gap:3px;min-height:78px;border-left:3px solid #d8e4df;background:white;padding:6px}.year-grid article>b{font-size:10px}.year-grid article span{display:flex;align-items:center;gap:4px;color:#536963;font-size:7px}.year-grid article i{width:6px;height:6px;border-radius:50%;background:var(--line);flex:none}.year-grid small{color:#82928d;font-size:7px;line-height:1.4}.metro-wrap{width:100%;overflow:hidden}.metro-wrap svg{display:block;width:100%;height:auto;min-height:300px}.five-year-band{fill:#eaf5f0}.band-label{fill:#2d6c5f;font-size:10px;font-weight:800}.axis-grid{stroke:#dfe7e4;stroke-width:1}.axis-label{fill:#71817c;font-size:10px}.route-label{fill:#263b37;font-size:10px;font-weight:800}.route-halo{fill:none;stroke:white;stroke-width:9;stroke-linecap:round;stroke-linejoin:round}.route-line{fill:none;stroke:var(--line);stroke-width:5;stroke-linecap:round;stroke-linejoin:round}.station{fill:white;stroke:var(--line);stroke-width:3}.terminal{fill:var(--line);stroke:white;stroke-width:2}.terminal-label{fill:#566963;font-size:8px;font-weight:700}.now-line{stroke:#c85d3e;stroke-width:2;stroke-dasharray:4 3}.now-label{fill:#a9472c;font-size:9px;font-weight:800}.assumption{margin:5px 0 0;color:#667a74;font-size:8px;line-height:1.5}
</style>
