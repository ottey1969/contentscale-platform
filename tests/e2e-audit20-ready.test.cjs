'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const all=fs.readFileSync(path.resolve(__dirname,'../src/index.js'),'utf8');
const a=all.indexOf("app.post('/api/prospect-quick-scan/admin/:token/audit20-ready'");
const b=all.indexOf("\n\n// PROSPECT CTA",a);
assert(a>0&&b>a&&b-a<5000,'Canonical Audit20 ready route moved');
const handlerSource=all.slice(a,b);
async function invoke({interested=false,ready=false,missing=false}={}){
 const sent=[],queries=[],responses=[];
 const row={audit20_interested:interested,audit20_ready_at:ready?'2026-10-10T10:00:00Z':null,audit20_report_url:ready?'https://example.org/report':'',token:'test'};
 let handler;
 const pool={query:async(sql,args)=>{
  queries.push(sql);
  if(sql.includes('UPDATE prospect_quick_scans SET audit20_status')){
   assert(sql.includes('audit20_interested=TRUE'),'ready transition must check interest');
   assert(sql.includes('audit20_ready_at IS NULL'),'ready transition must be idempotent');
   return {rows:(!missing&&interested&&!ready)?[row]:[]};
  }
  if(sql.includes('SELECT audit20_interested'))return {rows:missing?[]:[row]};
  return {rows:[]};
 }};
 const ctx={app:{post:(_path,_admin,fn)=>handler=fn},requireAdmin:()=>{},pool,
  _pqsSendLocalized:async()=>{sent.push('email');return {sent:true}}};
 vm.runInNewContext(handlerSource,ctx,{timeout:4000});
 const res={status(n){this.code=n;return this},json(v){responses.push(v);return v}};
 await handler({params:{token:'test'},body:{report_url:'https://example.org/report'}},res);
 return {code:res.code||200,result:responses[0],emails:sent.length,queries};
}
test('Audit20 cannot be marked ready before prospect interest',async()=>{
 const r=await invoke({interested:false});
 assert.equal(r.code,409);assert.equal(r.emails,0);
});
test('repeat Audit20 ready does not re-send email',async()=>{
 const r=await invoke({interested:true,ready:true});
 assert.equal(r.code,200);assert.equal(r.result.already_ready,true);assert.equal(r.emails,0);
});
test('first eligible Audit20 ready writes and sends one notification',async()=>{
 const r=await invoke({interested:true});
 assert.equal(r.code,200);assert.equal(r.emails,1);
});
test('missing token never sends email',async()=>{
 const r=await invoke({missing:true});
 assert.equal(r.code,404);assert.equal(r.emails,0);
});
