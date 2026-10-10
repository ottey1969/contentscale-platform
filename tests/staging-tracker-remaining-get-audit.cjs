'use strict';
const fs=require('node:fs');
const s=fs.readFileSync('src/index.js','utf8');
const routes=[...s.matchAll(/\bapp\.get\(\s*(['"\x60])([^'"\x60]{1,220})\1\s*,/g)];
const flagged=[];
for(let i=0;i<routes.length;i++){
 const m=routes[i],path=m[2];
 if(!(/case-study|case-study-report|tracker-readiness|tracker-client/i.test(path)))continue;
 const end=s.indexOf('\n});',m.index),max=Math.min(m.index+40000, routes[i+1]?.index??s.length);
 if(end<0||end>max)continue;
 const body=s.slice(m.index,end+4),baseLine=s.slice(0,m.index).split('\n').length;
 const lines=body.split(/\r?\n/);
 const flags=lines.map((line,index)=>({line:baseLine+index,src:line.trim().slice(0,230)})).filter(o=>
 /_ensureCaseStudySchema|_ensureMonitoringGateSchema|_trackerEnsureAiEvidenceSchema|_caseStudy[A-Za-z]+\(|\b(?:INSERT|UPDATE|ALTER|DELETE|CREATE)\b.*(?:tracker|case_study|monitoring)|pool\.query.*\b(?:INSERT|UPDATE|ALTER|DELETE|CREATE)\b/.test(o.src));
 if(flags.length)flagged.push({method:'GET',route:path,start_line:baseLine,block_chars:body.length,flags:flags.slice(0,90)});
}
console.log(JSON.stringify({audit:'remaining_mutating_GET_routes',total:flagged.length,routes:flagged.slice(0,45)}));
