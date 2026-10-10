'use strict';
// Staging-only source hardening. Does NOT import or start ContentScale.
const fs=require('node:fs'),assert=require('node:assert/strict');
const source='src/index.js',s=fs.readFileSync(source,'utf8');
const old='async function startServer() {\n  // Auto-create boost_settings table if missing\n  if (pool) {';
const hardened='async function startServer() {\n  // Auto-create boost_settings table only outside isolated staging.\n  if (pool && !_csStagingStartupQuarantine) {';
const fence="require('./staging/safety-gate.cjs').assertAppBootEnvironment(process.env);";
assert(s.startsWith(fence),'Do not run on production source');
assert(s.includes("const _csStagingStartupQuarantine = process.env.CS_DEPLOYMENT_TIER === 'staging';"));
if(s.includes(hardened)){console.log('Staging boost_settings guard already present');process.exit(0);}
assert.equal(s.split(old).length,2,'Unexpected startServer layout; refusing');
fs.writeFileSync(source,s.replace(old,hardened));
console.log('Staging startup DDL guarded (production branch untouched)');
