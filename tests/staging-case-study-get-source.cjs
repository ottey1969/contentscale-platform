'use strict';
const fs=require('node:fs');const s=fs.readFileSync('src/index.js','utf8');
const lines=s.split('\n');
for(const [start,end] of [[3791,3851],[10753,10824],[2705,2765]]){
 console.log(JSON.stringify({region:start+'-'+end,lines:lines.slice(start-1,end).map((x,i)=>({n:i+start,s:x.trim().slice(0,440)}))}));
}
for(const name of ['async function _ensureMonitoringGateSchema','async function _trackerEnsureAiEvidenceSchema','async function _ensureCaseStudySchema']){
 const i=s.indexOf(name);
 console.log(JSON.stringify({symbol:name,line:i>=0?s.slice(0,i).split('\n').length:null,preview:s.slice(i,i+1550)}));
}
