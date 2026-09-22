// Isolated UI fixture. No remote DB writes. Never use this as the production server.
import http from 'node:http';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
const root=resolve('output/draft-management-preview/internal-tools');
const rows=['flood','heatwave'].map((hazard,index)=>({id:randomUUID(),lineage_id:randomUUID(),parent_id:null,
 set_name:'검증용 저장본',hazard_type:hazard,region_code:'41110',status:'draft',deleted_at:null,management_version:1,
 created_by_user:'검증',created_at:new Date().toISOString(),analysis_version:`draft/${index+1}`,
 analysis_conditions:{draftPayload:{regionCode:'41110',hazard,alternatives:[]}}}));
let number=2;
const json=(res,data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(data));};
http.createServer(async(req,res)=>{
 try{
 const u=new URL(req.url,'http://127.0.0.1:4181');
 if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS'});return res.end();}
 // The preview uses the existing local platform's read-only analytical data.
 // Keep the fixture save API isolated; never forward arbitrary routes or writes.
 const dataRoutes=new Set(['/hazard-grid','/flood-grid','/analysis-grid','/population/grid','/indicator-availability','/cadastre/parcel','/cadastre/bbox']);
 if(dataRoutes.has(u.pathname)){
  if(!['GET','HEAD'].includes(req.method))return json(res,{error:'Read-only data route'},405);
  const upstream=await fetch(`http://127.0.0.1:4173${u.pathname}${u.search}`,{method:req.method,redirect:'error',signal:AbortSignal.timeout(120000)});
  res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')||'application/json'});
  return res.end(req.method==='HEAD'?undefined:Buffer.from(await upstream.arrayBuffer()));
 }
 if(u.pathname.startsWith('/rest/v1/')){
  let body='';for await(const chunk of req)body+=chunk;const data=body?JSON.parse(body):{};
  if(u.pathname.endsWith('/regions'))return json(res,[]);
  if(!u.pathname.endsWith('/priority_area_sets'))return json(res,[]);
  const id=u.searchParams.get('id')?.replace(/^eq\./,'');
  if(req.method==='POST'){
   if(rows.some(r=>r.id===data.id))return json(res,[]);
   if(data.parent_id&&rows.some(r=>r.parent_id===data.parent_id))return json(res,{message:'DRAFT_STALE_PARENT'},409);
   const parent=rows.find(r=>r.id===data.parent_id);
   rows.push({...data,set_name:`검증 저장본 ${++number}`,lineage_id:parent?.lineage_id||data.id,management_version:1,status:'draft',deleted_at:null,analysis_version:`draft/${number}`,created_at:new Date().toISOString()});
   return json(res,[]);
  }
  if(req.method==='PATCH'){
   const r=rows.find(r=>r.id===id&&r.management_version===Number(u.searchParams.get('management_version')?.replace('eq.','')));
   if(!r)return json(res,[]);
   Object.assign(r,data,{management_version:r.management_version+1});return json(res,[r]);
  }
  return json(res,rows.filter(r=>(!id||r.id===id)&&(!u.searchParams.has('hazard_type')||r.hazard_type===u.searchParams.get('hazard_type').replace('eq.',''))&&(!u.searchParams.has('deleted_at')||!r.deleted_at)&&(!u.searchParams.has('or')||r.deleted_at||r.status==='archived')));
 }
 const rel=decodeURIComponent(u.pathname).replace(/^\/internal-tools\/?/,'');
 let file=resolve(root,rel||'index.html');
 if(!file.startsWith(root+sep)&&file!==root)return json(res,{},403);
 if(existsSync(file)&&statSync(file).isDirectory())file=resolve(file,'index.html');
 if(!existsSync(file)&&existsSync(file+'.html'))file+='.html';
 if(!existsSync(file))return json(res,{},404);
 const types={'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml'};
 let content=readFileSync(file);
 if(extname(file)==='.html') content=content.toString().replace(/<body([^>]*)>/,
   '<body$1><div style="position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#fff3cd;color:#664d03;text-align:center;padding:5px;font:12px sans-serif;pointer-events:none">개선 기능 미리보기 · 검증용 데이터 · 운영 DB 적용 전</div>');
 res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});res.end(content);
 }catch(error){json(res,{error:error.message},500);}
}).listen(4181,'127.0.0.1',()=>console.log('Isolated fixture: http://127.0.0.1:4181/internal-tools/priority-management-area/flood?regionCode=41110'));
