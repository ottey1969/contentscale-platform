'use strict';
// Surgical source-only guard. Not an application entrypoint; never launches jobs.
const fs=require('node:fs'),assert=require('node:assert/strict');
const file='src/index.js';let s=fs.readFileSync(file,'utf8');
const fence="require('./staging/safety-gate.cjs').assertAppBootEnvironment(process.env);";
assert(s.startsWith(fence),'Never apply on canonical production source');
assert(s.includes("const _csStagingStartupQuarantine = process.env.CS_DEPLOYMENT_TIER === 'staging';"));
const guards=[
 ['startCaseStudyMilestoneScheduler();','if (!_csStagingStartupQuarantine) startCaseStudyMilestoneScheduler();','case study milestone scheduler'],
 ['setTimeout(() => { if(pool) startTrackerScheduler(); }, 10000);','if (!_csStagingStartupQuarantine) setTimeout(() => { if(pool) startTrackerScheduler(); }, 10000);','tracker startup scheduler']
];
let changed=0;
for(const [oldLine,newLine,label] of guards){
 if(s.includes(newLine))continue;
 const occurrences=s.split(oldLine).length-1;
 assert.equal(occurrences,1,'Unexpected anchor count for '+label+' '+occurrences);
 s=s.replace(oldLine,newLine);changed++;
}
if(changed)fs.writeFileSync(file,s);
console.log(JSON.stringify({change:'staging_quarantine_schedulers',guarded:2,changed}));
