'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.resolve(__dirname,'../src/index.js'),'utf8');
const a=src.indexOf('async function _caseStudyOpenFreshStartCycle(');
const b=src.indexOf('\n// v229: case-study URL pre-flight',a);
assert(a>0&&b>a&&b-a<11000);
test('archive write failure refuses to clear the only old Brief copy',async()=>{
 const page={id:17,url:'https://example.invalid/',revision_cycle:3,manual_done:true,brief_content:{cycle_id:'historical',outstanding_actions:2},ranking_brief:{seed_keyword:'legacy'}};
 let resets=0,archives=0;
 const pool={async query(sql){
  if(sql.includes("SELECT event_at,event_data FROM tracker_case_study_events"))return {rows:[]};
  if(sql.includes("case_study_prior_brief_archived")){archives++;throw Error('simulated legacy archive DB failure');}
  if(sql.includes('UPDATE tracker_pages SET'))resets++;
  throw Error('Unexpected SQL '+sql.slice(0,65));
 }};
 const box={Date,JSON,pool,console:{warn:()=>{},log:()=>{},error:()=>{}},_caseStudyStoreContentVersion:async()=>{throw Error('Must not store after archive failure')}};
 vm.runInNewContext(src.slice(a,b)+'\nglobalThis.open=_caseStudyOpenFreshStartCycle;',box,{timeout:5000});
 await assert.rejects(()=>box.open(3,page,{id:21,baseline_at:'2026-10-10T12:00:00Z'},'x'.repeat(501),'verified_html','test'),/simulated legacy archive DB failure/);
 assert.equal(archives,1);
 assert.equal(resets,0,'Old Brief must never be reset on failed archive');
 assert.equal(page.brief_content.cycle_id,'historical');
});
