'use strict';
const assert=require('node:assert/strict');
const {loadGrowthTrackerEvidence}=require('./growth-canonical-loader.cjs');
const url='https://example.org/service/';
function db({caseStudyError=false}={}){
 return {async query(sql){
  if(sql.includes('FROM tracker_pages'))return {rows:[{id:20,tracker_client_id:5,url,html_content:null}]};
  if(sql.includes('FROM tracker_case_studies')){
   if(caseStudyError)throw Object.assign(Error('Case Study table unavailable'),{code:'42P01'});
   return {rows:[]};
  }
  if(sql.includes('FROM tracker_gsc_queries'))throw Object.assign(Error('GSC optional not accessible'),{code:'42P01'});
  if(sql.includes('FROM tracker_ai_evidence'))throw Error('AI evidence optional not accessible');
  if(sql.includes('FROM tracker_snapshots'))throw Error('SERP snapshots optional not accessible');
  throw Error('Unexpected SQL');
 }};
}
(async()=>{
 let result=await loadGrowthTrackerEvidence(db(),{pageId:20,clientId:5});
 assert.equal(result.page.case_study_active,false);
 assert.equal(result.gscRows.length,0);
 assert.equal(result.aiEvidence.length,0);
 assert.equal(result.competitorSnapshot,null);
 assert(result.optional_evidence_unavailable.includes('gsc'));
 assert(result.optional_evidence_unavailable.includes('ai'));
 assert(result.optional_evidence_unavailable.includes('competitor_snapshots'));
 result=await loadGrowthTrackerEvidence(db({caseStudyError:true}),{pageId:20,clientId:5});
 assert.equal(result.page.case_study_active,true);
 assert.equal(result.page.case_study_status_unknown,true);
 assert(result.optional_evidence_unavailable.includes('case_studies'));
 console.log('PASS optional Growth data cannot block research; unavailable Case Study state fails closed');
})().catch(e=>{console.error(e);process.exitCode=1});
