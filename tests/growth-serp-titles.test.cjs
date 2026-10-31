'use strict';
// What Google shows, read from the titles of all organic results (also those whose page could not be opened).
// Real data: Free Growth check VXX4OBTnFHi2 (contentscale.site, "content at scale", NL, 2026-10-31).
const test=require('node:test'),assert=require('node:assert/strict');
const {observeSerpTitles}=require('../src/growth-serp-titles.cjs');
const {summarizeFreeGrowth}=require('../src/growth-free/summary.cjs');
const {optionalGoogleOrganicDiscovery}=require('../src/growth-public-search-discovery.cjs');
const live=require('./fixtures/growth-free-VXX4OBTnFHi2/check.json');

test('VXX4OBTnFHi2 (real): most titles are about a product named like the search term; titles never count as evidence',()=>{
 const o=observeSerpTitles({query:live.query,titles:live.report.search_discovery.organic_titles});
 assert.equal(o.titles_seen,18);assert.equal(o.product_named_like_search_term,8);
 assert.match(o.note,/8 of 18 Google results are about a product or brand named "content at scale"/);
 assert(o.examples.some(t=>/BrandWell \(Previously ContentAtScale\)/.test(t)));
 assert(!o.titles.find(t=>/What Is Content At Scale In 2026/.test(t.title)).product_named_like_search_term,'a guide about the topic is not a product');
 assert.equal(o.pages_not_read,18);assert.match(o.limits,/Never used as evidence/);
});

test('no product note when the titles describe the topic (no industry rule)',()=>{
 // LABELLED SYNTHETIC titles for a local service search.
 const o=observeSerpTitles({query:'roof repair lodi nj',titles:['Roof Repair in Lodi, NJ | Roofer A','How Much Does Roof Repair Cost in New Jersey?','Emergency Roof Repair Near Me | Roofer C'].map(title=>({title}))});
 assert.equal(o.product_named_like_search_term,0);assert.doesNotMatch(o.note||'',/product or brand/);
});

test('Free result VXX4OBTnFHi2 (real): explains what Google shows, advises another term and points to the Tracker',()=>{
 const report={...live.report,serp_titles:observeSerpTitles({query:live.query,titles:live.report.search_discovery.organic_titles})};
 const s=summarizeFreeGrowth(report,{query:live.query,url:live.url});
 assert.equal(s.decision,'DATA_BLOCKED');
 assert.match(s.explanation,/from the titles of all 18 results \(titles only, not evidence for a change\): 8 of 18/);
 assert.match(s.steps[0],/largely used for a product or brand with the same name/);
 assert(s.steps.some(x=>/ContentScale Tracker with Google Search Console/.test(x)));
 assert.match(s.steps.at(-1),/manual comparison/,'the paid option stays last');
 assert.equal(s.gaps.writing_allowed,false,'titles never unlock writing');
 // Shared step lists are not changed by one result.
 const again=summarizeFreeGrowth({editorial_decision_gate:{decision:'DATA_BLOCKED',blocker_code:'SHARED_COMPETITOR_REQUIREMENTS'}},{query:'x'});
 assert.equal(again.steps.filter(x=>/Tracker/.test(x)).length,1);assert(!again.steps.some(x=>/same name/.test(x)));
});

test('the search discovery keeps every organic title, also of unopened Google redirect links, without the own site',async()=>{
 const real=require('./fixtures/growth-report-61/serp-and-topics.json');
 const r=await optionalGoogleOrganicDiscovery({query:real.query,ownUrl:'https://www.jasper.ai/',key:'k',fetchImpl:async url=>{
  if(String(url).startsWith('https://google.serper.dev/'))return {ok:true,json:async()=>({organic:[...real.direct,...real.wrapped].map((x,i)=>({title:x.title,link:x.link,position:i+1}))})};
  throw Error('no answer')}});
 assert(!r.organic_titles.some(t=>t.host==='jasper.ai'),'own site left out');
 assert(r.organic_titles.filter(t=>t.host===null&&t.url===null).length>=12,'unopened redirect links keep their title');
});
