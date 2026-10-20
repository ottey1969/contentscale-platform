'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {autonomouslyFindGrowthOpportunity}=require('../src/growth-autonomous-opportunity.cjs');
test('Growth editorial actions are grounded in actual same-site paragraphs, never the same generic outline',()=>{
 const destination='https://example.org/roof-leak-repair/';
 const report={url:'https://example.org/',growth_decision:{
  primary_next_action:{query:'roof leak repair',metrics:{impressions:50,clicks:1,average_position:12,ctr_pct:2}},
  protection:{case_study_locked:true,preserve_existing_top_rankings:true},
  protected_queries:[]
 },site_architecture:{candidates:[{url:destination,tracked_keyword:'roof leak repair'}]}};
 const discovery={source:'SERPER_GOOGLE_ORGANIC',leads:[
  {url:'https://other.example/roof-leaks',source:'SERPER_GOOGLE_ORGANIC'},
  {url:'https://elsewhere.example/repair',source:'SERPER_GOOGLE_ORGANIC'}
 ]};
 const evidence={evidence_passages:{definition:['A roof leak may be visible as staining after heavy rain.'],measurement:[]}};
 const outcome=autonomouslyFindGrowthOpportunity({report,discovery,existingPageReviews:[{
  url:destination,verified_live:true,title:'Roof Leak Repair in NJ',h1:['Roof Leak Repair'],h2:[],body_evidence:evidence
 }]});
 assert.equal(outcome.editorial_package.proposed_target_url,destination);
 assert.equal(outcome.editorial_package.reader_steps_status,'SOURCE_DERIVED_REVIEW_QUEUE');
 assert.equal(outcome.editorial_package.reader_steps.length,1);
 assert.equal(outcome.editorial_package.reader_steps[0].observed_passage,evidence.evidence_passages.definition[0]);
 assert.equal(outcome.editorial_package.reader_steps[0].evidence_status,'EXISTING_PASSAGE_OBSERVED_NO_GAP_PROVEN');
 assert.equal(outcome.safeguards.publication_allowed,false);
});
test('Growth never fabricates a content workflow when no readable destination exists',()=>{
 const report={url:'https://example.org/',growth_decision:{primary_next_action:{query:'roof repair',metrics:{impressions:15,clicks:0,average_position:10}}},site_architecture:{candidates:[]}};
 const outcome=autonomouslyFindGrowthOpportunity({report,discovery:{source:'BING_PUBLIC_RSS',leads:[]}});
 assert.equal(outcome.editorial_package.reader_steps.length,0);
 assert.equal(outcome.editorial_package.reader_steps_status,'NO_OBSERVED_SOURCE_PASSAGES');
 assert.equal(outcome.editorial_package.can_publish,false);
});
