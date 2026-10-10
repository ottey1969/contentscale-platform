'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs');
const {assessCanonicalReadRoutes,MARKERS}=require('../src/staging/tracker-readonly-coverage.cjs');
const original=fs.readFileSync('src/index.js','utf8');
test('canonical staging has four read-only case-study GET routes',()=>{
 const r=assessCanonicalReadRoutes(original);
 assert.equal(r.case_study_get_routes_read_only,true);
 assert.equal(r.expected_case_study_get_routes,4);
 assert.equal(r.verified_case_study_get_routes,4);
 assert.equal(r.historical_PRT_auto_attach_dormant,true);
 assert.equal(r.source_inspection_only,true);
});
test('Prewrite GET write hazard is separately reported, never quietly discarded',()=>{
 const r=assessCanonicalReadRoutes(original);
 assert.equal(r.prewrite_get_implicit_write_review,true);
});
test('a reintroduced migration call fails the coverage check',()=>{
 const marker=MARKERS[0],at=original.indexOf(marker);
 assert(at>=0);
 const broken=original.slice(0,at+marker.length)+'\nawait _ensureCaseStudySchema();'+original.slice(at+marker.length);
 const r=assessCanonicalReadRoutes(broken);
 assert.equal(r.case_study_get_routes_read_only,false);
 assert.equal(r.verified_case_study_get_routes,3);
});
test('a reintroduced automatic hard-coded baseline attachment fails coverage',()=>{
 const r=assessCanonicalReadRoutes(original+"\nawait _ensurePerfectRoofingCaseStudy(client,page);");
 assert.equal(r.historical_PRT_auto_attach_dormant,false);
});
