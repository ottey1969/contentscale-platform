'use strict';
// Remove the legacy per-card My Check override. The ONE canonical lifecycle
// contract now lives in tracker-page-journey.cjs and drives all Tracker pages.
const fs=require('node:fs');
const path=require('node:path');
const file=path.join(__dirname,'../src/index.js');
let source=fs.readFileSync(file,'utf8');
if(!source.includes('CONTENTSCALE_CANONICAL_GROWTH_JOURNEY_V1'))throw Error('CANONICAL_TRACKER_STATE_MODULE_NOT_INTEGRATED');
const marker='CONTENTSCALE_SHARED_MONITORING_GUARD_V1';
if(source.includes(marker)){console.log('Canonical My Check lifecycle already consolidated');process.exit(0)}
const start=source.indexOf('  // CONTENTSCALE-MANUAL-MONITORING-PRIORITY:');
const end=source.indexOf('  // First manual scan of newly initialized Case Study, independent of scheduler.',start);
if(start<0||end<start||end-start>4000)throw Error('LEGACY_MONITORING_STATE_NOT_RECOGNIZED');
const replacement=[
 '  // '+marker+': My Check is a personal closure, never publication proof.',
 '  // Fresh scan, edited HTML, explicit publication and evidence milestones reopen work.',
 '  // One status contract applies to existing and future Tracker page records.',
 '  var _completedJourney=window.ContentScaleTrackerJourney.inspect(p,lastCheckedRaw);',
 '  if(_completedJourney.personal_completion_controls_workflow){',
 '    return {code:\'MONITOR\',label:\'COMPLETED · MONITORING — HISTORICAL BRIEF\',',
 '      detail:\'Your My Check is newer than the previous scan and Brief. The old Brief stays in Proof & History, not a new requirement to publish HTML or rescan. My Check itself does not verify publication. \'+(nextEvidence||\'Wait for verified evidence.\'),',
 '      color:\'#86efac\',border:\'#16a34a\',bg:\'#052e16\',button:\'\',buttonAction:\'\'};',
 '  }',
 ''
].join('\n');
source=source.slice(0,start)+replacement+source.slice(end);
fs.writeFileSync(file,source,'utf8');
console.log('PASS: legacy My Check override removed; one canonical Tracker state evaluator active.');
