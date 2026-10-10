'use strict';
// Offline source transformation only. NEVER deploys, imports the app or touches a database.
// Produces a candidate release file after all isolated tests have passed.
const fs=require('node:fs'),path=require('node:path');
const source=path.resolve(process.argv[2]||'src/index.js');
const destination=path.resolve(process.argv[3]||'./case-study-release.review.js');
if(source===destination)throw Error('RELEASE BLOCKED: source and output must differ');
const s=fs.readFileSync(source,'utf8');
const stagingFence="require('./staging/safety-gate.cjs').assertAppBootEnvironment(process.env);";
const quarantine="const _csStagingStartupQuarantine = process.env.CS_DEPLOYMENT_TIER === 'staging';";
const knownStagingComment='// Defense in depth only. The first-statement full-app boot fence remains absolute.';
const stagingHeader=stagingFence+'\n'+knownStagingComment+'\n'+quarantine+'\n';
if(!s.startsWith(stagingHeader))throw Error('RELEASE BLOCKED: staging fence or quarantine marker drift');
if(Buffer.byteLength(s)<6000000)throw Error('RELEASE BLOCKED: incomplete canonical source');
for(const marker of [
 'CS-2026-10-10-STAGING-CANDIDATE-v568-FIRST-MANUAL-SCAN',
 'case_study_fresh_cycle_initialized',
 'CASE STUDY ACTIVE · FIRST MANUAL SCAN',
 'CASE STUDY ACTIVE · PREPARE FIRST MANUAL SCAN',
 'case_study_prior_brief_archived',
 "check_frequency='0',next_check_at=NULL",
 'previous_check_frequency:page.check_frequency',
 '_publishedAfterBaseline'
]){
 if(!s.includes(marker))throw Error('RELEASE BLOCKED: missing verified integration marker: '+marker);
}
if(s.split(stagingFence).length!==2)throw Error('RELEASE BLOCKED: unexpected staging fence count');
const productionFence="if (process.env.CS_DEPLOYMENT_TIER === 'staging') throw new Error('RELEASE BLOCKED: production artifact cannot boot as staging');";
const out=productionFence+'\n'+quarantine+'\n'+s.slice(stagingHeader.length);
if(out.includes(stagingFence)||out.includes("require('./staging/safety-gate.cjs')"))throw Error('RELEASE BLOCKED: staging-only import remains');
if(out.length<6000000||!out.startsWith(productionFence+'\n'+quarantine))throw Error('RELEASE BLOCKED: unsafe release output');
if(!fs.existsSync(path.dirname(destination)))throw Error('RELEASE BLOCKED: output directory missing');
fs.writeFileSync(destination,out,{flag:'wx'});
console.log('REVIEW-ONLY release source built; no application boot or deployment; sha256 requires external verification');
