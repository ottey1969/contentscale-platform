'use strict';
const fs=require('node:fs');
const src=fs.readFileSync('src/index.js','utf8');
const lines=src.split('\n');
const signals=['baseline_locked','case-study','case_study','tracker-interest'];
for(const signal of signals){
 const found=[];
 for(let i=0;i<lines.length;i++)if(lines[i].includes(signal))found.push(i);
 console.log('MARKER',signal,'count',found.length);
 for(const i of found.filter(i=>/app\.(?:get|post|put|patch|delete)\(|baseline_locked|manual.scan/i.test(lines[i])).slice(0,30)){
   const s=lines[i];
   const route=s.match(/app\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)/);
   console.log('LINE',i+1,'METHOD',route?.[1]||'?','PATH',route?.[2]||'?', 'MATCH',s.slice(Math.max(0,s.indexOf(signal)-110),s.indexOf(signal)+120).replace(/[^\x20-\x7e]/g,' '));
 }
}

if(process.env.CS_INSPECT_CASE_CONTEXT==='1'){
 for(let i=2969;i<3082;i++)console.log('CASE_SOURCE',i+1,lines[i]?.slice(0,650));
}
