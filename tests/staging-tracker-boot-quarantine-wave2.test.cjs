'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const file=process.env.STARTUP_WAVE2_CANDIDATE||'/tmp/contentscale-staging-boot-wave2.js';
const s=fs.readFileSync(file,'utf8'),g='_csStagingStartupQuarantine';
const occurrences=x=>s.split(x).length-1;
test('full app fail-closed fence preserved before any imports',()=>{
 assert(s.startsWith("require('./staging/safety-gate.cjs').assertAppBootEnvironment(process.env);\n"));
 assert(s.includes('// CONTENTSCALE-STAGING-STARTUP-QUARANTINE-WAVE2'));
 assert.equal(occurrences("const "+g+" = process.env.CS_DEPLOYMENT_TIER === 'staging';"),1);
});
test('automatic metadata and profile migrations and research-job writes suppressed',()=>{
 assert.equal(occurrences('if (!'+g+') (async function ensureMetaIntelColumns() {'),1);
 assert.equal(occurrences('if (!'+g+') setTimeout(function() { migrateTrackerPageProfiles(); }, 5000);'),1);
 assert.equal(occurrences("if (pool && dbConnected && !"+g+") {"),1);
});
test('Gemini call skipped in staging without changing nonstaging behavior',async()=>{
 const st='if (!'+g+') await detectBestGeminiModel(process.env.GEMINI_KEY_LEADCRAWLER);';
 assert.equal(occurrences(st),1);
 for(const [tier,want] of [['staging',0],['production',1]]){
  let n=0;const ctx={_csStagingStartupQuarantine:tier==='staging',
   process:{env:{GEMINI_KEY_LEADCRAWLER:'fake'}},async detectBestGeminiModel(){n++}};
  await vm.runInNewContext('(async()=>{'+st+'})()',ctx,{timeout:1200});
  assert.equal(n,want);
 }
});
test('resumed batch jobs, expired sessions and bulk job updates are all quarantined',()=>{
 assert.equal(occurrences('// On server restart: resume any interrupted jobs\nif (!'+g+') setTimeout(async () => {'),1);
 assert.equal(occurrences("if (!"+g+") (async () => {\nif (!pool) { console.log('[otto]"),1);
 assert.equal(occurrences('if (!'+g+') (async () => { try { if (pool)'),1);
 assert.equal(occurrences("if (!"+g+" && process.env.ENABLE_BULK_WORKER === '1') {\nsetInterval(bulkWorkerTick"),1);
});
test('contact-intelligence and Tracker background workers never start when quarantined',()=>{
 assert(s.includes('function _ciStartWorkers(){\nif('+g+')return;'));
 assert(s.includes('function startTrackerScheduler() {\nif('+g+')return;'));
});
test('Boost cleanup timer registrations are absent only in staging',()=>{
 const block='if (!'+g+') {\nsetInterval(autoCloseSessions, 30 * 60 * 1000);\nsetTimeout(autoCloseSessions, 5000);\n}';
 assert.equal(occurrences(block),1);
 for(const [tier,want] of [['staging',0],['production',2]]){
  let n=0;const ctx={_csStagingStartupQuarantine:tier==='staging',
   setInterval(){n++},setTimeout(){n++},autoCloseSessions(){}};
  vm.runInNewContext(block,ctx,{timeout:1200});
  assert.equal(n,want);
 }
});
test('earlier quarantine and legacy evidence/read guards remain in source',()=>{
 assert(s.includes("if (!"+g+") _networkModule = require('./network/register-network');"));
 assert(s.includes("if (!"+g+") setTimeout(() => createAllTables()"));
 assert(s.includes('async function _ensurePerfectRoofingCaseStudy('));
 assert(!s.includes('await _ensurePerfectRoofingCaseStudy('));
});
