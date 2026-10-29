'use strict';
// Regressions from production reports 26 and 27 (2026-10-29, after PR #199). Fixtures are verbatim subsets.
//  - Report 26: a "task" was built from a competitor's own company section ("The Facts on Four Seasons Roofing and
//    Construction", host 4seasons-construction.com): the digit in the domain hid the brand from the promotional filter.
//  - Report 27: the destination (/24-hour-emergency-roof-repair-nj/) is itself a locked Case Study, but the missing shared
//    task was reported as the primary blocker; protection must come first, the research gap as a limitation.
const test=require('node:test'),assert=require('node:assert/strict');
const r26=require('./fixtures/growth-reports-11-12/report-26-prt-wind-tasks.json');
const r27=require('./fixtures/growth-reports-11-12/report-27-prt-home-after-199.json');
const {isPromotionalSection}=require('../src/growth-derived-reader-tasks.cjs');
const {decideGrowthEditorialAction}=require('../src/growth-editorial-decision-gate.cjs');
test('R26: a competitor section about the competitor itself is promotional even when its domain spells a number with digits',()=>{
 const t=r26.reader_task_coverage.tasks.find(x=>x.code==='task_season');assert(t,'the production task is in the fixture');
 const own=t.competitor_support.find(x=>x.host==='4seasons-construction.com');
 const others=t.competitor_support.filter(x=>x!==own).map(x=>(x.heading+' '+x.excerpt).toLowerCase()).join(' ');
 assert.equal(isPromotionalSection({heading:own.heading,text:own.excerpt},own.host,others),true);
 const neutral=t.competitor_support.find(x=>x.host!=='4seasons-construction.com');
 assert.equal(isPromotionalSection({heading:neutral.heading,text:neutral.excerpt},neutral.host,(own.heading+' '+own.excerpt).toLowerCase()),false,'the real pre-season advice stays');
 assert.equal(isPromotionalSection({heading:'Why 3M tape matters',text:'x'},'roofer.example',''),false,'digits elsewhere change nothing');
});
test('R27: a locked destination is the primary outcome; the missing shared task is a separate research limitation',()=>{
 assert.equal(r27.editorial_decision_gate.blocker_code,'SHARED_COMPETITOR_REQUIREMENTS','production outcome before the fix');
 const destination={...r27.destination_section_comparison,destination_identity:{...r27.destination_section_comparison.destination_identity,
  destination_locked:true,destination_protected:true,locked_url:r27.destination_section_comparison.target_url}};
 const d=decideGrowthEditorialAction({report:r27,destination,coverage:r27.reader_task_coverage,serpIntent:r27.serp_intent,destinationIntent:r27.destination_intent,attempts:r27.editorial_decision_gate.attempted_sources});
 assert.equal(d.decision,'DATA_BLOCKED');assert.equal(d.blocker_code,'DESTINATION_IS_PROTECTED_CASE_STUDY');
 assert.match(d.missing_evidence[0].detail,/is itself a locked Case Study page/);
 assert.deepEqual(d.research_limitations.map(x=>x.code),['SHARED_COMPETITOR_REQUIREMENTS']);
 assert.equal(d.evidence_status.label,'CASE_STUDY_PROTECTED_NO_CHANGE_REQUIRED');
 // Unprotected, the same evidence still reports the shared-task gap as the blocker.
 const open=decideGrowthEditorialAction({report:r27,destination:{...destination,destination_identity:null},coverage:r27.reader_task_coverage,serpIntent:r27.serp_intent,destinationIntent:r27.destination_intent,attempts:[]});
 assert.equal(open.blocker_code,'SHARED_COMPETITOR_REQUIREMENTS');
});

// ---------- Report 32 (PRT /bergen-county-roofing-services/, after #200): tasks built from sales copy ----------
const r32=require('./fixtures/growth-reports-11-12/report-32-prt-bergen-tasks.json');
const {deriveReaderTasksDetailed}=require('../src/growth-derived-reader-tasks.cjs');
const {parseSerperGoogleOrganic}=require('../src/growth-public-search-discovery.cjs');
test('R32: sections written about the provider ("our team", "our 93-year history") are sales copy, not reader tasks',()=>{
 const sup=c=>r32.reader_task_coverage.tasks.find(t=>t.code===c).competitor_support;
 for(const code of ['task_contra','task_storm','task_afford']){
  const homestead=sup(code).find(x=>x.host==='homesteadroofing.com');
  assert.equal(isPromotionalSection({heading:homestead.heading,text:homestead.excerpt},homestead.host,''),true,code+': '+homestead.heading);
 }
 const permit=sup('task_replac').find(x=>x.host==='ajreliable.com');
 assert.equal(isPromotionalSection({heading:permit.heading,text:permit.excerpt},permit.host,''),false,'the permit answer is real reader information');
 // The production task set rebuilt from its own excerpts no longer contains the "affordable" or "contractor" pseudo-tasks.
 const byHost={};for(const t of r32.reader_task_coverage.tasks)for(const s of t.competitor_support)(byHost[s.host]=byHost[s.host]||[]).push({heading:s.heading,text:s.excerpt,words:s.excerpt.split(/\s+/).length});
 const competitors=Object.entries(byHost).map(([host,sections])=>({host,url:'https://'+host+'/',sections}));
 const keys=deriveReaderTasksDetailed({query:'roof repair bergen county',competitors}).tasks.map(t=>t.key);
 assert(!keys.includes('afford')&&!keys.includes('contra'),keys.join(','));
});
test('R33: every organic result that is not used is logged with a reason, so a thin SERP is explainable',()=>{
 const log=[];
 const leads=parseSerperGoogleOrganic({organic:[
  {title:'International SEO Best Practices',link:'https://moz.com/learn/seo/international-seo',position:1},
  {title:'Global expansion handbook',link:'https://example.org/handbook',position:2},
  {title:'International SEO tool pricing vs alternatives',link:'https://tool.example/pricing',position:3},
  {title:'International SEO archive',link:'https://blog.example/tag/international-seo/',position:4},
  {title:'International SEO on YouTube',link:'https://www.youtube.com/watch?v=1',position:5}]},{query:'international seo',ownUrl:'https://contentscale.site/',rejectedLog:log});
 assert.equal(leads.length,1);
 assert.deepEqual(log.map(x=>x.reason).sort(),['DIFFERENT_PRODUCT_OR_NAVIGATION_INTENT','NON_CONTENT_PATH','QUERY_TERMS_NOT_IN_TITLE','SEARCH_OR_SOCIAL_INFRASTRUCTURE']);
});
const {optionalGoogleOrganicDiscovery}=require('../src/growth-public-search-discovery.cjs');
test('R33: a thin SERP without a market costs at most one extra Serper call (page 2); a full SERP costs exactly one',async()=>{
 const org=n=>Array.from({length:n},(_,i)=>({title:'International SEO guide part '+(i+1),link:'https://site'+i+'.example/international-seo/',position:i+1}));
 const run=async pages=>{const calls=[];const r=await optionalGoogleOrganicDiscovery({query:'international seo',ownUrl:'https://contentscale.site/',key:'k',
  fetchImpl:async(u,o)=>{const b=JSON.parse(o.body);calls.push(b);return {ok:true,json:async()=>({organic:pages[(b.page||1)-1]||[]})}}});return {r,calls}};
 const full=await run([org(5)]);assert.equal(full.calls.length,1);assert.equal(full.r.next_page_retry,null);
 const thin=await run([org(2),org(6).slice(2)]);
 assert.equal(thin.calls.length,2);assert.equal(thin.calls[1].page,2);assert.equal(thin.calls[1].q,'international seo');
 assert.equal(thin.r.next_page_retry.added_leads,4);assert(thin.r.leads.length>=3);assert(thin.r.leads.some(l=>l.result_page===2));
 const still=await run([org(1),[]]);assert.equal(still.calls.length,2,'never a third call');assert.equal(still.r.next_page_retry.added_leads,0);
 // With a market the existing market-query retry is the only retry: still at most two calls.
 const calls=[];await optionalGoogleOrganicDiscovery({query:'roof repair',ownUrl:'https://x.example/',key:'k',market:{states:['NJ'],location:'New Jersey, United States'},
  fetchImpl:async(u,o)=>{calls.push(JSON.parse(o.body));return {ok:true,json:async()=>({organic:[]})}}});
 assert.equal(calls.length,2);assert.equal(calls[1].q,'roof repair New Jersey');assert.equal(calls[1].page,undefined);
});
