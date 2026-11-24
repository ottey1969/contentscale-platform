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

test('only requested growth and SEO audit page routes receive noindex',()=>{
 const express=require('express');
 const request=require('supertest');
 const entry=fs.readFileSync('index.cjs','utf8');
 const start=entry.indexOf('  // BEGIN page indexing policy');
 const end=entry.indexOf('  // END page indexing policy');
 assert.ok(start>=0 && end>start,'production indexing middleware must exist');
 const app=express();
 new Function(entry.slice(start,end)).call(app);
 app.use((req,res)=>res.send('ok'));
 return Promise.all([
 ['/seo-audit','noindex, follow'],['/seo-audit/?x=1','noindex, follow'],
 ['/track/example/growth','noindex, follow'],['/track/another/growth/?x=1','noindex, follow'],
 ['/track/example',undefined],['/track/example/growth/report',undefined],
 ['/api/gsc/reports',undefined],['/growth',undefined],['/seo-audit-other',undefined]
 ].map(async ([url,expected])=>{
  const res=await request(app).get(url);
  assert.equal(res.status,200);
  assert.equal(res.headers['x-robots-tag'],expected,url);
 }));
});
