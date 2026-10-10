'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const canonical=fs.readFileSync('src/index.js','utf8');
const legacy=fs.readFileSync('index.js','utf8');
test('both normal application entrypoints retain first-statement staging boot fences',()=>{
 assert(canonical.startsWith("require('./staging/safety-gate.cjs').assertAppBootEnvironment(process.env);"));
 assert(legacy.startsWith("require('./src/staging/safety-gate.cjs').assertAppBootEnvironment(process.env);"));
});
test('canonical full application refuses unapproved staging boot before side effects',()=>{
 const r=spawnSync(process.execPath,['src/index.js'],{
  env:{PATH:process.env.PATH||'',NODE_ENV:'test',CS_DEPLOYMENT_TIER:'staging'},
  timeout:5000,encoding:'utf8'
 });
 assert.notEqual(r.status,0,'Full staging app unexpectedly started');
 assert.match((r.stderr||'')+(r.stdout||''),/STAGING BLOCKED|RELEASE BLOCKED/);
});
test('legacy full application refuses unapproved staging boot before side effects',()=>{
 const r=spawnSync(process.execPath,['index.js'],{
  env:{PATH:process.env.PATH||'',NODE_ENV:'test',CS_DEPLOYMENT_TIER:'staging'},
  timeout:5000,encoding:'utf8'
 });
 assert.notEqual(r.status,0,'Legacy full staging app unexpectedly started');
 assert.match((r.stderr||'')+(r.stdout||''),/STAGING BLOCKED|RELEASE BLOCKED/);
});
