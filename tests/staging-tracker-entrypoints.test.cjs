'use strict';
// Inspect all current deployment entrypoints before any full-app boot is contemplated.
// Never require the application or any provider/client module.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const packageJson=JSON.parse(fs.readFileSync('package.json','utf8'));
const railway=JSON.parse(fs.readFileSync('railway.json','utf8'));
const dockerfile=fs.readFileSync('Dockerfile','utf8');
const rootShim=fs.readFileSync('index.cjs','utf8');
const server=fs.readFileSync('src/staging/tracker-readonly-server.cjs','utf8');
test('package start shim reaches first-statement fail-closed canonical guard',()=>{
 assert.equal(packageJson.scripts.start,'node index.cjs');
 assert.match(rootShim,/require\(['"]\.\/src\/index\.js['"]\)/);
 const src=fs.readFileSync('src/index.js','utf8');
 assert.equal(src.split('\n')[0],"require('./staging/safety-gate.cjs').assertAppBootEnvironment(process.env);");
 const r=spawnSync(process.execPath,['index.cjs'],{
  env:{NODE_ENV:'test',CS_DEPLOYMENT_TIER:'staging',PATH:process.env.PATH||''},
  timeout:5000,encoding:'utf8'
 });
 assert.notEqual(r.status,0);
 assert.match((r.stdout||'')+(r.stderr||''),/STAGING BLOCKED/);
});
test('the deployed diagnostic server has no eager import of main app or Network',()=>{
 assert.match(server,/assertPreflightEnvironment\(env\)/);
 assert.doesNotMatch(server,/require\(['"](?:\.\.\/)?(?:index|network\/register-network)/);
 assert.match(server,/reads?/i);
});
test('Dockerfile entrypoint conflict is reported as an unresolved release hazard, not silently fixed',()=>{
 assert.equal(railway.build.builder,'NIXPACKS');
 const match=dockerfile.match(/^\s*CMD\s+\[\s*"node"\s*,\s*"([^"]+)"\s*\]\s*$/m);
 assert(match,'Missing Dockerfile CMD for audit');
 const dockerStart=match[1];
 const present=fs.existsSync(dockerStart);
 console.log(JSON.stringify({audit:'staging_entrypoints',npm_start:packageJson.scripts.start,
  railway_builder:railway.build.builder,dockerfile_cmd:dockerStart,
  dockerfile_target_exists:present,
  dockerfile_release_review_required:!present,
  note:'Do not switch staging to Dockerfile; leave fail-closed application boot in place'}));
 // A broken inactive Dockerfile is a release risk, but not grounds to alter active Nixpacks.
 assert.equal(dockerStart,'src/server.js');
 assert.equal(present,false,'Dockerfile target changed; re-check startup inventory');
});
