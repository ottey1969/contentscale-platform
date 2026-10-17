'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {proposeHandoffFromResearch}=require('../src/growth-research-handoff-suggestions.cjs');
const url='https://example.org/roof-repair/';
const report={success:true,url,page_id:42,summary:{primary_source:'LIVE_PUBLIC_HTML_OBSERVED'},
 page_content:{headings:{title:'Roof Repair',description:'Actual site owner page description'}},
 search:{focus_query:'roof repair',verified_queries:[{query:'roof repair in nj'}]},
 site_architecture:{candidates:[{url:'https://example.org/roof-maintenance/',tracked_keyword:'roof maintenance',status:'CONTEXTUAL_INTERNAL_LINK_CANDIDATE'},
 {url:'https://other.example/page/',status:'CONTEXTUAL_INTERNAL_LINK_CANDIDATE'}]},
 editorial:{candidate_sections:[{proposed_topic:'Inspection preparation',derived_from:'https://rival.example/page/'}]}};
let p=proposeHandoffFromResearch(report,url);
assert.equal(p.safe,true);
assert.equal(p.query,'roof repair in nj');
assert.equal(p.title,'Roof Repair');
assert.equal(p.internal_url,'https://example.org/roof-maintenance/');
assert.equal(p.candidate_headings[0].requires_editor_verification,true);
assert.equal(p.publication_allowed,false);
assert.equal(p.copy_requires_real_checked_facts,true);
assert.equal(proposeHandoffFromResearch(report,'https://wrong.example/').safe,false);
p=proposeHandoffFromResearch({success:true,url,page_content:{headings:{}},search:{focus_query:'roof repair'}},url);
assert.equal(p.safe,true);assert.equal(p.title,'');assert.equal(p.meta,'');assert.equal(p.verified_query,false);
const ui=fs.readFileSync('public/growth-cms-neutral-handoff.js','utf8');
assert(ui.includes('void loadResearchSuggestions(data)'));
assert(ui.includes('handoff_suggestions'));
assert(!ui.includes("$('approved').checked=true"));
const html=fs.readFileSync('public/growth-cms-neutral-handoff.html','utf8');
assert(html.includes('growthResearchHints'));
console.log('PASS source-backed Growth-to-CMS suggestions, no fake claims or auto-approval');