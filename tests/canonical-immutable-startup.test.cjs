'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs');
const {prepare}=require('../scripts/prepare-canonical-production.cjs');
test('server boot does not rewrite canonical source',()=>{
 const entry=fs.readFileSync('index.cjs','utf8');
 assert.doesNotMatch(entry,/writeFileSync|fix-audit20-inline-label|fix-ceo-domain-validation|repair-canonical-browser/);
 assert.match(entry,/CANONICAL_BUILD_ARTIFACT_REQUIRED/);
 const docker=fs.readFileSync('Dockerfile','utf8');
 assert.match(docker,/RUN node scripts\/prepare-canonical-production\.cjs/);
});
test('one-time compatibility build produces the same artifact twice',()=>{
 const source=fs.readFileSync('src/index.js','utf8');
 const compiled=prepare(source);
 assert(compiled.includes("const _canonicalBrowserManager = require('./browser-manager.cjs')"));
 assert(compiled.includes('function isCeoDomainInput(value)'));
 assert(compiled.includes("BROWSER_UNAVAILABLE"));
 assert.equal(compiled,prepare(compiled));
});
