'use strict';
// Reproducible *build-time* migration of legacy canonical fixes.
// Build the artifact once in the image. Do not mutate source on server boot.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {patch:fixAudit}=require('./fix-audit20-inline-label.cjs');
const {patch:fixDomain}=require('./fix-ceo-domain-validation.cjs');
const {patch:fixForms}=require('./fix-ceo-form-validation.cjs');
const {patch:fixBrowser}=require('./repair-canonical-browser.cjs');
const BROKEN=/Yes — I\\*'m interested in the 20-Page Audit/;
function prepare(source){
 let built=String(source);
 if(BROKEN.test(built))built=fixAudit(built);
 built=fixDomain(built);
 built=fixForms(built);
 built=fixBrowser(built);
 if(BROKEN.test(built)||!built.includes("const _canonicalBrowserManager = require('./browser-manager.cjs')")||
   !built.includes('function isCeoDomainInput(value)'))
   throw Error('CANONICAL_BUILD_VALIDATION_FAILED');
 return built;
}
if(require.main===module){
 const sourceFile=path.join(__dirname,'..','src','index.js');
 const source=fs.readFileSync(sourceFile,'utf8');
 const built=prepare(source);
 if(prepare(built)!==built)throw Error('CANONICAL_BUILD_NOT_IDEMPOTENT');
 const sum=s=>crypto.createHash('sha256').update(s).digest('hex');
 if(process.argv.includes('--verify-only')){
  console.log('[build] canonical patches verified, sourceSha256='+sum(source)+', buildSha256='+sum(built));
 }else{
  if(source!==built)fs.writeFileSync(sourceFile,built);
  console.log('[build] canonical ready, sourceSha256='+sum(source)+', buildSha256='+sum(built));
 }
}
module.exports={prepare};
