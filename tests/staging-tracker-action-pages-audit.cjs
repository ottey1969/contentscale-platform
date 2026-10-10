'use strict';
const fs=require('node:fs'),path=require('node:path');
const docs=['src/index.js','index.js'];
for(const top of ['src','public']){
 function walk(dir){
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
   if(e.name==='node_modules'||e.name==='.git')continue;
   const fn=path.join(dir,e.name);
   if(e.isDirectory()){if(!fn.includes('/vendor'))walk(fn);}
   else if(/\.(?:js|cjs|html|ejs)$/.test(fn) && fs.statSync(fn).size<1000000)docs.push(fn);
  }
 }
 walk(top);
}
const rx=/tracker action pages|action pages|tracker_action_pages|action_pages|actionPages|action-page|actionPage/gi;
const found=[];
for(const fn of [...new Set(docs)]){
 const src=fs.readFileSync(fn,'utf8');
 let m,count=0;rx.lastIndex=0;
 while((m=rx.exec(src))!==null){
   const before=src.slice(Math.max(0,m.index-2600),m.index);
   const after=src.slice(m.index,Math.min(src.length,m.index+3200));
   found.push({file:fn,term:m[0],line:src.slice(0,m.index).split('\n').length,
    context:(before.slice(-1250)+' [[LABEL]] '+after.slice(0,1800)).replace(/\s+/g,' ').slice(0,3150)});
   count++;if(count>25)break;
 }
}
console.log(JSON.stringify({audit:'tracker_action_page_filter',files:docs.length,matches:found.slice(0,30)}));
