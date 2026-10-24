'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {analyzeReaderTaskCoverage}=require('../src/growth-reader-task-coverage.cjs');
const {decideGrowthEditorialAction}=require('../src/growth-editorial-decision-gate.cjs');
const P0='Repurpose what you already published by refreshing the examples and repurposing the best guide into new formats for each channel and audience over time.';
const P=P0+' '+P0;
const A='<h2>Intro</h2><p>'+'Scaling content means making more pages that each stay useful for the reader asking the question today. '.repeat(3)+'</p>';
const dest={url:'https://s.example/g/',html:'<h1>Guide</h1><p>Scaling is producing more pages while keeping each useful for the reader who asked a question.</p>'};
test('a truncated competitor counts for what it captured; an element cut mid-way is never evidence',()=>{
 const cutMidElement=A+'<h2>Repurposing content</h2><p>'+P.slice(0,60);
 const full=A+'<h2>Repurposing content</h2><p>'+P+'</p>';
 const cov=analyzeReaderTaskCoverage({query:'content scaling',serpIntent:'INFORMATIONAL_GUIDE',destination:dest,
  competitors:[{url:'https://a.example/x',html:full+'<h2>Next</h2><p>'+P.slice(0,40),truncated:true},{url:'https://b.example/y',html:full,truncated:false}]});
 const t=cov.tasks.find(x=>x.code==='task_repurp');
 assert.equal(cov.competitor_diagnostics.used,2);assert.equal(cov.competitor_diagnostics.used_partial_capture,1);
 assert.equal(t.independent_sources,2,'text captured before the cut counts');
 assert.equal(t.competitor_support.find(x=>x.host==='a.example').heading,'Repurposing content');
 const onlyCut=analyzeReaderTaskCoverage({query:'content scaling',serpIntent:'INFORMATIONAL_GUIDE',destination:dest,
  competitors:[{url:'https://a.example/x',html:cutMidElement,truncated:true},{url:'https://b.example/y',html:A,truncated:false}]});
 assert.equal(onlyCut.tasks.find(x=>x.code==='task_repurp')?.independent_sources??0,0,'an unclosed, cut paragraph is not evidence');
});
test('DATA_BLOCKED for too few competitors reports concrete diagnostics instead of an opaque code',()=>{
 const cov=analyzeReaderTaskCoverage({query:'content scaling',serpIntent:'INFORMATIONAL_GUIDE',destination:dest,
  competitors:[{url:'https://a.example/x',html:A,truncated:true},{url:'https://a.example/z',html:A},{url:'https://c.example/q',html:null}]});
 const d=decideGrowthEditorialAction({report:{url:'https://s.example/',growth_decision:{primary_next_action:{query:'content scaling'},protection:{}}},
  destination:{target_url:dest.url,status:'FULL_SECTION_COMPARISON_RESEARCH_ONLY'},coverage:cov,
  serpIntent:{status:'SERP_INTENT_OBSERVED',intent:'INFORMATIONAL_GUIDE',agreeing_leads:3,organic_leads_considered:4,leads:[]},destinationIntent:{verdict:'COMPATIBLE'},attempts:[]});
 assert.equal(d.decision,'DATA_BLOCKED');const m=d.missing_evidence.find(x=>x.code==='READABLE_COMPETITOR_ARTICLES');
 assert.match(m.detail,/received 3/);assert.match(m.detail,/without HTML 1/);assert.match(m.detail,/distinct sites 1/);
});
