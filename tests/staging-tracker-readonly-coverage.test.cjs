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
test('Prewrite GET write hazard is independently detected from canonical route content',()=>{
 const marker="app.get('/api/tracker-client/:token/prewrite-briefs/:id'";
 const start=original.indexOf(marker),end=original.indexOf('\napp.',start+marker.length);
 assert(start>=0 && end>start);
 const body=original.slice(start,end);
 const hasImplicitWrite=/UPDATE\s+prewrite_briefs\s+SET\s+brief_json/i.test(body);
 const r=assessCanonicalReadRoutes(original);
 assert.equal(r.prewrite_get_implicit_write_review,hasImplicitWrite);
 if(!hasImplicitWrite)assert.match(body,/pending_explicit_save:_preview.pendingSave/);
});
test('reintroduced Prewrite GET persistence triggers fail-closed warning',()=>{
 const marker="app.get('/api/tracker-client/:token/prewrite-briefs/:id'";
 const pos=original.indexOf(marker);
 assert(pos>=0);
 const mutated=original.slice(0,pos+marker.length)+"\nawait pool.query('UPDATE prewrite_briefs SET brief_json=$1 WHERE id=$2',[]);"+original.slice(pos+marker.length);
 assert.equal(assessCanonicalReadRoutes(mutated).prewrite_get_implicit_write_review,true);
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
