'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../index.cjs'),'utf8');
function launch(env){const calls=[],errs=[];const ctx={process:{env,exitCode:undefined},console:{error:(...a)=>errs.push(a.join(' '))},require(p){calls.push(p);if(p.includes('preflight'))return {main:async()=>({ok:true})};return {};}};vm.runInNewContext(src,ctx);return {calls,ctx,errs};}
test('staging imports isolated preflight only',()=>assert.deepEqual(launch({CS_DEPLOYMENT_TIER:'staging'}).calls,['./src/staging/preflight-server.cjs']));
test('production imports original app only',()=>assert.deepEqual(launch({CS_DEPLOYMENT_TIER:'production'}).calls,['./src/index.js']));
test('ordinary legacy production keeps default app boot',()=>assert.deepEqual(launch({}).calls,['./src/index.js']));
test('missing tier with staging flag fails closed before full app import',()=>{
 const x=launch({CS_STAGING_SCAN_EXECUTION_ENABLED:'0'});assert.deepEqual(x.calls,[]);assert.equal(x.ctx.process.exitCode,1);
});
test('wrong tier with tracker shadow flag fails closed',()=>{
 const x=launch({CS_DEPLOYMENT_TIER:'production',CS_TRACKER_WORKFLOW_SHADOW:'1'});assert.deepEqual(x.calls,[]);assert.equal(x.ctx.process.exitCode,1);
});
