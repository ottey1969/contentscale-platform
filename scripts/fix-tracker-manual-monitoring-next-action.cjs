'use strict';
/**
 * Idempotent, exact-match patch for the inline Tracker UI in canonical src/index.js.
 * Usage: node scripts/fix-tracker-manual-monitoring-next-action.cjs --write
 */
const fs=require('node:fs');
const path=require('node:path');
const file=path.resolve(__dirname,'../src/index.js');
const anchor='  // First manual scan of newly initialized Case Study, independent of scheduler.\n';
const marker='CONTENTSCALE-MANUAL-MONITORING-PRIORITY';
const guard="  // CONTENTSCALE-MANUAL-MONITORING-PRIORITY: after a completed My Check,\n  // old scans and Briefs stay HISTORY, not a fresh publication task.\n  // New scans, evaluations, HTML edits and publication confirmations after the\n  // check reopen the correct workflow; evidence checkpoints are checked above.\n  var manualDoneAt=Date.parse(p.manual_done_at||'')||0;\n  var completedManualCheck=bool(p.manual_done)&&manualDoneAt>0;\n  var postCheckWork=(scanAt>0&&scanAt>manualDoneAt)||\n    (evaluatedAt>0&&evaluatedAt>manualDoneAt)||\n    (htmlAt>0&&htmlAt>manualDoneAt)||\n    (confirmedAt>0&&confirmedAt>manualDoneAt)||\n    (publishedAt>0&&publishedAt>manualDoneAt);\n  if(completedManualCheck&&scanAt>0&&scanAt<=manualDoneAt&&\n      !postCheckWork&&implStatus!=='verifying'){\n    return {code:'MONITOR',label:'COMPLETED · MONITORING — HISTORICAL BRIEF',\n      detail:'Your completed My Check is newer than the last page scan and Brief. The saved Brief is historical, not a new requirement to publish HTML or run another scan. Keep existing AI/GSC evidence and Proof & History available. '+(nextEvidence||'Wait for the next evidence checkpoint.'),\n      color:'#86efac',border:'#16a34a',bg:'#052e16',button:'',buttonAction:''};\n  }\n";
function patch(content){
 if(typeof content!=='string')throw Error('TRACKER_SOURCE_REQUIRED');
 if(content.includes(marker))return {source:content,changed:false};
 if(content.split(anchor).length!==2)throw Error('TRACKER_NEXT_ACTION_ANCHOR_CHANGED');
 if(!content.includes('function _trackerNextActionState(p,isDone,lastCheckedRaw,nextEvidence)'))
  throw Error('TRACKER_ACTION_CLASSIFIER_MISSING');
 return {source:content.replace(anchor,guard+anchor),changed:true};
}
if(require.main===module){
 const before=fs.readFileSync(file,'utf8');
 const result=patch(before);
 if(process.argv.includes('--write')){
  if(result.changed)fs.writeFileSync(file,result.source,'utf8');
  console.log(result.changed?'PATCH_APPLIED':'PATCH_ALREADY_PRESENT');
 }else if(process.argv.includes('--verify')){
  if(!before.includes(marker))throw Error('TRACKER_MONITORING_GUARD_NOT_APPLIED');
  console.log('PASS: canonical Tracker monitoring guard installed');
 }else console.log('DRY_RUN: '+(result.changed?'PATCH_AVAILABLE':'PATCH_ALREADY_PRESENT'));
}
module.exports={patch,marker,guard};
