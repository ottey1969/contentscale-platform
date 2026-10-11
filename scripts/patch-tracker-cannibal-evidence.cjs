'use strict';
const fs=require('node:fs'),p=process.argv[2]||'src/index.js';
let s=fs.readFileSync(p,'utf8');
const start=s.indexOf('async function analyzeCannibalization(clientId) {');
const end=s.indexOf("// GET /api/tracker-client/:token/pages/check-cannibalization",start);
if(start<0||end<start||end-start>20000)throw Error('Cannibalization engine boundary changed');
let c=s.slice(start,end);
const changes=[
 ["const recommendation=anySeparate?'keep_separate':(exactDuplicate?'consolidate_candidate':'differentiate');",
  "const recommendation=anySeparate?'keep_separate':(exactDuplicate?'compare_content_and_intent':'differentiate');"],
 ["redirect: exactDuplicate&&!anySeparate ? losers.map(function (l) { return { id: l.id, url: l.url }; }) : [],",
  "redirect: [], // No content similarity or canonical proof was verified; never populate redirect targets from GSC alone."],
 ["confidence: exactDuplicate||anySeparate?'high':'medium',",
  "confidence: anySeparate?'high':'medium', // Shared keywords alone cannot establish duplicate content."],
 ["? ('Exact duplicate target keyword. Candidate owner: '+keep.url+' based on query relevance and query-level GSC position. Preview and approve any 301; never execute automatically.')",
  "? ('Same target keyword is assigned to multiple URLs. Compare both full page bodies, intent and page-scoped GSC queries before deciding whether to differentiate, consolidate or leave both unchanged. Candidate URL for review: '+keep.url+'. No redirect or canonical is authorized.')"]
];
for(const [a,b] of changes){
 if(c.includes(b))continue;
 if(c.split(a).length!==2)throw Error('Cannibalization patch anchor missing/duplicated: '+a.slice(0,70));
 c=c.replace(a,b);
}
s=s.slice(0,start)+c+s.slice(end);
fs.writeFileSync(p,s);
console.log('Cannibalization: GSC overlap never authorizes redirect/canonical or consolidation without content proof');
