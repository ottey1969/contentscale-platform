'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').resolve(__dirname,'../src/index.js'),'utf8');
const start=source.indexOf('  // Look up client token for live wall broadcast');
const end=source.indexOf('  // Auto-detect locale from domain',start);
assert(start>0&&end>start&&end-start<2500,'Live-wall lookup source changed');
const fragment=source.slice(start,end);
async function lookup(clientId,enabled){
 const queries=[],pool={async query(sql){queries.push(sql);return {rows:[{token:'fake-test-token',live_wall_enabled:enabled}]};}};
 const ctx={page:{tracker_client_id:clientId,url:'https://es.contentscale.site/'},pool,console:{log(){},warn(){}}};
 const token=await vm.runInNewContext('(async function(){'+fragment+'return _clientToken;})()',ctx,{timeout:3000});
 return {token,queries};
}
test('bound client with live wall disabled never falls back across clients',async()=>{
 const r=await lookup(15,false);assert.equal(r.token,'');assert.equal(r.queries.length,1);
 assert.match(r.queries[0],/WHERE id=\$1/);
});
test('bound enabled client retains own token',async()=>{
 const r=await lookup(15,true);assert.equal(r.token,'fake-test-token');assert.equal(r.queries.length,1);
});
test('legacy unbound page preserves fallback',async()=>{
 const r=await lookup(null,false);assert.equal(r.queries.length,1);
 assert.match(r.queries[0],/WHERE domain=\$1/);
});
