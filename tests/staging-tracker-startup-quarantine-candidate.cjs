'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const input=process.argv[2]||'src/index.js',output=process.argv[3]||'/tmp/contentscale-staging-startup-quarantine.js';
let s=fs.readFileSync(input,'utf8');
const fence="require('./staging/safety-gate.cjs').assertAppBootEnvironment(process.env);";
assert(s.startsWith(fence+'\n'),'Never modify an entrypoint without first-statement fail-closed fence');
const marker="const _csStagingStartupQuarantine = process.env.CS_DEPLOYMENT_TIER === 'staging';";
if(s.includes(marker)){
 assert(s.includes('if (!_csStagingStartupQuarantine) _networkModule = require('),'Network import quarantine missing');
 fs.writeFileSync(output,s);
 console.log(JSON.stringify({audit:'startup_quarantine_candidate',result:'already_patched',boot_fence_preserved:true}));
 process.exit(0);
}
function one(oldValue,newValue,name){
 const pieces=s.split(oldValue);
 assert.equal(pieces.length,2,'Unexpected canonical '+name+' anchor count: '+(pieces.length-1));
 s=pieces.join(newValue);
}
s=s.replace(fence+'\n',fence+'\n// Defense in depth only. The first-statement full-app boot fence remains absolute.\n'+marker+'\n');
one("_networkModule = require('./network/register-network');",
 "if (!_csStagingStartupQuarantine) _networkModule = require('./network/register-network');",
 'network import');
one("setTimeout(() => createAllTables().catch(err => console.error('❌ Table error:', err)), 500);",
 "if (!_csStagingStartupQuarantine) setTimeout(() => createAllTables().catch(err => console.error('❌ Table error:', err)), 500);",
 'reconnection schema migration');
one("setTimeout(() => createAllTables().catch(err => console.error('❌ Table error:', err)), 1000);",
 "if (!_csStagingStartupQuarantine) setTimeout(() => createAllTables().catch(err => console.error('❌ Table error:', err)), 1000);",
 'initial database schema migration');
const emailInterval="setInterval(()=>_pqsSendDueCeoFollowups().catch(()=>{}),60*60*1000);";
const emailDelay="setTimeout(()=>_pqsSendDueCeoFollowups().catch(()=>{}),90*1000);";
one(emailInterval+'\n'+emailDelay,
 "if (!_csStagingStartupQuarantine) {\n"+emailInterval+"\n"+emailDelay+"\n}",
 'scheduled CEO follow-up email sends');
assert(s.startsWith(fence+'\n'),'Initial fail-closed full-app fence moved');
assert.equal((s.match(/const _csStagingStartupQuarantine =/g)||[]).length,1);
fs.writeFileSync(output,s);
console.log(JSON.stringify({audit:'startup_quarantine_candidate',result:'candidate_built',guarded_calls:5,
 full_app_boot_still_blocked:true,production_behavior_changed:false}));
