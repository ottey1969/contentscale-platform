'use strict';
const assert=require('node:assert/strict');
const {loadGrowthTrackerEvidence}=require('./growth-canonical-loader.cjs');
(async()=>{
 const url='https://contentscale.site/example/';
 const calls=[];
 const db={query:async(sql,args)=>{
  calls.push({sql,args});
  if(sql.includes('FROM tracker_pages'))return {rows:[{id:7,tracker_client_id:2,url,html_content:'<article>Original</article>'}]};
  if(sql.includes('FROM tracker_gsc_queries'))return {rows:[{tracker_client_id:2,page_id:7,source_page_url:url,evidence_scope:'page_verified',query:'example',clicks:3,impressions:90}]};
  if(sql.includes('FROM tracker_case_studies'))return {rows:[{id:11}]};
  if(sql.includes('FROM tracker_ai_evidence'))return {rows:[{page_id:7,tracker_client_id:2,engine:'chatgpt',evidence_method:'manual',citation_urls:[]}]};
  if(sql.includes('FROM tracker_snapshots'))return {rows:[{page_id:7,checked_at:'2026-10-11T00:00:00Z',google_competitors:[{url:'https://example.net/'}]}]};
  throw new Error('unexpected query');
 }};
 const result=await loadGrowthTrackerEvidence(db,{pageId:7,clientId:2});
 assert.equal(result.page.case_study_active,true);
 assert.equal(result.gscRows.length,1);
 assert.equal(result.gscRows[0].source_page_url,url);
 const mixedDb={query:async(sql)=>{
  if(sql.includes('FROM tracker_pages'))return {rows:[{id:7,tracker_client_id:2,url}]};
  if(sql.includes('FROM tracker_gsc_queries'))return {rows:[
   {tracker_client_id:2,page_id:7,source_page_url:url,evidence_scope:'page_verified',query:'correct'},
   {tracker_client_id:99,page_id:7,source_page_url:url,evidence_scope:'page_verified',query:'other client'},
   {tracker_client_id:2,page_id:7,source_page_url:'https://other.test/',evidence_scope:'page_verified',query:'other page'},
   {tracker_client_id:2,page_id:7,source_page_url:url,evidence_scope:'legacy_unverified',query:'legacy'}]};
  if(sql.includes('FROM tracker_case_studies'))return {rows:[]};
  if(sql.includes('FROM tracker_ai_evidence'))return {rows:[{page_id:7,tracker_client_id:2,engine:'copilot'},{page_id:7,tracker_client_id:99,engine:'other'}]};
  if(sql.includes('FROM tracker_snapshots'))return {rows:[]};
 }};
 const mixed=await loadGrowthTrackerEvidence(mixedDb,{pageId:7,clientId:2});
 assert.deepEqual(mixed.gscRows.map(row=>row.query),['correct']);
 assert.deepEqual(mixed.aiEvidence.map(row=>row.engine),['copilot']);
 assert.equal(calls.length,5);
 assert.equal(result.competitorSnapshot.google_competitors.length,1);
 assert.equal(result.aiEvidence.length,1);
 assert.deepEqual(calls[1].args,[2,7,url]);
 assert.deepEqual(calls[2].args,[2,7]);
 await assert.rejects(loadGrowthTrackerEvidence(db,{pageId:0,clientId:2}),/VALID_PAGE_AND_CLIENT_REQUIRED/);
 const missing={query:async()=>({rows:[]})};
 await assert.rejects(loadGrowthTrackerEvidence(missing,{pageId:7,clientId:2}),/TRACKER_PAGE_NOT_FOUND/);
 assert.equal(result.source,'canonical_tracker_read_only');
 console.log('PASS: canonical read-only Growth evidence loader; 9 assertions');
})().catch(error=>{console.error(error);process.exitCode=1});
