<script>
    import { notificationState, dismiss } from './errorNotifications.svelte.js';

    const TYPE_META = {
        warning: { icon: '⚠️', color: '#8a6412', bg: '#fff6e0', border: '#f0d78c' },
        data: { icon: '❗', color: '#a3312c', bg: '#fdecec', border: '#f0b7b3' },
        server: { icon: '🔌', color: '#a3312c', bg: '#fdecec', border: '#f0b7b3' },
        success: { icon: '✅', color: '#1f6e46', bg: '#eaf7ee', border: '#b7ddc4' },
        error: { icon: '❗', color: '#a3312c', bg: '#fdecec', border: '#f0b7b3' }
    };

    function metaFor(type) {
        return TYPE_META[type] || TYPE_META.error;
    }

    let modals = $derived(notificationState.items.filter((item) => item.mode === 'modal'));
    let toasts = $derived(notificationState.items.filter((item) => item.mode === 'toast'));

    function runAction(item) {
        item.onAction?.();
        dismiss(item.id);
    }
</script>

{#each modals as item (item.id)}
    {@const meta = metaFor(item.type)}
    <div
        class="error-popup-backdrop"
        role="presentation"
        onclick={(event) => event.target === event.currentTarget && dismiss(item.id)}
    >
        <div class="error-popup-modal" role="alertdialog" aria-modal="true" aria-labelledby={`error-popup-title-${item.id}`}>
            <div class="error-popup-icon" style={`background:${meta.bg};color:${meta.color};border-color:${meta.border}`} aria-hidden="true">{meta.icon}</div>
            <h2 id={`error-popup-title-${item.id}`}>{item.title}</h2>
            {#if item.message}<p>{item.message}</p>{/if}
            <div class="error-popup-actions">
                <button type="button" class="error-popup-dismiss" onclick={() => dismiss(item.id)}>{item.dismissLabel}</button>
                {#if item.actionLabel}
                    <button type="button" class="error-popup-action" onclick={() => runAction(item)}>{item.actionLabel}</button>
                {/if}
            </div>
        </div>
    </div>
{/each}

<div class="error-toast-stack">
    {#each toasts as item (item.id)}
        {@const meta = metaFor(item.type)}
        <div class="error-toast" role="status" style={`background:${meta.bg};border-color:${meta.border}`}>
            <span class="error-toast-icon" style={`color:${meta.color}`} aria-hidden="true">{meta.icon}</span>
            <div class="error-toast-body">
                <strong style={`color:${meta.color}`}>{item.title}</strong>
                {#if item.message}<span>{item.message}</span>{/if}
            </div>
            {#if item.actionLabel}
                <button type="button" class="error-toast-action" onclick={() => runAction(item)}>{item.actionLabel}</button>
            {/if}
            <button type="button" class="error-toast-close" onclick={() => dismiss(item.id)} aria-label="닫기">×</button>
        </div>
    {/each}
</div>

<style>
    .error-popup-backdrop {
        position: fixed;
        z-index: 5000;
        inset: 0;
        display: grid;
        place-items: center;
        padding: 24px;
        background: rgb(15 23 42 / 58%);
        backdrop-filter: blur(3px);
    }

    .error-popup-modal {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        width: min(360px, 100%);
        border-radius: 10px;
        background: white;
        padding: 24px 22px 20px;
        text-align: center;
        box-shadow: 0 20px 45px rgb(15 23 42 / 25%);
    }

    .error-popup-icon {
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        border: 1px solid;
        border-radius: 999px;
        font-size: 17px;
    }

    .error-popup-modal h2 {
        margin: 0;
        color: #1f2d2a;
        font-size: 14px;
        font-weight: 800;
    }

    .error-popup-modal p {
        margin: 0;
        color: #566862;
        font-size: 11px;
        font-weight: 600;
        line-height: 1.5;
    }

    .error-popup-actions {
        display: flex;
        gap: 8px;
        margin-top: 8px;
    }

    .error-popup-dismiss,
    .error-popup-action {
        border-radius: 6px;
        padding: 8px 14px;
        font-size: 11px;
        font-weight: 800;
        cursor: pointer;
    }

    .error-popup-dismiss {
        border: 1px solid #d3dbd6;
        background: white;
        color: #4c5c56;
    }

    .error-popup-action {
        border: 1px solid #244a45;
        background: #244a45;
        color: white;
    }

    .error-toast-stack {
        position: fixed;
        z-index: 5000;
        top: 16px;
        right: 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: min(320px, calc(100vw - 32px));
        pointer-events: none;
    }

    .error-toast {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        border: 1px solid;
        border-radius: 8px;
        padding: 10px 10px 10px 12px;
        box-shadow: 0 10px 24px rgb(15 23 42 / 16%);
        pointer-events: auto;
    }

    .error-toast-icon {
        flex: 0 0 auto;
        font-size: 13px;
        line-height: 1.4;
    }

    .error-toast-body {
        display: flex;
        flex: 1 1 auto;
        min-width: 0;
        flex-direction: column;
        gap: 2px;
    }

    .error-toast-body strong {
        font-size: 11px;
        font-weight: 800;
    }

    .error-toast-body span {
        color: #566862;
        font-size: 10px;
        font-weight: 600;
        line-height: 1.4;
    }

    .error-toast-action {
        flex: 0 0 auto;
        align-self: center;
        border: 1px solid #244a45;
        border-radius: 6px;
        background: white;
        color: #244a45;
        padding: 5px 8px;
        font-size: 9px;
        font-weight: 800;
        cursor: pointer;
        white-space: nowrap;
    }

    .error-toast-close {
        flex: 0 0 auto;
        align-self: flex-start;
        border: 0;
        background: none;
        color: #8a978f;
        font-size: 14px;
        line-height: 1;
        cursor: pointer;
    }
</style>
