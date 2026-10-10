'use strict';
const fs=require('node:fs'),path=require('node:path');
const files=[];
function walk(dir){
 for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  if(['.git','node_modules'].includes(e.name))continue;
  const p=path.join(dir,e.name);
  if(e.isDirectory())walk(p);
  else if(/\.(?:html|js|cjs)$/.test(e.name)&&!/\bindex \d/.test(e.name))files.push(p);
 }
}
walk('src');walk('public');
const patterns=['prewrite-briefs/','final_qa_persisted','deterministic_qa_migrated','pending_explicit_save','/finalize','Final QA'];
let found=[];
for(const file of files){
 const source=fs.readFileSync(file,'utf8');
 const hits=[];
 for(const pattern of patterns){
  let start=-1,count=0;
  while((start=source.indexOf(pattern,start+1))>=0){
   count++;
   if(count<=3)hits.push({pattern,at:start,excerpt:source.slice(Math.max(0,start-140),Math.min(source.length,start+180)).replace(/\s+/g,' ').slice(0,330)});
   if(count>=20)break;
  }
 }
 if(hits.length)found.push({file,hits:hits.slice(0,12)});
}
console.log(JSON.stringify({audit:'prewrite_frontend_finalization',files_checked:files.length,found:found.slice(0,36)}));
