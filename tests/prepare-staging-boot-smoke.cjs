'use strict';
// Only produces a local throwaway app-boot file for disposable GitHub CI.
// Never alters the canonical source, boot fence, Railway service or database.
const fs=require('node:fs'),path=require('node:path');
const original=path.resolve(__dirname,'../src/index.js');
const output=path.resolve(__dirname,'../src/__ci_staging_boot_smoke__.js');
if(fs.existsSync(output))throw Error('STOP: test-only file already exists');
const src=fs.readFileSync(original,'utf8');
const fence="require('./staging/safety-gate.cjs').assertAppBootEnvironment(process.env);";
if(!src.startsWith(fence+'\n')||!src.includes("const _csStagingStartupQuarantine = process.env.CS_DEPLOYMENT_TIER === 'staging';"))
 throw Error('STOP: full app staging quarantine not verified');
if(Buffer.byteLength(src)<6000000)throw Error('STOP: incomplete canonical app');
fs.writeFileSync(output,'// DISPOSABLE CI SMOKE ONLY: boot fence bypassed in this untracked copy.\n'+src.slice(fence.length+1));
console.log('Prepared untracked staging smoke source; canonical fence remains untouched');
