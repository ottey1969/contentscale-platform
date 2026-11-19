'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {summarizeFreeGrowth}=require('../src/growth-free/summary.cjs');
const query='Who offers 24-hour emergency roof repair in New Jersey?';
const report={
 url:'https://example.com/emergency/',
 editorial_decision_gate:{decision:'DATA_BLOCKED',blocker_code:'SUBSTANTIVE_GAP_NOT_VERIFIED',focus_query:query},
 search_discovery:{target_query:query,competitor_fetch_log:[{outcome:'READABLE',url:'https://a.example/page',serp_position:1},{outcome:'READABLE',url:'https://b.example/page',serp_position:2}]},
 competitor_overview:{status:'OBSERVED',topics_status:'GROUPED',ranking_pages_read:2,
  topics:[{topic:'Generic roofing guides',this_page:'NO',sections:[
   {url:'https://a.example/page',host:'a.example',heading:'Roofing guides',excerpt:'View our collection of roofing guides'},
   {url:'https://b.example/page',host:'b.example',heading:'Roofing guides',excerpt:'Browse related home improvement articles'}]}],
  ungrouped_sections:[],ranking_pages:[],elements_they_have_and_this_page_lacks:[],structured_data_they_have_and_this_page_lacks:[]}
};
test('A blocked editorial gate cannot recommend or automatically write competitor topics in Free Growth',()=>{
 const s=summarizeFreeGrowth(report,{url:report.url,query});
 assert.equal(s.decision,'DATA_BLOCKED');
 assert.equal(s.gaps.writing_allowed,false);
 assert.equal(s.gaps.evidence.status,'INSUFFICIENT_EVIDENCE');
 assert.deepEqual(s.gaps.recommended,[]);
 assert.ok(s.gaps.items.length>=1,'the findings remain visible for human review');
 assert.ok(s.gaps.items.every(x=>x.recommended===false));
 assert.match(s.headline,/Not enough reliable evidence/i);
});
