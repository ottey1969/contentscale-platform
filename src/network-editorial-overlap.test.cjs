'use strict';
const assert=require('node:assert/strict');
const {inspectEditorialOverlap,similarity}=require('./network-editorial-overlap.cjs');
(async()=>{
 assert(similarity('Independent DJs Build a Loyal Audience','How Independent DJs Build a Loyal Audience')>=0.8);
 let requests=0;
 const out=await inspectEditorialOverlap({domain:'mixcloud.com',title:'How Independent DJs Can Build a Loyal Audience Beyond Social Media',apiKey:'test-not-real',fetchImpl:async(url,opts)=>{
  requests++;const u=new URL(url);
  assert.equal(u.hostname,'serpapi.com');assert.equal(u.searchParams.get('engine'),'google');
  assert(u.searchParams.get('q').includes('site:mixcloud.com'));
  return {ok:true,json:async()=>({organic_results:[
   {title:'How Independent DJs Can Build a Loyal Audience',link:'https://www.mixcloud.com/blog/djs-loyal-audience/'},
   {title:'Ignore unrelated third-party page',link:'https://unrelated.example/story'},
   {title:'Creators and communities',link:'https://www.mixcloud.com/blog/creators/'}
  ]})};
 }});
 assert.equal(requests,1);assert.equal(out.status,'INDEXED_CONTENT_SAMPLE');assert.equal(out.sources.length,2);
 assert.equal(out.review_required,true);assert(out.sources.every(s=>s.url.includes('mixcloud.com')));
 const unavailable=await inspectEditorialOverlap({domain:'mixcloud.com',title:'Test',apiKey:null});
 assert.equal(unavailable.status,'RESEARCH_UNAVAILABLE');assert.equal(unavailable.review_required,true);
 console.log('PASS: domain-scoped indexed search, relevant overlap, no duplicate assertions on missing evidence');
})().catch(e=>{console.error(e);process.exitCode=1});
