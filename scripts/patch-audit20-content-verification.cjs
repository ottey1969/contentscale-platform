'use strict';
const fs=require('fs');
const p=process.argv[2]||'src/index.js';
let s=fs.readFileSync(p,'utf8');
const pairs=[["  const queue=[origin+'/']; const seen=new Set(); let fetched=0, navigationUrls=0, internalUrls=0;","  const qualityCache=new Map();\n  const queue=[origin+'/']; const seen=new Set(); let fetched=0, navigationUrls=0, internalUrls=0;"],["    fetched++;\n    const links=_audit20ExtractLinks(got.html,current);","    fetched++;\n    qualityCache.set(key,got.html);\n    const links=_audit20ExtractLinks(got.html,current);"],["  const selected=eligible.slice(0,Math.max(1,Math.min(Number(maxPages)||20,20)));","  const selected=[];\n  const excludedContent=[];\n  const {checkPageContent}=require('./prospect/page-quality.cjs');\n  const target=Math.max(1,Math.min(Number(maxPages)||20,20));\n  for(const item of eligible){\n    if(selected.length>=target)break;\n    const key=item.url.replace(/\\/$/,'');\n    const cached=qualityCache.get(key);\n    const page=cached?{ok:true,html:cached}:await _audit20FetchHtmlInternal(req,item.url);\n    if(!page.ok||!page.html){excludedContent.push({url:item.url,reason:'html_unavailable'});continue;}\n    const quality=checkPageContent(page.html,item.type);\n    if(!quality.eligible){excludedContent.push({url:item.url,reason:quality.reason});continue;}\n    selected.push(item);\n  }"],["    eligible_pages:eligible.length,\n    selected_count:selected.length,","    eligible_pages:selected.length,\n    excluded_content:excludedContent.slice(0,60),\n    selected_count:selected.length,"]];
if(!s.includes('const excludedContent=[];')){
  for(const [a,b] of pairs){const n=s.split(a).length-1;if(n!==1)throw Error('Unsafe patch: expected one marker, got '+n+' for '+a.slice(0,50));s=s.replace(a,b)}
}
const candidateBefore='    candidates:eligible.slice(0,60)';
const candidateAfter='    candidates:selected.slice(0,60)';
if(s.includes(candidateBefore))s=s.replace(candidateBefore,candidateAfter);
else if(!s.includes(candidateAfter))throw Error('Cannot safely identify candidate list');
fs.writeFileSync(p,s);
console.log('Audit20 candidate content gate patched');
