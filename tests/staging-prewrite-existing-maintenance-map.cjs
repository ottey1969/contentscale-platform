'use strict';
const fs=require('node:fs');
const src=fs.readFileSync('src/index.js','utf8');
const start=src.indexOf("app.get('/api/tracker-client/:token/prewrite-briefs/:id'");
if(start<0)throw new Error('Prewrite GET missing');
const base=src.slice(0,start).split('\n').length;
const after=src.slice(start,start+34000);
const all=[...after.matchAll(/\bapp\.(get|post|patch|put|delete)\s*\(\s*(['"\x60])([^'"\x60]+)\2/g)]
 .filter(x=>x.index<34000).slice(0,19).map(x=>({line:base+after.slice(0,x.index).split('\n').length-1,method:x[1],path:x[3]}));
const wanted=[
  [61670,61716],[61716,61835],[61835,61945]
];
const lines=src.split('\n');
console.log(JSON.stringify({audit:'prewrite_explicit_maintenance_route_map',routes:all}));
for(const [from,to] of wanted){
 const entries=lines.slice(from-1,to).map((line,i)=>({line:from+i,source:line.trim().slice(0,480)}))
 .filter(x=>/prewrite|brief|maintenance|repair|persist|migrat|integrity|_pwb|res\.json|pool\.query|verify|auth|route|dry_run|preview|publication|save|UPDATE|case|action/.test(x.source));
 console.log(JSON.stringify({audit:'prewrite_maintenance_source',range:from+'-'+to,lines:entries.slice(0,105)}));
}
