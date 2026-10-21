'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {resolveGrowthPageIntent}=require('../src/growth-page-intent-resolver.cjs');
test('real ContentScale services page never queries global Windows services',()=>{
 const r=resolveGrowthPageIntent({keyword:'services',
  title:'ContentScale Services 2026: Free ContentScore, AI Citations Otto',h1:[],
  description:'SERVICE: Free 100-point GRAAF ContentScore, free AI Citations Tracker'});
 assert.equal(r.status,'RESOLVED_FROM_OBSERVED_MAIN_HEADING');
 assert.equal(r.query,'ContentScale Services');
 assert.notEqual(r.query.toLowerCase(),'services');
});
test('specific roofing phrase is never overwritten by a generic or brand query',()=>{
 const r=resolveGrowthPageIntent({keyword:'roof leak repair',title:'Our Services'});
 assert.equal(r.query,'roof leak repair');
});
test('generic services without named subject has no supported competitor query',()=>{
 const r=resolveGrowthPageIntent({keyword:'services',title:'Our Services',h1:['Services']});
 assert.equal(r.query,null);
 assert.equal(r.status,'AMBIGUOUS_SITE_NAVIGATION_INTENT');
});
test('another industry resolves using directly observed main heading',()=>{
 const r=resolveGrowthPageIntent({keyword:'services',title:'Emergency Plumbing Services | Metro Plumbing'});
 assert.equal(r.query,'Emergency Plumbing Services');
});
