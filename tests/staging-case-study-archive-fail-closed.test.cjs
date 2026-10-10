'use strict';
// Regression: fail closed if archival of the prior Brief cannot be persisted.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../src/index.js'),'utf8');
const a=src.indexOf('async function _caseStudyOpenFreshStartCycle(');
const b=src.indexOf('\n// v229: case-study URL pre-flight',a);
assert(a>0&&b>a&&b-a<12000,'Canonical cycle function moved: require manual review');
function getStartCycle(){
 let resetCount=0,storeCount=0,archiveCount=0;
 const pool={async query(sql){
   if(sql.includes('SELECT event_at,event_data FROM tracker_case_study_events'))return {rows:[]};
   if(sql.includes("'case_study_prior_brief_archived'")){archiveCount++;throw Error('simulated_archive_database_failure');}
   if(/UPDATE\s+tracker_pages\s+SET/.test(sql)){resetCount++;return {rows:[]};}
   throw Error('Unexpected SQL in archival guard test: '+sql.slice(0,100));
 }};
 const ctx={pool,JSON,Date,console:{warn:()=>{}},_caseStudyStoreContentVersion:async()=>{storeCount++;}};
 vm.runInNewContext(src.slice(a,b)+'\nglobalThis.startCycle=_caseStudyOpenFreshStartCycle;',ctx,{timeout:5000});
 return {call:ctx.startCycle,get resets(){return resetCount},get archived(){return archiveCount},get checkpoints(){return storeCount}};
}
test('Brief archival database failure never resets historical workflow state',async()=>{
 const x=getStartCycle();
 const page={id:17,tracker_client_id:3,url:'https://example.invalid/old',
   revision_cycle:3,manual_done:true,brief_content:{cycle_id:'historical',outstanding_actions:2},
   ranking_brief:{seed_keyword:'consultor geo'},check_frequency:'0'};
 const cs={id:21,baseline_locked:true,baseline_at:'2026-10-10T12:00:00Z'};
 await assert.rejects(x.call(3,page,cs,'','baseline_html','legacy-repair'),/simulated_archive_database_failure/);
 assert.equal(x.archived,1);
 assert.equal(x.resets,0,'Historical page must not be cleared if archival did not persist');
 assert.equal(x.checkpoints,0,'No new checkpoint should be written after archival failed');
 assert.equal(page.brief_content.cycle_id,'historical');
});
