'use strict';
// Searches for someone to hire: providers' own service pages and lists of providers are one intent, in any trade.
// Real data: report 66 (contentscale.site/generative-engine-optimization-consultant/), blocked as "mixed" before.
const test=require('node:test'),assert=require('node:assert/strict');
const {classifyTitle,inferSerpIntent,classifyDestinationIntent}=require('../src/growth-reader-task-coverage.cjs');
const {observeSerpTitles}=require('../src/growth-serp-titles.cjs');
const f=require('./fixtures/growth-report-66/serp.json');

test('report 66 (real): provider pages and provider lists give one intent, and the consultant page fits it',()=>{
 const si=inferSerpIntent({query:f.query,leads:f.leads});
 assert.equal(si.status,'SERP_INTENT_OBSERVED');assert.equal(si.intent,'PROVIDER_LIST');
 assert.deepEqual(si.class_counts,{SERVICE_PROVIDER:2,PROVIDER_LIST:3});
 const dest=classifyDestinationIntent({query:f.query,title:f.page_title,h1:f.page_h1,url:f.url,serpIntent:si.intent});
 assert.equal(dest.class,'SERVICE_PROVIDER');assert.equal(dest.verdict,'COMPATIBLE');
});

test('report 66 (real): the titles of all 20 results are mostly providers and lists of providers',()=>{
 const counts={};for(const t of f.all_titles){const c=classifyTitle(t,'');counts[c]=(counts[c]||0)+1}
 assert.equal(counts.SERVICE_PROVIDER+counts.PROVIDER_LIST,14);assert.equal(counts.UNCLASSIFIED,3);
 for(const [t,c] of [['8 Top Generative Engine Optimization (GEO) Agencies [2026]','PROVIDER_LIST'],['11 Generative Engine Optimization Agencies for B2B ...','PROVIDER_LIST'],
  ['Generative Engine Optimization | Expert-Led GEO Services','SERVICE_PROVIDER'],['GEO-optimalisatie bureau','SERVICE_PROVIDER'],['Hire Generative Engine Optimization (GEO) Experts','SERVICE_PROVIDER'],
  ["A Beginner's Guide to Generative Engine Optimization (GEO)",'INFORMATIONAL_GUIDE']])assert.equal(classifyTitle(t,''),c,t);
 const o=observeSerpTitles({query:f.query,titles:f.all_titles.map(title=>({title}))});
 assert.match(o.note,/By title, Google shows mostly pages of providers offering this service \(8 of 20\)\./);
});

test('"mostly" only when it is so: one guide among unclassified titles is a mix (LABELLED SYNTHETIC titles)',()=>{
 const o=observeSerpTitles({query:'x y',titles:['A guide to x y','Acme','Foo Bar','Baz','Qux'].map(title=>({title}))});
 assert.doesNotMatch(o.note||'',/mostly/);assert.match(o.note,/a mix: guides and explanations \(1\) of 5 results; 4 not classified/);
});

test('product searches keep their classes (LABELLED SYNTHETIC titles)',()=>{
 assert.equal(classifyTitle('Best AI Citation Trackers 2026',''),'COMMERCIAL_COMPARISON');
 assert.equal(classifyTitle('Roof Repair in Paterson, NJ | Roofer A',''),'LOCAL_SERVICE');
 assert.equal(classifyTitle('AI Citation Tracker — free tool',''),'PRODUCT_TOOL');
});
