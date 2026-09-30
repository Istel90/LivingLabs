import { analysisJsonReplacer } from '../data/analysisSerialization.js';
export const PRIORITY_DRAFT_DB_NAME = 'livinglabs-priority-management';
export const PRIORITY_DRAFT_STORE_NAME = 'priority-management-sessions';
export const PRIORITY_DRAFT_SCHEMA_VERSION = 'priority-management-draft/v2';
export function requestToPromise(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
    });
}

export function openPriorityDraftDb() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB unavailable'));
            return;
        }

        const request = indexedDB.open(PRIORITY_DRAFT_DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(PRIORITY_DRAFT_STORE_NAME)) {
                db.createObjectStore(PRIORITY_DRAFT_STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
    });
}

export async function readPriorityDraft(id) {
    const db = await openPriorityDraftDb();
    try {
        const transaction = db.transaction(PRIORITY_DRAFT_STORE_NAME, 'readonly');
        const store = transaction.objectStore(PRIORITY_DRAFT_STORE_NAME);
        return await requestToPromise(store.get(id));
    } finally {
        db.close();
    }
}

export async function writePriorityDraft(payload) {
    const db = await openPriorityDraftDb();
    try {
        const transaction = db.transaction(PRIORITY_DRAFT_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(PRIORITY_DRAFT_STORE_NAME);
        await new Promise((resolve, reject) => {
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error || new Error('저장이 중단되었습니다.'));
            store.put(JSON.parse(JSON.stringify(payload, analysisJsonReplacer)));
        });
    } finally {
        db.close();
    }
}

export async function clearPriorityDraftStore() {
    const db = await openPriorityDraftDb();
    try {
        const transaction = db.transaction(PRIORITY_DRAFT_STORE_NAME, 'readwrite');
        await requestToPromise(transaction.objectStore(PRIORITY_DRAFT_STORE_NAME).clear());
    } finally {
        db.close();
    }
}
