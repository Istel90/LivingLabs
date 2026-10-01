import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

test('public proxy streams practice calculation only to the configured server and preserves failures', async () => {
    const calls = [];
    const context = vm.createContext({ URL, Headers, Request, Response, AbortSignal,
        __POSTGIS_ORIGIN__: 'https://test-upstream.invalid', __POSTGIS_TUNNEL_TOKEN__: 'test-only-token',
        fetch: async (url, init) => {
            calls.push({url:String(url),method:init.method,headers:init.headers,body:await new Response(init.body).text()});
            return Response.json({error:'busy'},{status:429});
        } });
    const source = readFileSync('cloudflare/postgis-proxy-worker.js','utf8').replace('export default','globalThis.worker =');
    vm.runInContext(source,context);
    const env = { ASSETS:{fetch:async()=>new Response('static')} };
    const result = await context.worker.fetch(new Request('https://public.invalid/practice-areas',{method:'POST',body:'{"schemaVersion":1}'}),env);
    assert.equal(result.status,429);
    assert.equal(result.headers.get('Cache-Control'),'no-store');
    assert.equal(calls.length,1);
    assert.equal(calls[0].url,'https://test-upstream.invalid/practice-areas');
    assert.equal(calls[0].body,'{"schemaVersion":1}');
    assert.equal(calls[0].headers.get('Content-Type'),'application/json');
    assert.equal(calls[0].headers.get('X-LivingLabs-Tunnel-Token'),'test-only-token');
    for (const [path,method] of [['/cadastre/parcel','POST'],['/practice-areas','DELETE']]) {
        assert.equal((await context.worker.fetch(new Request('https://public.invalid'+path,{method}),env)).status,405);
    }
    assert.equal(calls.length,1);
    assert.equal(await (await context.worker.fetch(new Request('https://public.invalid/internal-tools/priority-management-area/flood'),env)).text(),'static');
});
