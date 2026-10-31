'use strict';
// Possible new pages from the owner's own Search Console rows, and the route from information to action.
// LABELLED SYNTHETIC: the Search Console rows and the tracked-page list (no production GSC export was available).
const test=require('node:test'),assert=require('node:assert/strict');
const {spokeCandidates,readerFunnel}=require('../src/growth-next-pages.cjs');

const HOME='https://contentscale.site/';
const site=[{id:2,url:'https://contentscale.site/ai-citations-tracker/',keyword:'ai citation tracker'},
 {id:3,url:'https://contentscale.site/pricing/',keyword:'contentscale pricing'},
 {id:4,url:'https://contentscale.site/blog/core-update-traffic-drop/',keyword:'traffic drop after core update'}];
const row=(query,impressions,position,clicks=0)=>({query,impressions,position,clicks});

test('possible new pages: deep terms the page already appears for; brand, own focus, page one and other pages left out',()=>{
 const r=spokeCandidates({pageUrl:HOME,focusQuery:'content quality score',siteGsc:[{page_id:2,query:'ai citation tracking tool',position:6}],sitePages:site,gscRows:[
  row('what is generative engine optimization',120,24),row('generative engine optimization explained',40,31),
  row('contentscale',300,1,90),row('content quality score',80,14),row('seo content checker',60,4,5),
  row('ai citation tracking tool',50,18),row('traffic drop after core update',35,22),row('geo checklist',5,30)]});
 assert.equal(r.status,'CANDIDATES_FROM_SEARCH_CONSOLE');
 assert.deepEqual(r.candidates.map(c=>c.query),['what is generative engine optimization','generative engine optimization explained'].slice(0,r.candidates.length));
 assert.equal(r.candidates.length,2,'different word sets stay separate candidates');
 assert.equal(r.candidates[0].status,'POSSIBLE_NEW_PAGE_RESEARCH_FIRST');assert.match(r.candidates[0].next,/Pre-Write brief/);
 assert.deepEqual(r.belongs_elsewhere.map(x=>x.url),['https://contentscale.site/ai-citations-tracker/','https://contentscale.site/blog/core-update-traffic-drop/']);
 assert.equal(r.belongs_elsewhere[0].basis,'BETTER_POSITION_ON_THAT_PAGE');
 for(const q of ['contentscale','content quality score','seo content checker','geo checklist'])assert(!r.candidates.some(c=>c.query===q),q+' is not a new page');
});

test('the same word set is one candidate; the newest import counts; no rows means no guess',()=>{
 const r=spokeCandidates({pageUrl:HOME,focusQuery:'x',sitePages:[],gscRows:[row('scale content teams',30,20),row('content teams scale',25,15),row('scale content teams',999,2)]});
 assert.equal(r.candidates.length,1);assert.equal(r.candidates[0].impressions,55);assert.equal(r.candidates[0].best_position,15);
 assert.equal(spokeCandidates({pageUrl:HOME,gscRows:[]}).status,'NO_SEARCH_CONSOLE_ROWS');
});

test('information to action: an informational page gets the action page on the same topic, linked only from existing words',()=>{
 const html='<article><h1>What is an AI citation tracker?</h1><h2>How tracking works</h2><p>An ai citation tracker records which sources AI answers list for a question, so you can compare them over time.</p></article>';
 const r=readerFunnel({pageUrl:'https://contentscale.site/blog/what-is-ai-citation-tracking/',focusQuery:'what is ai citation tracking',pageIntent:'INFORMATIONAL_GUIDE',pageHtml:html,
  sitePages:[{id:3,url:'https://contentscale.site/pricing/',keyword:'contentscale pricing'},{id:2,url:'https://contentscale.site/ai-citations-tracker/',keyword:'ai citation tracker tool'},site[2]]});
 assert.equal(r.status,'FUNNEL_PROPOSAL');assert.equal(r.stages[0].stage,'INFORMATION');
 assert.equal(r.stages[1].url,'https://contentscale.site/ai-citations-tracker/','the action page on the same topic comes first');
 assert.equal(r.stages[1].link.status,'LINK_CANDIDATE_FOR_REVIEW');assert.equal(r.stages[1].link.under_heading,'How tracking works');
 assert(!r.stages.some(s=>/core-update/.test(s.url||'')),'another guide is not an action page');
 assert.match(r.rules[0],/never pushed before the question is answered/);
 assert.equal(readerFunnel({pageUrl:HOME,pageIntent:'PRODUCT_TOOL',sitePages:site}).status,'NOT_AN_INFORMATIONAL_PAGE');
 assert.equal(readerFunnel({pageUrl:'https://x.example/guide/',pageIntent:'INFORMATIONAL_GUIDE',sitePages:[{url:'https://x.example/blog/other/',keyword:'other guide'}]}).status,'NO_ACTION_PAGE_FOUND');
});
