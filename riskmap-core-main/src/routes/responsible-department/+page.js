import { building } from '$app/environment';

export async function load({ url, fetch }) {
    if (building) return { initialResponsibleHandoff: null, initialWorkspace: false };

    try {
        const regionCode = url.searchParams.get('regionCode') || '41110';
        const initialWorkspace = url.searchParams.get('view') === 'workspace' || url.searchParams.get('handoff') === 'lead-department';
        const inboxUrl = new URL('http://127.0.0.1:4176/responsible-handoff');
        inboxUrl.searchParams.set('regionCode', regionCode);
        const response = await fetch(inboxUrl.toString(), { cache: 'no-store' });
        if (!response.ok) return { initialResponsibleHandoff: null, initialWorkspace };
        const result = await response.json();
        const payload = result?.payload;
        return {
            initialResponsibleHandoff: payload?.schemaVersion === 'lead-to-responsible-handoff/v1'
                ? payload
                : null,
            initialWorkspace
        };
    } catch {
        return { initialResponsibleHandoff: null, initialWorkspace: false };
    }
}
