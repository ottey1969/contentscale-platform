'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {patch,marker}=require('./integrate-canonical-page-journey.cjs');
const original=fs.readFileSync(path.resolve(__dirname,'../src/index.js'),'utf8');
const changed=patch(original),source=changed.source;
assert(source.includes(marker));
assert.equal(patch(source).changed,false);
assert(!source.includes('SCAN COMPLETE · OPEN THE BRIEF'));
assert(!source.includes('CONTENTSCALE-MANUAL-MONITORING-PRIORITY:'));
assert(source.includes('CONTENTSCALE_TRACKER_GSC_OPTIONAL_ADVICE_V1'));
assert(source.includes('CONTENTSCALE_SHARED_TRACKER_GROWTH_NAV_V1'));
const start=source.indexOf('function _trackerEvidenceGateState(p){');
const end=source.indexOf('function _trackerImplementationCheckState(',start);
assert(start>=0&&end>start);
const shared='$'+"{require('fs').readFileSync(require('path').join(__dirname,'tracker-page-journey.cjs'),'utf8')}";
let code=source.slice(start,end);
assert(code.includes(shared));
code=code.replace(shared,fs.readFileSync(path.resolve(__dirname,'../src/tracker-page-journey.cjs'),'utf8'));
const stub={};
const evaluate=vm.runInNewContext(code+'\n_trackerNextActionState;',{
 Date,window:stub,_aiEvidenceIsVerified:()=>true
});
assert.equal(typeof stub.ContentScaleTrackerJourney.inspect,'function');
const base={
 id:20,url:'https://roofer.example/roof-repair/',case_study_active:true,
 case_study:{baseline_at:'2026-09-25T00:00:00Z',baseline_locked:true},
 manual_done:true,manual_done_at:'2026-10-08T10:00:00Z',
 brief_content:{outstanding_actions:4,cycle_id:'old'},
 brief_evaluated_at:'2026-10-01T12:00:00Z',last_checked:'2026-10-01T13:00:00Z',
 implementation_status:'not_verified',monitoring_waiting_input:false,
 check_frequency:'0'
};
const next=(v={})=>{const p={...base,...v};return evaluate(p,p.is_done===true,p.last_checked,'Evidence review after 30 days');};
let r=next();
assert.equal(r.code,'MONITOR');
assert.equal(r.button,'');
assert.match(r.detail,/Proof & History|history/i);
assert.notEqual(next({manual_done:false}).code,'MONITOR','Uncompleted work must not be filed as completed monitoring');
assert.notEqual(next({manual_done_at:null}).code,'MONITOR','A timestamp is required before treating My Check as completion');
r=next({last_checked:'2026-10-10T12:00:00Z'});
assert.equal(r.code,'SAVE_LIVE_FIRST','Case Study with no prepublication checkpoint must preserve the required saved-live safety gate');
assert.notEqual(r.button,'Open Brief','A later scan must never republish an older Brief');
assert.equal(r.button,'1 · Save current live page');
r=next({brief_evaluated_at:'2026-10-10T12:00:00Z',last_checked:'2026-10-10T13:00:00Z',brief_content:{outstanding_actions:3,cycle_id:'current'}});
assert.equal(r.code,'SAVE_LIVE_FIRST','Even a fresh current Brief cannot bypass missing protected live checkpoint');
r=next({monitoring_waiting_input:true,monitoring_gate_label:'case_day_30',monitoring_request_at:'2026-10-15T00:00:00Z'});
assert.equal(r.code,'WAITING','Real Case Study checkpoint remains independent');
assert(!source.includes('GSC is mandatory in Tracker'));
console.log('PASS canonical Tracker lifecycle: historical brief no reopen, new scan separated, protected checkpoint, GSC optional, Growth accessible');
