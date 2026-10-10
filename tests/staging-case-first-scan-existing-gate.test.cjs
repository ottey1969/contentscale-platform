'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/index.js'),'utf8');
const start=source.indexOf('function _trackerNormalScanGate(');
const end=source.indexOf('\n// POST /api/tracker-client/:token/scan-all',start);
assert(start>=0&&end>start&&end-start<10000,'Unexpected canonical scan gate boundaries');
const ctx={};vm.runInNewContext(source.slice(start,end)+'\nglobalThis.gate=_trackerNormalScanGate;',ctx);
test('diagnostic: historical completed case study is currently blocked before cycle check',()=>{
 const x=ctx.gate({url:'https://example.test/',case_study_active:true,manual_done:true,brief_content:{outstanding_actions:2},brief_evaluated_at:'2026-08-18T10:00:00Z'});
 assert.equal(x.allowed,false);
 assert.match(x.reason,/Completed pages/);
});
