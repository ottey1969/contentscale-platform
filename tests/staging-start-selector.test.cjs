'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../index.cjs'),'utf8');
function launch(tier){const calls=[];const ctx={process:{env:{CS_DEPLOYMENT_TIER:tier},exitCode:undefined},console:{error:()=>{}},require(p){calls.push(p);if(p.includes('preflight'))return {main:async()=>({ok:true})};return {};}};vm.runInNewContext(src,ctx);return calls;}
test('staging npm start imports isolated preflight only',()=>assert.deepEqual(launch('staging'),['./src/staging/preflight-server.cjs']));
test('production npm start imports canonical app only',()=>assert.deepEqual(launch('production'),['./src/index.js']));
test('absent deployment tier preserves canonical entrypoint',()=>assert.deepEqual(launch(undefined),['./src/index.js']));
