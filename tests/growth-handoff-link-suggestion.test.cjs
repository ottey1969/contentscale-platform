'use strict';
// Owner 2026-11-01: the CMS package showed only the placeholders "https://example.com/service/" and "Related service"
// for /content-scaling/, although the research (report 70) names the next page for the reader. The reader route below is
// copied from report 70; the rest of the report is reduced to what the suggestion reads.
const test=require('node:test'),assert=require('node:assert/strict');
const {proposeHandoffFromResearch}=require('../src/growth-research-handoff-suggestions.cjs');
const URL_='https://contentscale.site/content-scaling/';
const funnel={status:'FUNNEL_PROPOSAL',for_url:URL_,stages:[{stage:'INFORMATION',url:URL_},
 {stage:'ACTION',url:'https://contentscale.site/ai-content-quality-checker/',keyword:'ai content quality checker',basis:'ACTION_KEYWORD',
  link:{status:'WRITE_OWN_LINK_TEXT',under_heading:'📑 Table of Contents',anchor_text:'quality',action:'No paragraph names this page clearly (the only match is the single word “quality”). Add one link at the end of your answer with text that says where it goes, for example “ai content quality checker”.'}}]};
const base={success:true,url:URL_,page_content:{headings:{title:'t',description:'d'}},site_architecture:{candidates:[]},reader_funnel:funnel};

test('without a contextual candidate, the reader route names the internal link, with the reason',()=>{
 const x=proposeHandoffFromResearch(base,URL_);
 assert.equal(x.internal_url,'https://contentscale.site/ai-content-quality-checker/');
 assert.equal(x.internal_label,'AI content quality checker','a one-word anchor (“quality”) is not used as link text; the keyword is written as link text');
 assert.equal(x.internal_basis,'READER_ROUTE_NEXT_STEP');assert.match(x.internal_reason,/information → action/);
});
test('a contextual candidate still wins; a route for another page or another site is never used',()=>{
 const own={...base,site_architecture:{candidates:[{url:'https://contentscale.site/content-at-scale/',tracked_keyword:'content at scale',status:'CONTEXTUAL_INTERNAL_LINK_CANDIDATE'}]}};
 assert.equal(proposeHandoffFromResearch(own,URL_).internal_basis,'CONTEXTUAL_INTERNAL_LINK_CANDIDATE');
 assert.equal(proposeHandoffFromResearch({...base,reader_funnel:{...funnel,for_url:'https://contentscale.site/other/'}},URL_).internal_url,null);
 const ext={...funnel,stages:[{stage:'ACTION',url:'https://example.org/x/',keyword:'x'}]};
 assert.equal(proposeHandoffFromResearch({...base,reader_funnel:ext},URL_).internal_url,null);
});
test('real link text from the paragraph is kept when it has two or more words',()=>{
 const f={...funnel,stages:[funnel.stages[0],{...funnel.stages[1],link:{status:'LINK_CANDIDATE_FOR_REVIEW',anchor_text:'content quality checker'}}]};
 assert.equal(proposeHandoffFromResearch({...base,reader_funnel:f},URL_).internal_label,'content quality checker');
});
