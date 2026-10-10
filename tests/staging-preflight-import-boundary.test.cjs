'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const preflight=fs.readFileSync(path.join(root,'src/staging/preflight-server.cjs'),'utf8');
const entry=fs.readFileSync(path.join(root,'index.cjs'),'utf8');
test('preflight must never import the core app, scanner, or network',()=>{
 assert.doesNotMatch(preflight,/require\s*\(\s*['"](?:\.\.\/index(?:\.js)?|\.\.?\/scanner|\.\.?\/network|\.\.?\/index\.cjs)/);
 assert.doesNotMatch(preflight,/\bcreateAllTables\s*\(/);
 assert.doesNotMatch(preflight,/\b(?:setInterval|setTimeout)\s*\(/);
});
test('preflight has only read-only intended endpoints',()=>{
 assert.match(preflight,/__staging\/health/);
 assert.match(preflight,/__staging\/tracker\/readiness/);
 assert.match(preflight,/req\.method\s*!==\s*'GET'/);
 assert.match(preflight,/READ ONLY/);
});
test('staging start route references only dedicated preflight',()=>{
 assert.match(entry,/CS_DEPLOYMENT_TIER\s*===\s*'staging'/);
 assert.match(entry,/require\('\.\/src\/staging\/preflight-server\.cjs'\)/);
});
