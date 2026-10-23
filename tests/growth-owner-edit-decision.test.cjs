'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {decideOwnerGrowthEdit}=require('../src/growth-owner-edit-decision.cjs');
const url='https://roof.example/leak-repair/';
const report={url,case_study_locked:false,
 editorial_decision_gate:{decision:'NEEDS_EVIDENCE',focus_query:'roof leak repair',facts:[],uncertainties:[],evidence:[]},
 destination_section_comparison:{target_url:url,comparisons:[{
  competitor_url:'https://other.example/leaks',competitor_heading:'Roof leak inspection',
  competitor_excerpt:'Inspect the water entry point and affected roofing materials before selecting a repair. Identify obvious signs and discuss limits.',
  nearest_existing_section:{heading:'Roof Leak Repair',excerpt:'Roof leak repair begins with inspecting the damage and finding where water enters the home.'},
  match_status:'POSSIBLE_TOPICAL_MATCH_REVIEW_REQUIRED'
 }]}};
const completion={target_url:url,draft:{sections:[{h2:'Assess roof leaks safely',paragraphs:[
 'A roof leak inspection should begin by locating visible water entry and documenting the affected roofing material before planning a repair. The inspection scope depends on the observed condition.'
 ]}]}};
test('reviewable source-backed improvement does not claim a proven gap or publish',()=>{
 const r=decideOwnerGrowthEdit({report,completion});
 assert.equal(r.decision,'IMPROVE_EXISTING');
 assert.equal(r.copy_ready,true);
 assert.equal(r.verified_gap,false);
 assert.equal(r.publish_allowed,false);
 assert.equal(r.target_section,'Roof Leak Repair');
 assert.ok(r.proposed_text.includes('roof leak'));
 assert.equal(r.evidence.length,2);
});
test('Case Study locked rejects automatic changes even with a complete source-backed draft',()=>{
 const r=decideOwnerGrowthEdit({report:{...report,case_study_locked:true},completion});
 assert.equal(r.decision,'NEEDS_EVIDENCE');
 assert.equal(r.copy_ready,false);
 assert.equal(r.publish_allowed,false);
});
test('no peer evidence or invented draft cannot be passed as a validated improvement',()=>{
 const r=decideOwnerGrowthEdit({report:{...report,destination_section_comparison:{target_url:url,comparisons:[]}},completion});
 assert.equal(r.decision,'NEEDS_EVIDENCE');assert.equal(r.copy_ready,false);
 const a=decideOwnerGrowthEdit({report,completion:{...completion,draft:{sections:[{h2:'Placeholder',paragraphs:['Too short']}]}}});
 assert.equal(a.copy_ready,false);
});
