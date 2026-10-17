'use strict';
// One side-effect-free lifecycle policy for every existing and future Tracker page.
// No database, GSC, scheduler or protected Case Study state writes.
// This change is isolated from all customer account, content publishing and CMS actions.
const fs=require('node:fs'),path=require('node:path');
const file=path.resolve(__dirname,'../src/index.js');
const marker='CONTENTSCALE_CANONICAL_PAGE_JOURNEY_V2';
const shared='$'+"{require('fs').readFileSync(require('path').join(__dirname,'tracker-page-journey.cjs'),'utf8')}";
const current='function _trackerNextActionState(p,isDone,lastCheckedRaw,nextEvidence){';
const stale='  if(personalSafetyStale){';
const legacy='  // CONTENTSCALE-MANUAL-MONITORING-PRIORITY:';
const next='  // First manual scan of newly initialized Case Study, independent of scheduler.';
const guard=[
 '  // '+marker+': one canonical page decision, not another per-page override.',
 '  var _canonicalJourney=window.ContentScaleTrackerJourney.inspect(p,lastCheckedRaw);',
 '  if(_canonicalJourney.personal_completion_controls_workflow){',
 "   return {code:'MONITOR',label:'COMPLETED · MONITORING — HISTORICAL BRIEF',",
 "    detail:'My Check is newer than the previous scan and Brief. That Brief is history, not a new publishing or rescan instruction. This personal check is not proof of publication. '+(nextEvidence||'Wait for new verified evidence.'),",
 "    color:'#86efac',border:'#16a34a',bg:'#052e16',button:'',buttonAction:''};",
 '  }',
 '  if(_canonicalJourney.current_scan_needs_brief){',
 "   return {code:'BRIEF_PENDING',label:'CURRENT SCAN SAVED · AWAIT CURRENT BRIEF',",
 "    detail:'A new scan exists, but the previous Brief belongs to older evidence. No second scan, GSC connection or publishing is required simply to review the pending evaluation.',",
 "    color:'#fbbf24',border:'#a16207',bg:'#2a1f05',button:'',buttonAction:''};",
 '  }',
 '  if(_canonicalJourney.historical_brief){',
 "   return {code:'MONITOR',label:'HISTORICAL BRIEF · RESEARCH OR MONITOR',",
 "    detail:'The old Brief remains in Proof & History, not a new publication order. Tracker and Growth remain available with scheduled scans off. '+(nextEvidence||''),",
 "    color:'#86efac',border:'#16a34a',bg:'#052e16',button:'',buttonAction:''};",
 '  }',
 ''
].join('\n');
function patch(source){
 if(typeof source!=='string'||source.length<5_000_000)throw Error('CANONICAL_TRACKER_SOURCE_REQUIRED');
 if(source.includes(marker))return {source,changed:false};
 function exact(s,n){if(source.split(s).length!==2)throw Error('AMBIGUOUS_'+n)}
 exact(current,'NEXT_ACTION');
 exact(stale,'SAFETY_STALE');
 const legacyCount=source.split(legacy).length-1;
 if(legacyCount>1)throw Error('AMBIGUOUS_LEGACY_MONITORING');
 if(legacyCount===1){
  exact(next,'CASE_STUDY_SCAN');
  let a=source.indexOf(legacy),e=source.indexOf(next,a);
  if(e<=a||e-a>4000)throw Error('LEGACY_STATE_BOUNDARY_CHANGED');
  source=source.slice(0,a)+source.slice(e);
 } else console.log('Existing main has no competing legacy monitoring override; preserve current branch structure.');
 source=source.replace(current,'\n'+shared+'\n'+current);
 source=source.replace(stale,guard+stale);
 const old='SCAN COMPLETE · OPEN THE BRIEF',count=source.split(old).length-1;
 if(count!==3)throw Error('EXPECTED_THREE_OLD_BRIEF_LABELS_'+count);
 source=source.split(old).join('CURRENT CYCLE · REVIEW VERIFIED BRIEF ACTIONS');
 return {source,changed:true};
}
if(require.main===module){
 const source=fs.readFileSync(file,'utf8'),result=patch(source);
 if(process.argv.includes('--write')){if(result.changed)fs.writeFileSync(file,result.source);
  console.log(result.changed?'CANONICAL_PAGE_JOURNEY_INTEGRATED':'CANONICAL_PAGE_JOURNEY_ALREADY_PRESENT');
 }else console.log(result.changed?'DRY_RUN_PAGE_JOURNEY_OK':'DRY_RUN_ALREADY_PRESENT');
}
module.exports={patch,marker};
