'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const input=process.argv[2]||'src/index.js',output=process.argv[3]||'/tmp/contentscale-staging-boot-wave2.js';
let s=fs.readFileSync(input,'utf8');
const fence="require('./staging/safety-gate.cjs').assertAppBootEnvironment(process.env);";
const guard="_csStagingStartupQuarantine";
const marker="// CONTENTSCALE-STAGING-STARTUP-QUARANTINE-WAVE2: automatic jobs, migrations, and provider calls.";
assert(s.startsWith(fence+'\n'));
assert(s.includes("const "+guard+" = process.env.CS_DEPLOYMENT_TIER === 'staging';"));
if(s.includes(marker)){
 fs.writeFileSync(output,s);
 console.log(JSON.stringify({audit:'staging_startup_wave2',result:'already_patched'}));process.exit(0);
}
function once(before,after,label){const x=s.split(before);assert.equal(x.length,2,'Source moved or duplicate: '+label);s=x.join(after);}
once("const "+guard+" = process.env.CS_DEPLOYMENT_TIER === 'staging';\n",
     "const "+guard+" = process.env.CS_DEPLOYMENT_TIER === 'staging';\n"+marker+'\n','wave2 marker');
const gate='if (!'+guard+') ';
once('(async function ensureMetaIntelColumns() {',gate+'(async function ensureMetaIntelColumns() {','metadata DDL IIFE');
once('setTimeout(function() { migrateTrackerPageProfiles(); }, 5000);',
     gate+'setTimeout(function() { migrateTrackerPageProfiles(); }, 5000);','legacy profile migration');
once('await detectBestGeminiModel(process.env.GEMINI_KEY_LEADCRAWLER);',
     gate+'await detectBestGeminiModel(process.env.GEMINI_KEY_LEADCRAWLER);','Gemini model detection');
{
 const re=/\/\/ Recover any jobs stuck in 'researching' from previous server session\r?\n[ \t]*if \(pool && dbConnected\) \{/g;
 const matches=[...s.matchAll(re)];
 assert.equal(matches.length,1,'Missing or ambiguous research job recovery path');
 s=s.replace(re,match=>match.replace('if (pool && dbConnected) {',
   'if (pool && dbConnected && !'+guard+') {'));
}
once('// On server restart: resume any interrupted jobs\nsetTimeout(async () => {',
     '// On server restart: resume any interrupted jobs\n'+gate+'setTimeout(async () => {',
     'batch job resume');
{
 const needle="console.log('[otto] Skipping session migrations";
 const at=s.indexOf(needle);assert(at>=0&&s.indexOf(needle,at+1)<0,'Otto marker must be unique');
 const opener=s.lastIndexOf('(async () => {',at);
 assert(opener>=0&&at-opener<250,'Otto startup IIFE moved');
 s=s.slice(0,opener)+gate+s.slice(opener);
}
{
 const needle='// SAFETY: on boot, fail any bulk jobs stuck mid-run so they cannot resume a runaway loop';
 const at=s.indexOf(needle);assert(at>=0&&s.indexOf(needle,at+1)<0,'Bulk marker must be unique');
 const opener=s.indexOf('(async () => { try { if (pool)',at);
 assert(opener>at&&opener-at<350,'Bulk startup IIFE moved');
 s=s.slice(0,opener)+gate+s.slice(opener);
}
once("if (process.env.ENABLE_BULK_WORKER === '1') {",
     "if (!"+guard+" && process.env.ENABLE_BULK_WORKER === '1') {",
     'periodic bulk worker');
once("function _ciStartWorkers(){",
     "function _ciStartWorkers(){\nif("+guard+")return;",
     'contact import/verification workers');
once("function startTrackerScheduler() {",
     "function startTrackerScheduler() {\nif("+guard+")return;",
     'Tracker scanning scheduler');
once("setInterval(autoCloseSessions, 30 * 60 * 1000);",
     gate+"{\nsetInterval(autoCloseSessions, 30 * 60 * 1000);",
     'Boost DB close interval');
once("setTimeout(autoCloseSessions, 5000);",
     "setTimeout(autoCloseSessions, 5000);\n}",
     'Boost DB close initial timer');
assert(s.startsWith(fence+'\n'),'Full app boot safety fence must not move');
fs.writeFileSync(output,s);
console.log(JSON.stringify({audit:'staging_startup_wave2',result:'candidate_built',guarded_features:11,full_app_boot_allowed:false}));
