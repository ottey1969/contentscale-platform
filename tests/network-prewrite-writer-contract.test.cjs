'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {validateNetworkAi}=require('../src/network-prewrite-contract.cjs');
const {checkStandaloneLinks}=require('../src/network-standalone-content-gate.cjs');
const sample='SEO content optimalisatie starts with checking the search intent, original source evidence, a clear title and useful paragraphs. Compare existing pages and improve verified claims, rather than inventing ranking promises.';
const q='seo content optimalisatie';
const five=()=>({ai_system_evidence:Object.fromEntries(['google_aio','chatgpt','perplexity','claude','copilot'].map(k=>[k,{checked:true,text:sample,google_source:k==='google_aio'?'gemini':undefined}]))});
test('Network accepts five real Pre-Write-valid answers without changing the approved brief',()=>{
 const b=five(),before=JSON.stringify(b),r=validateNetworkAi(b,q);
 assert.equal(r.complete,true);assert.equal(r.checked_count,5);assert.deepEqual(r.missing,[]);
 assert.equal(JSON.stringify(b),before);
});
test('Network does not equate checked:true or an empty response with validated research',()=>{
 const b=five();b.ai_system_evidence.claude={checked:true,text:''};
 const r=validateNetworkAi(b,q);assert.equal(r.complete,false);assert.equal(r.checked_count,4);assert.deepEqual(r.missing,['claude']);assert.equal(r.invalid[0].engine,'claude');
});
test('Network rejects prompt echo, query-only and placeholder captures even when checked',()=>{
 const b=five();b.ai_system_evidence.chatgpt.text=q;
 b.ai_system_evidence.perplexity.text='[PASTE ANSWER HERE]';
 const r=validateNetworkAi(b,q);assert.equal(r.complete,false);assert.ok(r.missing.includes('chatgpt'));assert.ok(r.missing.includes('perplexity'));
});
test('A Google "no AI Overview" observation is not a fabricated fifth answer',()=>{
 const b=five();b.ai_system_evidence.google_aio={checked:true,text:'',google_source:'no_ai_overview'};
 const r=validateNetworkAi(b,q);assert.equal(r.complete,false);assert.deepEqual(r.missing,['google_aio']);
});
test('Standalone link gate accepts only exact owner/internal and verified external source pages',()=>{
 const x=checkStandaloneLinks({ownerDomain:'example.com',internalCandidates:['https://example.com/about'],externalCandidates:['https://www.w3.org/TR/WCAG22/','https://developers.google.com/search/docs/fundamentals/seo-starter-guide','https://schema.org/Article'],html:'<a href="https://example.com/about">About our team</a><a href="https://www.w3.org/TR/WCAG22/">W3C accessibility recommendations</a><a href="https://developers.google.com/search/docs/fundamentals/seo-starter-guide">Google SEO basics</a><a href="https://schema.org/Article">Article structured data</a>'});
 assert.equal(x.passed,true);assert.equal(x.internal_count,1);assert.equal(x.external_count,3);
});
test('Standalone fails closed on made-up links or links to owner as external',()=>{
 const x=checkStandaloneLinks({ownerDomain:'example.com',internalCandidates:['https://example.com/about'],externalCandidates:['https://schema.org/Article','https://www.w3.org/TR/WCAG22/','https://developers.google.com/search/docs/fundamentals/seo-starter-guide'],html:'<a href="https://example.com/about">About us</a><a href="https://www.w3.org/TR/WCAG22/">Accessibility guidance</a><a href="https://example.com/unverified">Invented owner section</a><a href="https://another.example/page">Invented reference</a>'});
 assert.equal(x.passed,false);assert.ok(x.missing.includes('three_unique_verified_external_links_required'));assert.equal(x.invalid_links.length,2);
});
