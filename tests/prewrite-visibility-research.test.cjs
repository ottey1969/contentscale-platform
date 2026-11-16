'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {candidatePages,readPrewriteVisibility,prewriteVisibilityPrompt}=require('../src/prewrite-visibility-research.cjs');
const google='Top search results: https://roofers.example/guide/ and https://contractor.example/repair/';
const aiResearch={observations:[{engine:'chatgpt',checked:true,source_urls:['https://external.example/urgent-repairs/']},{engine:'claude',checked:false,source_urls:['https://unused.example/']}]};
test('both Google Search and AI provide distinct discoverable pages',()=>{
 const list=candidatePages({googleText:google,aiResearch});
 assert.equal(list.length,3);
 assert.equal(list.filter(x=>x.surface==='GOOGLE').length,2);
 assert.equal(list.filter(x=>x.surface==='AI').length,1);
 assert.equal(list.find(x=>x.surface==='AI').discovery_status,'AI_UNVERIFIED_SOURCE_LEAD');
});
test('both surfaces read original page content, retaining failures and provenance',async()=>{
 const read=await readPrewriteVisibility({googleText:google,aiResearch,fetchHtml:async url=>{
  if(url.includes('contractor'))throw Object.assign(Error('offline'),{code:'TEST_OFFLINE'});
  return {html:'<html><h1>Emergency Roof Repair</h1><h2>What to do immediately</h2><p>Keep people out of dangerous areas and contact a qualified roofing provider for inspection.</p><p>Document visible water damage before authorizing work.</p></html>',truncated:false};
 }});
 assert.equal(read.google.discovered,2);
 assert.equal(read.ai.discovered,1);
 assert.equal(read.pages_read,2);
 assert.equal(read.google.pages[1].status,'FETCH_FAILED');
 assert.equal(read.google.pages[1].error_code,'TEST_OFFLINE');
 assert.equal(read.ai.pages[0].status,'READ');
 assert.ok(read.ai.pages[0].headings.length>0);
 assert.equal(read.target_page_citation_applicable,false);
 const prompt=prewriteVisibilityPrompt(read);
 assert.match(prompt,/INTENT \+ VISIBILITY RESEARCH/);
 assert.match(prompt,/GOOGLE SEARCH/);
 assert.match(prompt,/AI ANSWERS/);
 assert.match(prompt,/What to do immediately/);
 assert.match(prompt,/not proof|not copied as facts|not invent/i);
});
test('never fake read status for missing sources or let untrusted URLs through',async()=>{
 const res=await readPrewriteVisibility({googleText:'https://127.0.0.1/private https://localhost/private',aiResearch:{observations:[]},fetchHtml:async()=>{throw Error('must not fetch')}});
 assert.equal(res.pages_read,0);
 assert.equal(res.google.discovered,0);
 assert.equal(res.ai.discovered,0);
 assert.equal(candidatePages({googleText:Array.from({length:15},(_,i)=>'https://example'+i+'.org/a').join(' ')}).length,3);
});
