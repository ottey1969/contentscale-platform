'use strict';
const fs=require('node:fs');
const src=fs.readFileSync('src/index.js','utf8');
const names=[
 '_ensureCaseStudySchema',
 '_ensurePerfectRoofingCaseStudy',
 '_caseStudyOpenFreshStartCycle',
 '_caseStudyEventForPage',
 'perfect_roofing_daily_case_study_monitor_restore_v1',
 'case_day_7_completed',
 'case_day_14_completed'
];
const route=/\bapp\s*\.\s*(get|post|patch|put|delete)\s*\(\s*['"\x60]([^'"\x60]+)['"\x60]/g;
const registered=[...src.matchAll(route)].map(m=>({at:m.index,verb:m[1],path:m[2]}));
registered.sort((a,b)=>a.at-b.at);
for(const name of names){
 let at=-1,calls=[],i=0;
 while(true){
  at=src.indexOf(name,at+1);if(at<0)break;
  const line=src.slice(0,at).split('\n').length;
  const preceding=registered.filter(r=>r.at<at).at(-1)||null;
  const context=src.slice(Math.max(0,at-100),Math.min(src.length,at+name.length+110)).replace(/\s+/g,' ');
  calls.push({line,near_route:preceding?(preceding.verb.toUpperCase()+' '+preceding.path):'module_scope',context:context.slice(0,230)});
  if(++i>70)break;
 }
 console.log(JSON.stringify({audit:'historical_writer_call_graph',name,total_occurrences:calls.length,call_sites:calls.slice(0,55)}));
}
