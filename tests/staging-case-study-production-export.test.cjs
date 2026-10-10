'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const script=path.resolve(__dirname,'../scripts/prepare-case-study-production-artifact.cjs');
const canonical=path.resolve(__dirname,'../src/index.js');
test('release export removes only the staging-only require and retains fail-closed tier check',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'contentscale-release-'));
 try{
  const dest=path.join(folder,'index.js');
  const before=fs.readFileSync(canonical);
  const p=spawnSync(process.execPath,[script,canonical,dest],{encoding:'utf8',timeout:15000});
  assert.equal(p.status,0,(p.stderr||'')+' '+(p.stdout||''));
  const out=fs.readFileSync(dest,'utf8');
  const fence="if (process.env.CS_DEPLOYMENT_TIER === 'staging') throw new Error('RELEASE BLOCKED: production artifact cannot boot as staging');";
  assert(out.startsWith(fence+'\n'));
  assert(!out.includes("require('./staging/safety-gate.cjs')"));
  assert(out.includes('case_study_prior_brief_archived'));
  assert(out.includes('CASE STUDY ACTIVE · FIRST MANUAL SCAN'));
  assert(out.includes('CASE STUDY ACTIVE · PREPARE FIRST MANUAL SCAN'));
  assert.deepEqual(fs.readFileSync(canonical),before,'Canonical staging candidate must not be mutated by release export');
  vm.runInNewContext(fence,{process:{env:{CS_DEPLOYMENT_TIER:'production'}}});
  assert.throws(()=>vm.runInNewContext(fence,{process:{env:{CS_DEPLOYMENT_TIER:'staging'}}}),/cannot boot as staging/);
  const syntax=spawnSync(process.execPath,['--check',dest],{encoding:'utf8',timeout:15000});
  assert.equal(syntax.status,0,syntax.stderr);
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test('release exporter refuses overwriting its own canonical source',()=>{
 const before=fs.readFileSync(canonical);
 const p=spawnSync(process.execPath,[script,canonical,canonical],{encoding:'utf8',timeout:15000});
 assert.notEqual(p.status,0);
 assert.match(p.stderr,/source and output must differ/);
 assert.deepEqual(fs.readFileSync(canonical),before);
});
