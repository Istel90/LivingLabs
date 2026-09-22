import {writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {getPlatformHandoffConfig} from '../shared/services/platformHandoffs.js';
const {url,key}=getPlatformHandoffConfig();
const rows=[];
mkdirSync('output/draft-production-20260922',{recursive:true});
if(existsSync('output/draft-production-20260922/supabase-drafts.json'))throw new Error('Backup already exists; preserve it and choose a new backup location.');
for(let offset=0;;offset+=100){
 const response=await fetch(`${url}/rest/v1/priority_area_sets?select=*&order=id&limit=100&offset=${offset}`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
 if(!response.ok)throw new Error(`Backup failed ${response.status}`);
 const page=await response.json(); rows.push(...page); if(page.length<100)break;
}
const data=JSON.stringify(rows,null,2);
writeFileSync('output/draft-production-20260922/supabase-drafts.json',data);
writeFileSync('output/draft-production-20260922/data-manifest.json',JSON.stringify({createdAt:new Date().toISOString(),count:rows.length,sha256:createHash('sha256').update(data).digest('hex')},null,2));
console.log(`Backed up ${rows.length} complete rows.`);
