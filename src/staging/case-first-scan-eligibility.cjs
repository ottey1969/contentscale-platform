'use strict';
// Isolated decision helper: no DB access, external calls, scheduler or app boot.
const ENGINES=Object.freeze(['google_aio','chatgpt','perplexity','claude','copilot']);
function yes(v){return v===true||v===1||v==='1'||v==='true'||v==='t';}
function ts(v){if(!v)return NaN;const n=Date.parse(String(v));return Number.isFinite(n)?n:NaN;}
function evaluateFirstManualCaseScan({page,caseStudy,latestSnapshotAt,selectedEngines}={}){
 const fail=reason=>({allowed:false,reason});
 if(!page||!caseStudy)return fail('record_missing');
 if(!yes(page.case_study_active)||String(caseStudy.status)!=='active')return fail('case_not_active');
 if(!yes(caseStudy.baseline_locked))return fail('baseline_not_locked');
 if(yes(page.monitoring_waiting_input))return fail('evidence_checkpoint_pending');
 if(!Array.isArray(selectedEngines)||ENGINES.some(k=>!selectedEngines.includes(k)))return fail('five_engines_not_configured');
 const baseline=ts(caseStudy.baseline_at);
 if(!Number.isFinite(baseline))return fail('baseline_timestamp_missing');
 const latest=ts(latestSnapshotAt);
 if(Number.isFinite(latest)&&latest>baseline)return fail('already_scanned_this_case_cycle');
 const revisionMarkers=['implementation_verified_at','current_revision_published_at','brief_published_at'];
 if(revisionMarkers.some(key=>{const at=ts(page[key]);return Number.isFinite(at)&&at>baseline;}))return fail('live_revision_after_baseline');
 return {allowed:true,reason:'first_manual_case_study_scan'};
}
module.exports={evaluateFirstManualCaseScan,ENGINES};
