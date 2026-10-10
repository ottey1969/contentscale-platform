'use strict';
const s=require('node:fs').readFileSync('src/index.js','utf8');
const lines=s.split('\n');
for (const [from,to] of [[61678,61714],[61718,61784]]) {
 const items=lines.slice(from-1,to).map((line,i)=>({line:from+i,source:line.slice(0,1800)}));
 console.log(JSON.stringify({audit:'prewrite_exact_refactor_source',region:from+'-'+to,items}));
}
