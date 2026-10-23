'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {decideGrowthEditorialAction}=require('../src/growth-editorial-decision-gate.cjs');
const {chooseGrowthNextAction}=require('../src/growth-one-action-decision.cjs');
const {evaluateExistingBody}=require('../src/growth-existing-body-evidence.cjs');
const url='https://roof.example/roof-repair/';
const compare={status:'FULL_SECTION_COMPARISON_RESEARCH_ONLY',target_url:url,comparisons:[{
  competitor_url:'https://example.org/roof-repair-guide',competitor_heading:'Inspecting roof repairs',
  competitor_excerpt:'Roof repairs require an inspection of damaged roofing material and identifying the water entry point.',
  nearest_existing_section:{heading:'How we inspect roof damage',excerpt:'We inspect the roof before recommending a repair.'},
  match_status:'POSSIBLE_TOPICAL_MATCH_REVIEW_REQUIRED'
}]};
test('source-page intent survives missing Google Search Console without fabricated metrics',()=>{
 const d=chooseGrowthNextAction({page:{url,keyword:'roof repair'},queries:[],headings:{title:'Roof repair service',h1:['Roof Repair'],h2:[]}});
 assert.equal(d.primary_next_action.query,'roof repair');
 assert.equal(d.primary_next_action.metrics,null);
});
test('no content-scaling-specific evidence for roofing',()=>{
 const ev=evaluateExistingBody({query:'roof repair',html:'<h1>Roof Repair</h1><p>Roof repair begins with an inspection of damaged materials and water entry.</p>'});
 assert.equal(ev.evidence_checks.query_answer,true);
 assert.ok(ev.evidence_passages.query_answer.length);
 assert.equal(Object.hasOwn(ev.evidence_checks,'inventory'),false);
});
test('verified, protected Case Study gives a NO_CHANGE decision, not an invented rewrite',()=>{
 const report={url,search:{focus_query:'roof repair'},growth_decision:{protection:{case_study_locked:true},protected_queries:[{query:'roof repair',position:1.2,clicks:50}]}};
 const d=decideGrowthEditorialAction({report,destination:compare});
 assert.equal(d.decision,'NO_CHANGE');assert.equal(d.publish_allowed,false);
});
test('insufficient comparisons returns explicit NEEDS_EVIDENCE with source reason',()=>{
 const report={url,search:{focus_query:'roof repair'},growth_decision:{primary_next_action:{query:'roof repair'}}};
 const d=decideGrowthEditorialAction({report,destination:{target_url:url,status:'NO_COMPARABLE_COMPLETE_SECTIONS',comparisons:[]}});
 assert.equal(d.decision,'NEEDS_EVIDENCE');assert.equal(d.blocker_code,'PAIRED_EVIDENCE_MISSING');assert.ok(d.missing_evidence.length&&Array.isArray(d.attempted_sources));
});
test('a verified edit must provide concrete factual text and source evidence',()=>{
 const report={url,search:{focus_query:'roof repair'},growth_decision:{primary_next_action:{query:'roof repair'}},verified_editorial_opportunity:{
  verified:true,focus_query:'roof repair',target_url:url,type:'IMPROVE_EXISTING',target_section:'How we inspect roof damage',
  proposed_text:'Before scheduling a roof repair, assess the roof condition, locate the water entry point, and record the affected material. Use those observations to select a repair plan for the exact damaged section.',
  evidence:[{source_url:url,excerpt:'We inspect the roof before recommending a repair.'}]
 }};
 const d=decideGrowthEditorialAction({report,destination:compare});
 assert.equal(d.decision,'IMPROVE_EXISTING');assert.equal(d.copy_ready,true);
 assert.equal(d.publish_allowed,false);
});
test('unverified new pages are blocked',()=>{
 const report={url,search:{focus_query:'roof repair'},verified_editorial_opportunity:{
  verified:false,focus_query:'roof repair',target_url:url,type:'NEW_DISTINCT_PAGE'
 }};
 const d=decideGrowthEditorialAction({report,destination:compare});
 assert.equal(d.decision,'NEEDS_EVIDENCE');
});
