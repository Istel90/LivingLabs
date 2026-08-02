<script>
    let { source, compact = false } = $props();
</script>

{#if source}
    <span class:compact class="source-badge" title={source.detail} aria-label={`출처: ${source.detail}`}>
        <b>{source.icon}</b>
        <span>{source.short}</span>
    </span>
{/if}

<style>
    .source-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        width: fit-content;
        border: 1px solid #c9dad4;
        border-radius: 999px;
        background: #eef6f2;
        color: #315e56;
        padding: 4px 7px 4px 4px;
        font-size: 8px;
        font-weight: 800;
        line-height: 1;
        cursor: help;
    }

    .source-badge b {
        display: grid;
        place-items: center;
        min-width: 22px;
        height: 18px;
        border-radius: 999px;
        background: #315e56;
        color: white;
        font-size: 7px;
        letter-spacing: .03em;
    }

    .source-badge.compact span { display: none; }
    .source-badge.compact { padding-right: 4px; }
</style>
