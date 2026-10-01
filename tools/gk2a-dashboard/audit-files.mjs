import fs from 'node:fs/promises';
import path from 'node:path';
const root='D:/90_Data/gk2a-ndvi';
const out=path.resolve('output/gk2a-audit-20260929');
await fs.mkdir(out,{recursive:true});
const results=[];
for(const raw of [true,false]){
 const cfg=JSON.parse(await fs.readFile(path.join(root,raw?'raw-config.json':'config.json'),'utf8'));
 const state=JSON.parse(await fs.readFile(path.join(root,raw?'raw-state.json':'state.json'),'utf8'));
 const expected=[];
 const end=new Date((cfg.endDate||new Date().toISOString().slice(0,10))+'T00:00:00Z');
 for(let d=new Date(cfg.startDate+'T00:00:00Z');d<=end;d=new Date(+d+(raw?1:cfg.intervalDays)*86400000)){
  for(const time of raw?cfg.observationTimesUtc:['00:00'])for(const ch of raw?cfg.channels:[''])expected.push((ch?ch+':':'')+d.toISOString().slice(0,10).replaceAll('-','')+time.replace(':',''));
 }
 const missing=[],bad=[],pending=[],endpoint=[];let bytes=0,received=0;
 for(const key of expected){
  const entry=state.completed[key];
  if(entry?.filename){
   received++;bytes+=entry.bytes;
   try{
    const file=path.join(cfg.outputDirectory,path.basename(entry.filename));
    const stat=await fs.stat(file);
    if(stat.size!==entry.bytes)bad.push({key,issue:'size mismatch',expected:entry.bytes,actual:stat.size});
    const handle=await fs.open(file,'r');const header=Buffer.alloc(8);
    try{await handle.read(header,0,8,0);}finally{await handle.close();}
    if(!header.subarray(0,3).equals(Buffer.from('CDF'))&&!header.equals(Buffer.from([137,72,68,70,13,10,26,10])))bad.push({key,issue:'unrecognized NetCDF/HDF signature'});
   }catch(e){bad.push({key,issue:e.code||'read error'});}
  }else if(entry?.unavailable||state.unavailable?.[key])missing.push({key,checkedAt:entry?.checkedAt||state.unavailable[key].checkedAt});
  else pending.push(key);
  if(raw&&key.includes('20240823'))endpoint.push({key,status:entry?.filename?'received':missing.at(-1)?.key===key?'unavailable':'pending'});
 }
 const names=await fs.readdir(cfg.outputDirectory);
 results.push({dataset:raw?'raw':'ndvi',start:cfg.startDate,end:cfg.endDate||end.toISOString().slice(0,10),directory:cfg.outputDirectory,expected:expected.length,received,unavailable:missing.length,pending:pending.length,bytes,actualNcFiles:names.filter(n=>n.endsWith('.nc')).length,partialFiles:names.filter(n=>n.endsWith('.part')).length,badFiles:bad,endpoint,missingDays:new Set(missing.map(m=>m.key.replace(/^.*:/,'').slice(0,8))).size});
 await fs.writeFile(path.join(out,(raw?'raw':'ndvi')+'-unavailable.csv'),'key,checkedAt\n'+missing.map(m=>m.key+','+m.checkedAt).join('\n'));
}
await fs.writeFile(path.join(out,'report.json'),JSON.stringify({checkedAt:new Date().toISOString(),scope:'file existence, recorded sizes, NetCDF/HDF signatures; not full variable/pixel quality validation',results},null,2));
console.log(JSON.stringify(results,null,2));
