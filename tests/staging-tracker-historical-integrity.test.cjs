'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {LEGACY_QUERIES,inspectHistoricalIntegrity}=require('../src/staging/tracker-historical-integrity.cjs');
function fake(options={}){
 const calls=[];let released=0;
 const caseCounters={case_studies:options.cases??0,orphan_clients:options.orphans??0,
  orphan_pages:0,cross_client_pages:options.crossOwners??0,verification_before_baseline:options.early??0};
 const pageCounters={pages:options.pages??0,missing_completion_timestamps:options.noTime??0,
 timestamp_without_completion:options.badTime??0};
 return {calls,get released(){return released},async connect(){return{
 async query(sql){calls.push(sql);
  if(options.fail&&sql.includes('SELECT COUNT'))throw Error('simulated SQL failure');
  if(sql===LEGACY_QUERIES[0].sql)return {rows:[caseCounters]};
  if(sql===LEGACY_QUERIES[1].sql)return {rows:[pageCounters]};
  return {rows:[]};
 },release(){released++;}
 }}};
}
test('empty staging is explicitly not proof that legacy repairs are safe',async()=>{
 const db=fake();const r=await inspectHistoricalIntegrity(db);
 assert.equal(r.review_status,'historical_data_not_exercised');
 assert.equal(r.historical_repair_behavior_verified,false);
 assert.equal(r.requires_review_before_full_app_boot,true);
 assert.equal(r.writes_performed,false);
 assert.equal(db.calls.at(-1),'ROLLBACK');
 assert.equal(db.released,1);
 assert(db.calls.every(sql=>/^(BEGIN|SET LOCAL|SELECT|ROLLBACK)/.test(sql)));
});
test('read-only audit reports historical owner and baseline anomalies',async()=>{
 const db=fake({cases:3,orphans:1,crossOwners:1,early:1,pages:3,noTime:1});
 const r=await inspectHistoricalIntegrity(db);
 assert.equal(r.review_status,'manual_historical_review_required');
 assert.equal(r.suspicious_relationships,2);
 assert.equal(r.early_verifications,1);
 assert.equal(r.manual_timestamp_mismatches,1);
 assert.equal(r.repairs_performed,false);
});
test('consistent existing records are reviewed, not automatically repaired or cleared for boot',async()=>{
 const db=fake({cases:2,pages:4});const r=await inspectHistoricalIntegrity(db);
 assert.equal(r.review_status,'legacy_relationships_checked');
 assert.equal(r.historical_repair_behavior_verified,false);
 assert.equal(r.requires_review_before_full_app_boot,true);
});
test('failed SQL is rolled back and fails closed',async()=>{
 const db=fake({fail:true});
 await assert.rejects(inspectHistoricalIntegrity(db),/STAGING BLOCKED/);
 assert.equal(db.calls.at(-1),'ROLLBACK');assert.equal(db.released,1);
});
test('unreadable database counters fail closed',async()=>{
 const db=fake({cases:-2});await assert.rejects(inspectHistoricalIntegrity(db),/STAGING BLOCKED/);
 assert.equal(db.calls.at(-1),'ROLLBACK');
});
