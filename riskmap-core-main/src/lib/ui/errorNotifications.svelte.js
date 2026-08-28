// Shared, platform-wide error/status notification store.
//
// Any tool or page can call `notify(...)` to surface a failure to the user
// without building its own popup UI. `ErrorPopupHost.svelte` (mounted once
// in the root layout) renders whatever is currently queued here.
//
// Usage:
//   import { notify } from '$lib/ui/errorNotifications.svelte.js';
//
//   notify({
//       type: 'data',                 // 'warning' | 'data' | 'server' | 'success' | 'error'
//       title: '분석을 완료하지 못했습니다',
//       message: '선택한 지표 중 일부 입력자료를 불러오지 못했습니다.',
//       actionLabel: '다시 시도',
//       onAction: () => runAnalysis()
//   });
//
// `mode` ('modal' | 'toast') can be set explicitly; otherwise it is inferred
// from `type` — 'success' surfaces as a brief top-right toast, everything
// else defaults to a center modal since that is the only presentation
// currently wired up to real failure points on the platform.

let idSeq = 0;

export const notificationState = $state({ items: [] });

const TOAST_AUTO_DISMISS_MS = 4000;

export function notify({
    type = 'error',
    title,
    message = '',
    mode,
    actionLabel = '',
    onAction = null,
    dismissLabel = '닫기'
} = {}) {
    if (!title) return null;

    const resolvedMode = mode || (type === 'success' ? 'toast' : 'modal');
    const id = ++idSeq;
    const item = { id, type, title, message, mode: resolvedMode, actionLabel, onAction, dismissLabel };

    notificationState.items = [...notificationState.items, item];

    if (resolvedMode === 'toast') {
        setTimeout(() => dismiss(id), TOAST_AUTO_DISMISS_MS);
    }

    return id;
}

export function dismiss(id) {
    notificationState.items = notificationState.items.filter((item) => item.id !== id);
}
