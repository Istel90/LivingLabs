import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const here=path.dirname(fileURLToPath(import.meta.url)), root='D:/90_Data/gk2a-ndvi';
const run=promisify(execFile), dayMs=86400000;
const day=(d=new Date())=>new Date(+d+9*3600000).toISOString().slice(0,10);
const readJson=async name=>JSON.parse(await fs.readFile(path.join(root,name),'utf8'));
const redact=s=>s.replace(/([?&](?:authKey|serviceKey|token)=)[^&\s]+/gi,'$1[숨김]');
let scheduler={checkedAt:null,tasks:[],error:null}, refreshing=false;
async function refreshScheduler(){
  if(refreshing)return; refreshing=true;
  try{const {stdout}=await run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(here,'scheduler.ps1')],{windowsHide:true,timeout:12000});scheduler={checkedAt:new Date().toISOString(),tasks:JSON.parse(stdout.replace(/^\uFEFF/,'')),error:null};}
  catch{scheduler={checkedAt:new Date().toISOString(),tasks:[],error:'예약 상태 조회 불가. 실행 기록은 계속 표시합니다.'};}
  finally{refreshing=false;}
}
async function job(raw){
  const [config,state]=await Promise.all([readJson(raw?'raw-config.json':'config.json'),readJson(raw?'raw-state.json':'state.json')]);
  const completed=Object.entries(state.completed||{}).filter(([,v])=>v.filename);
  const unavailable=[...Object.entries(state.completed||{}).filter(([,v])=>v.unavailable),...Object.entries(state.unavailable||{})].map(([key,v])=>({key,checkedAt:v.checkedAt}));
  const now=new Date(), end=raw?new Date(config.endDate+'T00:00:00Z'):new Date(now.toISOString().slice(0,10)+'T00:00:00Z');
  const start=new Date(config.startDate+'T00:00:00Z'), interval=raw?1:config.intervalDays;
  const dates=Math.floor((end-start)/dayMs/interval)+1, expected=dates*(raw?config.channels.length*config.observationTimesUtc.length:1);
  const pending=expected-completed.length-unavailable.length;
  const nextProduct=raw?null:new Date(+start+dates*interval*dayMs).toISOString().slice(0,10);
  const logDir=path.join(root,raw?'raw-logs':'logs'), files=(await fs.readdir(logDir)).filter(x=>/^\d{4}-\d{2}-\d{2}\.log$/.test(x)).sort().slice(-35);
  const history=[], logs=[];
  for(const file of files){
    const lines=(await fs.readFile(path.join(logDir,file),'utf8')).trim().split(/\r?\n/);
    const summaries=lines.map(l=>l.match(/실행 종료: 새 파일 ([\d,]+)개, 오늘 ([\d,]+) bytes, 요청 ([\d,]+)회/)).filter(Boolean);
    const last=summaries.at(-1), n=s=>Number(s.replaceAll(',',''));
    const observed=lines.map(l=>l.match(/(?:VI006:|VI008:)?(\d{12}) 완료/)).filter(Boolean).map(m=>m[1]).sort();
    history.push({date:file.slice(0,10),files:summaries.length?summaries.reduce((a,m)=>a+n(m[1]),0):observed.length,bytes:last?n(last[2]):null,requests:last?n(last[3]):null,finished:!!last,oldest:observed[0]||null});
    logs.push(...lines.slice(-30).map(redact));
  }
  const name=raw?'GK2A Raw NDVI Inputs Downloader':'GK2A NDVI Daily Downloader';
  const task=scheduler.tasks.find(x=>x.name===name)||null;
  const reason=pending>0?'아직 확인하지 않은 수집 대상이 남아 있습니다.':raw?`${config.endDate}부터 과거 방향으로 내려가 담당 구간의 끝인 ${config.startDate}까지 처리했습니다. 남은 미처리 대상이 없어 API 요청이 0회입니다. 자료 없음 ${unavailable.length}건은 별도 확인이 필요합니다.`:`현재 주기의 대상은 모두 처리했습니다. 다음 대상일은 ${nextProduct}이며 실제 제공 시점은 API에 따라 달라집니다.`;
  return {id:raw?'raw':'ndvi',title:raw?'NDVI 계산용 원시자료':'NDVI 완성자료',subtitle:raw?'1km · VI006 / VI008 · 하루 6시각':'2km · 8일 간격 관측자료',task,expected,downloaded:completed.length,unavailable:unavailable.length,pending:Math.max(0,pending),bytes:completed.reduce((a,[,v])=>a+v.bytes,0),lastDownload:completed.map(([,v])=>v.downloadedAt).sort().at(-1),start:config.startDate,end:raw?config.endDate:end.toISOString().slice(0,10),nextProduct,reason,outputDirectory:config.outputDirectory,history,logs:logs.slice(-35).reverse(),missing:unavailable.sort((a,b)=>b.key.localeCompare(a.key)),today:history.find(x=>x.date===day())||null};
}
await refreshScheduler();setInterval(refreshScheduler,30000).unref();
http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(!['127.0.0.1:4187','localhost:4187'].includes(req.headers.host)){res.writeHead(403);return res.end();}
  if(req.method!=='GET'){res.writeHead(405);return res.end();}
  try{
    if(req.url==='/api/status'){const jobs=await Promise.all([job(false),job(true)]);res.setHeader('Content-Type','application/json; charset=utf-8');return res.end(JSON.stringify({generatedAt:new Date().toISOString(),scheduler,jobs}));}
    const file={'/':'index.html','/app.js':'app.js','/style.css':'style.css'}[req.url];
    if(!file){res.writeHead(404);return res.end('Not found');}
    res.setHeader('Content-Type',file.endsWith('html')?'text/html; charset=utf-8':file.endsWith('css')?'text/css':'text/javascript');res.end(await fs.readFile(path.join(here,file)));
  }catch{res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'기록을 읽지 못했습니다. 잠시 후 자동으로 다시 확인합니다.'}));}
}).listen(4187,'127.0.0.1',()=>console.log('GK2A dashboard http://127.0.0.1:4187'));
