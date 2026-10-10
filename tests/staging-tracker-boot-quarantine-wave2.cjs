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
once("// Recover any jobs stuck in 'researching' from previous server session\nif (pool && dbConnected) {",
     "// Recover any jobs stuck in 'researching' from previous server session\nif (pool && dbConnected && !"+guard+") {",
     'research job status recovery');
once('// On server restart: resume any interrupted jobs\nsetTimeout(async () => {',
     '// On server restart: resume any interrupted jobs\n'+gate+'setTimeout(async () => {',
     'batch job resume');
once("(async () => {\nif (!pool) { console.log('[otto] Skipping session migrations",
     gate+"(async () => {\nif (!pool) { console.log('[otto] Skipping session migrations",
     'Otto automatic migrations');
once('// SAFETY: on boot, fail any bulk jobs stuck mid-run so they cannot resume a runaway loop\n(async () => { try { if (pool)',
     '// SAFETY: on boot, fail any bulk jobs stuck mid-run so they cannot resume a runaway loop\n'+gate+'(async () => { try { if (pool)',
     'bulk automatic DB status repair');
once("if (process.env.ENABLE_BULK_WORKER === '1') {\nsetInterval(bulkWorkerTick",
     "if (!"+guard+" && process.env.ENABLE_BULK_WORKER === '1') {\nsetInterval(bulkWorkerTick",
     'periodic bulk worker');
once("function _ciStartWorkers(){\nif(_ciWorkersStarted)return;",
     "function _ciStartWorkers(){\nif("+guard+")return;\nif(_ciWorkersStarted)return;",
     'contact import/verification workers');
once("function startTrackerScheduler() {\nif(_trackerSchedulerTimer) return;",
     "function startTrackerScheduler() {\nif("+guard+")return;\nif(_trackerSchedulerTimer) return;",
     'Tracker scanning scheduler');
once("setInterval(autoCloseSessions, 30 * 60 * 1000);\nsetTimeout(autoCloseSessions, 5000);",
     gate+"{\nsetInterval(autoCloseSessions, 30 * 60 * 1000);\nsetTimeout(autoCloseSessions, 5000);\n}",
     'Boost auto-close DB timers');
assert(s.startsWith(fence+'\n'),'Full app boot safety fence must not move');
fs.writeFileSync(output,s);
console.log(JSON.stringify({audit:'staging_startup_wave2',result:'candidate_built',guarded_features:11,full_app_boot_allowed:false}));
