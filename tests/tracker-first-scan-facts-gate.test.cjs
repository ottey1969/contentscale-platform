'use strict';
// A page that was never scanned (no Brief) must not be blocked by client-wide Claims & Facts:
// es.contentscale.site/visibilidad-en-ia/ returned 409 on its first manual check (owner 2026-11-10).
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const s=fs.readFileSync(require('node:path').resolve(__dirname,'../src/index.js'),'utf8');
const a=s.indexOf('function _trackerNormalScanGate('),b=s.indexOf('// POST /api/tracker-client/:token/scan-all',a);
assert(a>0&&b>a,'gate boundary changed');
const ctx={Date,Number,String,JSON};vm.runInNewContext(s.slice(a,b)+'\nthis.gate=_trackerNormalScanGate;',ctx);
const facts='2026-11-01T00:00:00Z';
test('never-scanned page without a Brief may be scanned even when client facts exist',()=>{
  for(const brief_content of [null,undefined,'',{}]){
    const r=ctx.gate({url:'https://es.contentscale.site/visibilidad-en-ia/',claims_facts_updated_at:facts,brief_evaluated_at:null,brief_content});
    assert.equal(r.allowed,true,JSON.stringify(brief_content));
  }
});
test('page with a Brief older than the facts stays locked',()=>{
  const r=ctx.gate({url:'https://x.example/a',claims_facts_updated_at:facts,brief_evaluated_at:'2026-10-01T00:00:00Z',brief_content:{h1:'x'}});
  assert.equal(r.allowed,false);assert.match(r.reason,/Claims & Facts are newer/);
});
test('legacy Brief without an evaluation date stays locked',()=>{
  const r=ctx.gate({url:'https://x.example/a',claims_facts_updated_at:facts,brief_evaluated_at:null,brief_content:'{"h1":"x"}'});
  assert.equal(r.allowed,false);
});
test('Brief newer than the facts is not blocked by the facts rule',()=>{
  const r=ctx.gate({url:'https://x.example/a',claims_facts_updated_at:facts,brief_evaluated_at:'2026-11-05T00:00:00Z',brief_content:{h1:'x'}});
  assert.equal(r.allowed,true);
});
