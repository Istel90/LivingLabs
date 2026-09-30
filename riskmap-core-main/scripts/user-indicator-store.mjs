import { mkdir, readdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateUserIndicator } from '../../shared/data/priority/userIndicatorContract.js';

export function createUserIndicatorStore(root) {
    const validId = id => /^user-[0-9a-f-]{36}$/.test(id);
    const read = async id => {
        if (!validId(id)) throw Object.assign(new Error('지표 ID를 확인하세요.'), { status: 400 });
        try { return JSON.parse(await readFile(join(root, id, 'data.json'), 'utf8')); }
        catch (error) { if (error.code === 'ENOENT') throw Object.assign(new Error('보관된 지표를 찾지 못했습니다.'), {status:404}); throw error; }
    };
    return {
        read,
        async list(regionCode) {
            await mkdir(root, {recursive:true});
            const items = [];
            for (const entry of await readdir(root, {withFileTypes:true})) {
                if (!entry.isDirectory() || !validId(entry.name)) continue;
                try {
                    const metadata = JSON.parse(await readFile(join(root, entry.name, 'metadata.json'), 'utf8'));
                    if (!regionCode || metadata.regionCode === regionCode) items.push(metadata);
                } catch (error) { if (error.code !== 'ENOENT') throw error; }
            }
            return items.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
        },
        async save(input) {
            validateUserIndicator(input);
            await mkdir(root, {recursive:true});
            const id = `user-${randomUUID()}`;
            const metadata = {
                id, version:1, label:input.label.trim(), description:String(input.description || '').slice(0,2000),
                regionCode:input.regionCode, group:input.group, createdAt:new Date().toISOString(),
                sourceType:String(input.sourceType || '').slice(0,80), sourceLabel:String(input.sourceLabel || '').slice(0,250),
                gridMeta:input.gridMeta, validCells:input.entries.length,
                color:/^#[\da-f]{6}$/i.test(input.color || '') ? input.color : '#0f766e',
            };
            const record = {...metadata, entries:input.entries};
            const temporary = join(root, `.pending-${id}`);
            await mkdir(temporary);
            await writeFile(join(temporary,'data.json'), JSON.stringify(record), {flag:'wx'});
            await writeFile(join(temporary,'metadata.json'), JSON.stringify(metadata), {flag:'wx'});
            await rename(temporary, join(root,id));
            return record;
        },
    };
}

export function assertLocalUserLibraryRequest(request) {
        // This library belongs to the local development server. Do not expose uploads through a tunnel.
        const peer = request.socket.remoteAddress;
        if (!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer) || request.headers['cf-ray'] || request.headers['cf-connecting-ip']) throw Object.assign(new Error('로컬 지표 보관소에서만 사용할 수 있습니다.'), {status:403});
        if (request.headers.origin && new URL(request.headers.origin).host !== request.headers.host) throw Object.assign(new Error('같은 사이트에서만 사용할 수 있습니다.'), {status:403});
}

export async function handleUserIndicators(request, response, send, store, url) {
    try {
        assertLocalUserLibraryRequest(request);
        if (request.method === 'GET') {
            const id = url.searchParams.get('id');
            const value = id ? await store.read(id) : await store.list(url.searchParams.get('regionCode'));
            send(response,200,JSON.stringify(value)); return;
        }
        if (request.method !== 'POST') throw Object.assign(new Error('지원하지 않는 요청입니다.'), {status:405});
        let size = 0; const chunks=[];
        for await (const chunk of request) {
            size += chunk.length;
            if (size > 64*1024*1024) throw Object.assign(new Error('사용자 지표는 64MB 이하로 등록하세요.'), {status:413});
            chunks.push(chunk);
        }
        const record = await store.save(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        const {entries, ...metadata} = record;
        send(response,201,JSON.stringify(metadata));
    } catch (error) { send(response,error.status || 400,JSON.stringify({error:error.message})); }
}
