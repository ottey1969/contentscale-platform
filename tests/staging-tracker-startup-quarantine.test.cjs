'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const file=process.env.STARTUP_QUARANTINE_CANDIDATE||'/tmp/contentscale-staging-startup-quarantine.js';
const src=fs.readFileSync(file,'utf8');
const root=fs.readFileSync('src/index.js','utf8');
const fence="require('./staging/safety-gate.cjs').assertAppBootEnvironment(process.env);";
const marker="const _csStagingStartupQuarantine = process.env.CS_DEPLOYMENT_TIER === 'staging';";
assert(src.startsWith(fence+'\n'));
assert(src.includes(marker));
function quarantine(tier){return tier==='staging';}
function inspect(line,regex){
 const matches=[...src.matchAll(regex)];
 assert.equal(matches.length,1,'Unexpected quarantine site count: '+line);
 return matches[0][0];
}
test('first-statement staging boot fence survives and quarantine depends on exact tier',()=>{
 assert.equal(src.split('\n')[0],fence);
 assert.equal(src.slice(0,src.indexOf(marker)).includes(fence),true);
 assert.equal(quarantine('staging'),true);assert.equal(quarantine('production'),false);
 assert.equal(quarantine(''),false);
});
test('Network module cannot import in quarantined staging; unchanged outside it',()=>{
 const statement=inspect('network',/if \(!_csStagingStartupQuarantine\) _networkModule = require\('\.\/network\/register-network'\);/g);
 for(const [tier,expected] of [['staging',0],['production',1],['',1]]){
  let calls=0;
  const ctx={_csStagingStartupQuarantine:quarantine(tier),_networkModule:null,
   require(){calls++;return {registerNetwork(){}}}};
  vm.runInNewContext(statement,ctx,{timeout:1000});
  assert.equal(calls,expected);
 }
});
test('both schema migration timers are disabled only for staging tier',()=>{
 const calls=[...src.matchAll(/if \(!_csStagingStartupQuarantine\) setTimeout\(\(\) => createAllTables\(\)\.catch\(err => console\.error\('❌ Table error:', err\)\), (?:500|1000)\);/g)];
 assert.equal(calls.length,2);
 for(const [tier,expected] of [['staging',0],['production',2]]){
  let timers=0,dbCalls=0;
  const ctx={_csStagingStartupQuarantine:quarantine(tier),
   setTimeout(){timers++},createAllTables(){dbCalls++;return Promise.resolve()},console};
  for(const m of calls)vm.runInNewContext(m[0],ctx,{timeout:1000});
  assert.equal(timers,expected);assert.equal(dbCalls,0);
 }
});
test('both CEO follow-up timers are disabled in staging while production cadence is preserved',()=>{
 const block=inspect('followup',/if \(!_csStagingStartupQuarantine\) \{\nsetInterval\(\(\)=>_pqsSendDueCeoFollowups\(\)\.catch\(\(\)=>\{\}\),60\*60\*1000\);\nsetTimeout\(\(\)=>_pqsSendDueCeoFollowups\(\)\.catch\(\(\)=>\{\}\),90\*1000\);\n\}/g);
 for(const [tier,expected] of [['staging',0],['production',2]]){
  const registered=[];
  const ctx={_csStagingStartupQuarantine:quarantine(tier),
   setInterval(_f,ms){registered.push(['interval',ms])},
   setTimeout(_f,ms){registered.push(['timeout',ms])},
   _pqsSendDueCeoFollowups(){throw Error('No provider call allowed')}};
  vm.runInNewContext(block,ctx,{timeout:1000});
  assert.equal(registered.length,expected);
  if(expected)assert.deepEqual(registered,[['interval',3600000],['timeout',90000]]);
 }
});
test('quarantine is NOT a substitute for comprehensive full-app side-effect audit',()=>{
 assert(src.includes('assertAppBootEnvironment(process.env);'));
 assert(src.includes("async function _ensurePerfectRoofingCaseStudy("));
 assert(!src.includes('await _ensurePerfectRoofingCaseStudy('));
 assert(src.includes("const _csStagingStartupQuarantine"));
 assert.equal(root.startsWith(fence),true);
});
