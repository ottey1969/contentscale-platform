'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {assertPreflightEnvironment,assertAppBootEnvironment}=require('../src/staging/safety-gate.cjs');
const base=()=>({
 CS_DEPLOYMENT_TIER:'staging',
 CS_TRACKER_WORKFLOW_SHADOW:'1',CS_TRACKER_WORKFLOW_READONLY_GET:'1',
 CS_STAGING_SCAN_EXECUTION_ENABLED:'0',ENABLE_TRACKER_SCHEDULER:'0',
 CS_STAGING_ISOLATED_DB_CONFIRMED:'0',CS_STAGING_SIDE_EFFECTS_DISABLED:'0',
 DATABASE_URL:'postgresql://test:test@ep-unit-test.neon.tech/neondb?sslmode=require'
});
test('valid isolated staging preflight is accepted without enabling full app',()=>{
 assert.equal(assertPreflightEnvironment(base()).database,'neondb');
 assert.throws(()=>assertAppBootEnvironment(base()),/STAGING BLOCKED/);
});
test('staging cannot boot with scheduler enabled',()=>{
 const e=base();e.ENABLE_TRACKER_SCHEDULER='1';
 assert.throws(()=>assertPreflightEnvironment(e),/ENABLE_TRACKER_SCHEDULER/);
});
test('staging cannot boot when scan execution enabled',()=>{
 const e=base();e.CS_STAGING_SCAN_EXECUTION_ENABLED='1';
 assert.throws(()=>assertPreflightEnvironment(e),/CS_STAGING_SCAN_EXECUTION_ENABLED/);
});
test('staging cannot boot with AI or email secrets',()=>{
 for(const key of ['OPENAI_API_KEY','BREVO_API_KEY','SERPAPI_KEY']){
  const e=base();e[key]='dummy';assert.throws(()=>assertPreflightEnvironment(e),/forbidden provider secret/);
 }
});
test('staging cannot point to production public URL',()=>{
 const e=base();e.APP_URL='https://app.contentscale.site';
 assert.throws(()=>assertPreflightEnvironment(e),/production URL/);
});
test('staging refuses different database host and disabled SSL',()=>{
 const e=base();e.DATABASE_URL='postgres://test:test@db.example.com/neondb?sslmode=require';
 assert.throws(()=>assertPreflightEnvironment(e),/Neon host required/);
 const f=base();f.DATABASE_URL='postgres://test:test@ep-unit-test.neon.tech/neondb?sslmode=disable';
 assert.throws(()=>assertPreflightEnvironment(f),/SSL required/);
});
test('preflight does not approve full app boot or synthetic writes',()=>{
 const e=base();e.CS_STAGING_APP_BOOT_APPROVED='1';
 assert.throws(()=>assertPreflightEnvironment(e),/app boot approval/);
});
