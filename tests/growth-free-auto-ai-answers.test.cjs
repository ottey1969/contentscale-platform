'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {groundedGeminiAnswer}=require('../src/growth-free/auto-ai-answers.cjs');
const term='How can I scale existing content without losing quality?';
test('grounded Gemini collects only real provider grounding URLs, not invented model URLs',async()=>{
 let request;
 const out=await groundedGeminiAnswer({query:term,pageUrl:'https://example.org/page/',key:'TEST-KEY',model:'gemini-2.5-flash',
  fetchImpl:async(url,options)=>{request={url,body:JSON.parse(options.body)};return {ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:'Start by auditing content quality, then expand only validated sections with clear ownership and measurable outcomes. Details at https://invented.example/'}]},groundingMetadata:{groundingChunks:[{web:{uri:'https://example.net/guide/content-quality',title:'Content Quality'}},{web:{uri:'https://example.com/guides/editorial-workflow',title:'Workflow'}}]}}]})}}});
 assert.equal(out.status,'SUCCESS');
 assert.equal(out.engine,'google_aio');
 assert.match(request.url,/generativelanguage.googleapis.com/);
 assert.deepEqual(request.body.tools,[{google_search:{}}]);
 assert.match(out.raw,/https:\/\/example.net\/guide\/content-quality/);
 assert.doesNotMatch(out.raw.slice(out.raw.indexOf('RESOURCES:')),/invented.example/);
 assert.equal(out.parsed.sources.length,2);
});
test('an ungrounded answer never counts as checked evidence',async()=>{
 const out=await groundedGeminiAnswer({query:term,pageUrl:'https://example.org/page/',key:'TEST-KEY',
 fetchImpl:async()=>({ok:true,json:async()=>({candidates:[{content:{parts:[{text:'A plausible answer with invented sources.'}]}}]})})});
 assert.equal(out.status,'NO_GROUNDED_ANSWER');
});
test('missing provider key fails closed without invented AI coverage',async()=>{
 const out=await groundedGeminiAnswer({query:term,pageUrl:'https://example.org/page/',key:''});
 assert.equal(out.status,'NOT_CONFIGURED');
});
