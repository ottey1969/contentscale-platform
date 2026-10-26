'use strict';
// Producer -> gate contract for verified_editorial_opportunity (unit level, no network, no provider).
const test=require('node:test'),assert=require('node:assert/strict');
const {produceVerifiedEditorialOpportunity}=require('../src/growth-verified-opportunity.cjs');
const {decideGrowthEditorialAction}=require('../src/growth-editorial-decision-gate.cjs');
const T='https://site.example/guide/',HOME='https://site.example/';
const destHtml='<h1>What is scaling</h1><p>Scaling means producing more pages while keeping each page useful for the reader who asked a question.</p>';
const compHtml='<h2>Repurposing content</h2><p>Repurpose what you already published by refreshing the examples and recycling the best guide into new formats for each channel and audience.</p>';
const plan={decision:'IMPROVE_EXISTING',focus_query:'content scaling',target_url:T,protected_url:HOME,improvement_plan:{target_url:T,tasks:[{code:'task_repurp',match:{key:'repurp',co_terms:[]},
 label:'Competitors teach repurposing',destination_status:'NOT_OBSERVED',placement:{mode:'ADD_AFTER_SECTION',section_heading:'What is scaling',reason:'r'},
 competitor_evidence:[{url:'https://a.example/x',heading:'Reusing content',excerpt:'Reuse and repurpose what you already published by refreshing examples.'}],destination_evidence:[]}]}};
const report={url:HOME,editorial_decision_gate:plan,reader_task_coverage:{task_set:'INFORMATIONAL_PROCESS'}};
const good={target_url:T,draft:{sections:[{h2:'Repurpose what you already published',paragraphs:[
 'Before writing anything new, decide which existing pages to repurpose: update their examples, correct outdated steps and repurpose the strongest guide as a checklist for another channel.']}]}};
const src={destinationHtml:destHtml,competitorHtml:[compHtml]};

test('producer verifies a draft that teaches the planned missing task',()=>{
 const r=produceVerifiedEditorialOpportunity({report,completion:good,sources:src});
 assert.equal(r.status,'VERIFIED_IMPROVE_EXISTING');const o=r.opportunity;
 assert.equal(o.verified,true);assert.equal(o.type,'IMPROVE_EXISTING');assert.equal(o.focus_query,'content scaling');
 assert.equal(o.target_url,T);assert(o.proposed_text.length>=80);assert(o.evidence.some(e=>e.source_url&&e.excerpt));
 assert.deepEqual(o.task_codes,['task_repurp']);
});
test('producer returns null (never invents) without a draft, with an off-task draft, a duplicate or reused competitor wording',()=>{
 assert.equal(produceVerifiedEditorialOpportunity({report,completion:{target_url:T,draft:null},sources:src}).opportunity,null);
 const off={target_url:T,draft:{sections:[{h2:'Pricing and plans',paragraphs:['Compare every plan next to its monthly cost and add a short table for buyers who want to contact sales about custom quotes.']}]}};
 assert.equal(produceVerifiedEditorialOpportunity({report,completion:off,sources:src}).status,'DRAFT_FAILED_TASK_VERIFICATION');
 const copied={target_url:T,draft:{sections:[{h2:'Repurpose',paragraphs:['Repurpose what you already published by refreshing the examples and recycling the best guide into new formats for each channel and audience today.']}]}};
 const r=produceVerifiedEditorialOpportunity({report,completion:copied,sources:src});
 assert.equal(r.opportunity,null);assert(r.rejections.some(x=>x.code==='DRAFT_REUSES_COMPETITOR_WORDING'));
 const wrongTarget=produceVerifiedEditorialOpportunity({report,completion:{...good,target_url:'https://site.example/other/'},sources:src});
 assert.equal(wrongTarget.opportunity,null,'target URL identity must match the gate');
});
test('gate turns a planned improvement into copy_ready only with a matching verified opportunity',()=>{
 const args={report:{...report,url:HOME,growth_decision:{protection:{case_study_locked:true},primary_next_action:{query:'content scaling'}}},
  destination:{target_url:T,comparisons:[],status:'FULL_SECTION_COMPARISON_RESEARCH_ONLY'},
  coverage:{competitors_considered:[{url:'a'},{url:'b'}],destination_truncated:false,tasks:[{code:'task_repurp',match:{key:'repurp',co_terms:[]},label:'Reuse',supported_by_competitors:true,independent_sources:2,
   competitor_support:[{url:'https://a.example/x',heading:'h',excerpt:'e'},{url:'https://b.example/y',heading:'h',excerpt:'e'}],destination:{status:'NOT_OBSERVED',passages:[]},covered_elsewhere_on_site:[],placement:{mode:'ADD_AFTER_SECTION',section_heading:'What is scaling',reason:'r'}}],destination_section_headings:['What is scaling']},
  serpIntent:{status:'SERP_INTENT_OBSERVED',intent:'INFORMATIONAL_GUIDE',agreeing_leads:3,organic_leads_considered:4,leads:[]},destinationIntent:{class:'INFORMATIONAL_GUIDE',verdict:'COMPATIBLE'},attempts:[]};
 const planned=decideGrowthEditorialAction(args);
 assert.equal(planned.decision,'IMPROVE_EXISTING');assert.equal(planned.copy_ready,false);assert.equal(planned.verified_gap,false,'not verified before a draft passes');assert.equal(planned.gap_observed,true,'task-level gap evidence is recorded separately');
 const opp={verified:true,type:'IMPROVE_EXISTING',producer:'P',focus_query:'content scaling',target_url:T,target_section:'What is scaling',
  proposed_text:'x'.repeat(90),evidence:[{source_url:'https://a.example/x',excerpt:'quoted'}]};
 const done=decideGrowthEditorialAction({...args,report:{...args.report,verified_editorial_opportunity:opp}});
 assert.equal(done.decision,'IMPROVE_EXISTING');assert.equal(done.copy_ready,true);assert.equal(done.verified_by,'P');assert.equal(done.publish_allowed,false);
 assert(done.improvement_plan,'plan stays attached');
 for(const bad of [{...opp,verified:false},{...opp,focus_query:'other query'},{...opp,target_url:'https://site.example/x/'},{...opp,type:'NEW_DISTINCT_PAGE'},
   {...opp,proposed_text:'short'},{...opp,evidence:[]}]){
  const r=decideGrowthEditorialAction({...args,report:{...args.report,verified_editorial_opportunity:bad}});
  assert.equal(r.copy_ready,false,'mismatched or weak opportunity must not unlock copy: '+JSON.stringify(Object.keys(bad).filter(k=>bad[k]!==opp[k])));
 }
});
test('new page needs both distinct-intent and overlap flags even from the producer',()=>{
 const g={decision:'NEW_DISTINCT_PAGE',focus_query:'q one',target_url:T,new_page_plan:{working_query:'q one',facts_source_url:T,tasks:[{code:'x',label:'l',competitor_evidence:[{url:'https://a.example/x',heading:'h',excerpt:'e'}]}]},
  distinct_intent_evidence:{destination:{verdict:'DIFFERENT'}}};
 const secs=[{h2:'First step',paragraphs:['Begin with a content audit: list every page, note the question it answers and mark the ones that are stale or overlap with each other.']},
  {h2:'Second step',paragraphs:['Plan a repeatable workflow with an owner for each step so briefs, drafting, editing and approval happen the same way every time.']}];
 const r=produceVerifiedEditorialOpportunity({report:{editorial_decision_gate:g,reader_task_coverage:{}},completion:{target_url:T,draft:{sections:secs}},sources:{competitorHtml:[]}});
 assert.equal(r.opportunity.type,'NEW_DISTINCT_PAGE');assert.equal(r.opportunity.site_overlap_checked,true);assert.equal(r.opportunity.distinct_intent_verified,true);
 const thin=produceVerifiedEditorialOpportunity({report:{editorial_decision_gate:g,reader_task_coverage:{}},completion:{target_url:T,draft:{sections:[secs[0]]}},sources:{}});
 assert.equal(thin.opportunity,null);
});
test('NO_CHANGE and DATA_BLOCKED never request copy',()=>{
 for(const d of ['NO_CHANGE','DATA_BLOCKED'])
  assert.equal(produceVerifiedEditorialOpportunity({report:{editorial_decision_gate:{decision:d,focus_query:'q'}},completion:good,sources:src}).opportunity,null);
});
