'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const s=fs.readFileSync(process.env.CASE_GUIDANCE_CANDIDATE||'/tmp/contentscale-case-study-guidance.js','utf8');
const at=s.indexOf('function _trackerNextActionState('),end=s.indexOf('\nfunction ',at+10);
assert(at>=0&&end>at&&end-at<18000,'Unexpected action resolver boundaries');
const chunk=s.slice(at,end);
const sandbox={_trackerEvidenceGateState:()=>({waiting:false,ready_to_complete:false,ready_to_scan:false}),_aiEvidenceIsVerified:()=>false,Date,JSON,Number,String,Array};
vm.runInNewContext(chunk+';globalThis.resolve=_trackerNextActionState;',sandbox);
function base(extra={}){return {id:12,url:'https://example.test/',claims_facts_updated_at:'2026-10-10T00:00:00Z',brief_content:{},case_study_active:false,case_study_readiness:{ready:false,missing:['AI checks 0/5','GSC Queries'],ai_checked:0,gsc_pages:true,gsc_queries:false},...extra};}
test('missing exact-page GSC takes priority over stale Claims & Facts even with monitoring off',()=>{
 const r=sandbox.resolve(base({check_frequency:'0'}),false,'2026-08-18T00:00:00Z',null);
 assert.equal(r.code,'CASE_BASELINE_INCOMPLETE');assert.match(r.buttonAction,/setBaselineGsc/);
 assert.match(r.detail,/AI checks 0\/5/);
});
test('missing AI alone directs to manual evidence; no scan bypass',()=>{
 const r=sandbox.resolve(base({case_study_readiness:{ready:false,missing:['AI checks 0/5'],ai_checked:0,gsc_pages:true,gsc_queries:true}}),false,'2026-08-18T00:00:00Z',null);
 assert.equal(r.code,'CASE_BASELINE_INCOMPLETE');assert.match(r.buttonAction,/openAiEvidence/);assert.doesNotMatch(r.buttonAction,/checkPage/);
});
test('ready baseline is not intercepted by incomplete-baseline guidance',()=>{
 const r=sandbox.resolve(base({case_study_readiness:{ready:true,missing:[],ai_checked:5,gsc_pages:true,gsc_queries:true}}),false,'2026-08-18T00:00:00Z',null);
 assert.notEqual(r.code,'CASE_BASELINE_INCOMPLETE');
});
test('active protected case studies are not intercepted by not-started guidance',()=>{
 const r=sandbox.resolve(base({case_study_active:true,case_study_readiness:{ready:false,missing:['AI checks 0/5'],ai_checked:0,gsc_pages:true,gsc_queries:false}}),false,'2026-08-18T00:00:00Z',null);
 assert.notEqual(r.code,'CASE_BASELINE_INCOMPLETE');
});
