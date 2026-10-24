'use strict';
// Local-service pipeline through the real GET/POST routes. EVERY page, lead and draft here is SYNTHETIC test input
// (no real client data, not production evidence). It proves behaviour for a local service page: local SERP intent,
// compatible existing destination (no new page), derived reader task, claim guard on sourced vs unsourced credentials,
// protected Case Study (no writes), no publication.
const test=require('node:test'),assert=require('node:assert/strict');
const {registerGrowthAutomaticResearch}=require('../src/tracker-growth-automatic-routes.cjs');
const URL_='https://acme-roofing.example/roof-repair-lodi-nj/',HOME='https://acme-roofing.example/';
const ownHtml='<html><head><title>Roof Repair in Lodi, NJ | Acme Roofing</title></head><body><h1>Roof Repair in Lodi, NJ</h1>'+
 '<h2>Our roof repair services</h2><p>Our crew repairs leaking roofs, replaces damaged tiles and seals flashing for homes in Lodi and nearby towns, and we explain every repair we recommend before we start working on your property.</p>'+
 '<h2>Why homeowners call us</h2><p>We are licensed and insured in New Jersey, and we send a technician to look at the damage after you call us about a leak, so you know what is wrong with the roof before you decide anything.</p></body></html>';
const comp=(h,rows)=>'<html><body><article><h1>'+h+'</h1>'+rows.map(([a,b])=>'<h2>'+a+'</h2><p>'+b+'</p>').join('')+'</article></body></html>';
const estimateA='A repair estimate lists materials, labour and access. The estimate should explain how hidden decking damage changes the estimate, and a written estimate lets you compare quotes from different crews before you approve any work on the property, which is why each estimate should be itemised clearly.';
const estimateB='Ask the contractor for a written estimate that separates materials from labour. A clear estimate also states what happens if hidden damage appears, so the final invoice never surprises you after the old layer is removed from the roof, and an itemised estimate makes that comparison easy.';
const pages={'https://roofer-a.example/roof-repair-nj/':comp('Roof repair in Paterson, NJ',[['How a repair estimate is built',estimateA]]),
 'https://roofer-b.example/services/roof-repair/':comp('Roof repairs in Bergen County, NJ',[['What goes into an estimate',estimateB]])};
const leads=[['https://roofer-a.example/roof-repair-nj/','Roof Repair in Paterson, NJ | Roofer A'],['https://roofer-b.example/services/roof-repair/','Roof Repairs in Bergen County NJ - Roofer B'],
 ['https://roofer-c.example/near-me/','Emergency Roof Repair Near Me | Roofer C'],['https://roofer-d.example/hackensack/','Roof Repair Contractors in Hackensack, NJ']]
 .map(([url,title],i)=>({url,title,snippet:'Local roof repair',source:'SERPER_GOOGLE_ORGANIC',serp_position:i+1}));
function harness(drafts,{flaky={}}={}){
 const route={},writes=[],providerCalls=[],fetchCalls={};
 const db={async query(sql){
  if(/^\s*(UPDATE|INSERT|DELETE|CREATE|ALTER)\b/i.test(sql)){writes.push(sql);throw Error('No writes permitted')}
  if(sql.includes('LEFT(html_content'))return {rows:[{id:77,tracker_client_id:4,url:URL_,keyword:'roof repair lodi nj',saved_html:ownHtml}]};
  return {rows:[]};
 }};
 registerGrowthAutomaticResearch({get(p,...h){route[p]=h},post(p,...h){route[p]=h}},db,(req,res,next)=>{req.growthTrackerClientId=4;
  req.growth={can_edit:req.params.token==='owner-token',pages:[{id:77,url:URL_,keyword:'roof repair lodi nj',case_study_active:true}]};next()},{
  retryDelayMs:0,
  fetchLive:async url=>{fetchCalls[url]=(fetchCalls[url]||0)+1;if(flaky[url]>0){flaky[url]--;throw Object.assign(new Error('HTTP_202'),{code:'HTTP_202'})}
   const html=url===URL_?ownHtml:pages[url];if(!html)throw Object.assign(Error('x'),{code:'PUBLIC_HTML_UNAVAILABLE'});
   return {html,final_url:url,retrieved_at:'2026-10-24T10:00:00Z',truncated:false,source:'LIVE_PUBLIC_HTTPS'}},
  searchLive:async()=>({status:'FRESH_GOOGLE_ORGANIC_LEADS',source:'SERPER_GOOGLE_ORGANIC',query:'roof repair lodi nj',leads,provider_attempts:['BING_PUBLIC_RSS','SERPER_GOOGLE_ORGANIC'],checked_at:'2026-10-24T10:00:00Z'}),
  completeOwnerDraft:async({body})=>{providerCalls.push(body);const d=drafts.shift();
   return {statusCode:200,body:d?{success:true,page_id:body.page_id,canonical_url:URL_,status:'AI_DRAFT_REVIEW_REQUIRED',draft_source_type:'LIVE_PUBLIC_HTML',live_competitor_observations_used:2,
    draft:{seo_title:null,meta_description:null,sections:[d]}}:{success:false,code:'NO_STUB'}}}});
 const call=async(path,token)=>{const req={params:{token},query:{page_id:'77'}},res={statusCode:200,status(x){this.statusCode=x;return this},set(){return this},type(){return this},json(x){this.body=x;return this},send(x){this.body=x;return this}};
  const stack=route[path];await new Promise((ok,bad)=>{const at=i=>{if(i>=stack.length)return ok();Promise.resolve(stack[i](req,res,()=>at(i+1))).then(()=>{if(i===stack.length-1)ok()},bad)};at(0)});return res};
 return {call,writes,providerCalls,fetchCalls,GET:'/api/tracker-client/:token/growth/auto-research',POST:'/api/tracker-client/:token/growth/auto-research/complete'};
}
const STRONG={h2:'How to read a roof repair estimate',paragraphs:['A written estimate should list the materials, the labour and any special access the crew needs, so ask for every line before you approve the work and ask how the estimate changes if hidden damage is found.',
 'We are licensed and insured in New Jersey, and we send a technician to look at the damage first, so the estimate you receive is based on what we actually saw on your roof.']};
test('local service: local intent, compatible existing page (no new page), derived task, protected Case Study',async()=>{
 const h=harness([]),g=await h.call(h.GET,'client-token'),b=g.body;
 assert.equal(b.serp_intent.intent,'LOCAL_SERVICE');assert.equal(b.destination_intent.verdict,'COMPATIBLE');
 const d=b.editorial_decision_gate;
 assert.equal(d.decision,'IMPROVE_EXISTING','an existing page can serve the local intent; no NEW_DISTINCT_PAGE');
 assert.equal(d.target_url,URL_);assert(d.improvement_plan.tasks[0].match.key.startsWith('estima'));
 assert.equal(d.improvement_plan.tasks[0].competitor_evidence.length,2);assert.equal(d.copy_ready,false);
 assert.equal(b.destination_gsc_evidence.metrics,null,'no GSC: no invented measurements');
 assert.equal(b.case_study_locked,true);assert.equal(h.writes.length,0);assert.equal(h.providerCalls.length,0);
});
test('local service: strong sourced draft is offered for review; the sourced credential is allowed',async()=>{
 const h=harness([STRONG]),r=await h.call(h.POST,'owner-token'),d=r.body.editorial_work_packet.editorial_decision;
 assert.equal(d.decision,'IMPROVE_EXISTING');assert.equal(d.copy_ready,true,JSON.stringify(d.draft_rejections||d.copy_status));
 assert.equal(d.publish_allowed,false);assert.equal(d.case_study_unchanged,true);assert.equal(r.body.report_completion.automatic_publishing,false);
 assert.equal(d.placement.mode,'ADD_AFTER_SECTION');assert(d.placement.section_heading);assert.match(r.body.handoff_package.markdown,/Placement:/);
 assert.equal(h.writes.length,0);
});
test('local service: weak and unsupported drafts are rejected with concrete reasons, never offered',async()=>{
 const cases=[
  [{h2:'How to read a roof repair estimate',paragraphs:['A written estimate should list materials and labour, and the estimate guarantees the lowest price in New Jersey for every roof repair we complete.','Our award-winning team has repaired 4,000 roofs and a clear estimate will improve your rankings and bring more leads.']},['ABSOLUTE_CLAIM','UNSOURCED_NUMBER','UNSOURCED_CREDENTIAL_CLAIM','UNPROVEN_OUTCOME_CLAIM']],
  [{h2:'Our crew',paragraphs:['We are the most trusted roofers in Lodi and we always arrive within the hour, no matter the weather or the time of day.','Every customer loves us and we are rated first on Google for roof repair near you today.']},null]
 ];
 for(const [draft,codes] of cases){
  const h=harness([draft]),r=await h.call(h.POST,'owner-token'),d=r.body.editorial_work_packet.editorial_decision;
  assert.equal(d.copy_ready,false);assert.equal(d.proposed_text,undefined);assert.equal(r.body.report_completion.status,'RESEARCH_COMPLETE_DRAFT_NOT_READY');
  assert(d.draft_rejections.length>0,'a concrete reason is returned');
  assert.match(r.body.handoff_package.markdown,/rejected: /,'the owner package explains the rejection');
  if(codes){const got=d.draft_rejections.flatMap(x=>(x.claim_violations||[]).map(v=>v.code));for(const c of codes)assert(got.includes(c),c+' missing from '+got)}
 }
});
test('local service: a sourced softening is applied and logged for the reviewer',async()=>{
 const soft={h2:'How to read a roof repair estimate',paragraphs:['A written estimate should list the materials and the labour, and an itemised estimate always makes it easier to compare crews before you approve the work on your roof.']};
 const h=harness([soft]),r=await h.call(h.POST,'owner-token'),d=r.body.editorial_work_packet.editorial_decision;
 assert.equal(d.copy_ready,true,JSON.stringify(d.draft_rejections||d.copy_status));assert.match(d.proposed_text,/usually makes it easier/);
 assert.equal(d.safe_rewrites.length,1);assert.equal(d.safe_rewrites[0].changes[0].from,'always');
 assert.match(r.body.handoff_package.markdown,/Wording changed automatically/);
});

test('a competitor answering HTTP 202 (accepted, not ready) is retried exactly once',async()=>{
 const a='https://roofer-a.example/roof-repair-nj/';
 const ok=harness([],{flaky:{[a]:1}}),g=await ok.call(ok.GET,'client-token');
 assert.equal(ok.fetchCalls[a],2,'one retry');assert.equal(g.body.reader_task_coverage.competitor_diagnostics.used,2);
 assert(!g.body.evidence_warnings.includes('COMPETITOR_LIVE_HTTP_202'));assert.equal(g.body.editorial_decision_gate.decision,'IMPROVE_EXISTING');
 const stuck=harness([],{flaky:{[a]:5}}),s=await stuck.call(stuck.GET,'client-token');
 assert.equal(stuck.fetchCalls[a],2,'never more than one retry');assert(s.body.evidence_warnings.includes('COMPETITOR_LIVE_HTTP_202'));
 assert.equal(s.body.editorial_decision_gate.decision,'DATA_BLOCKED','one remaining competitor is not enough, and the report says why');
 assert(s.body.editorial_decision_gate.missing_evidence.some(x=>x.code==='READABLE_COMPETITOR_ARTICLES'&&/received/.test(x.detail)));
});
