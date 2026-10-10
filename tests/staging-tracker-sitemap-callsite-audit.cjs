'use strict';
const fs=require('node:fs'),path=require('node:path');
const files=[];
function visit(dir){
 for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  if(['node_modules','.git'].includes(e.name))continue;
  const p=path.join(dir,e.name);
  if(e.isDirectory()){visit(p);continue;}
  if(e.isFile()&&/\.(?:js|cjs|html)$/.test(e.name))files.push(p);
 }
}
visit('src');visit('public');files.push('index.js');
for(const f of files){
 const contents=fs.readFileSync(f,'utf8');
 const pat='fetch-sitemap';
 let from=0,count=0,snippets=[];
 while(true){
  const i=contents.indexOf(pat,from);if(i<0)break;
  count++;if(snippets.length<6)snippets.push(contents.slice(Math.max(0,i-120),i+130).replace(/\s+/g,' ').slice(0,250));
  from=i+pat.length;
 }
 if(count)console.log(JSON.stringify({file:f,count,snippets}));
}
