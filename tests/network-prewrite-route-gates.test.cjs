'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {registerNetwork}=require('../src/register-network.js');
const KEYWORD='seo content optimalisatie';
const ANSWER='SEO content optimalisatie begins by checking what the visitor expects, auditing existing content, using verified sources, and improving relevant paragraphs, internal links and accuracy. Rank and citations are not guaranteed.';
function brief(valid=true){
 const ai_system_evidence={};
 for(const k of ['google_aio','chatgpt','perplexity','claude','copilot']){
  ai_system_evidence[k]={checked:true,text:valid||k!=='claude'?ANSWER:'',...(k==='google_aio'?{google_source:'gemini'}:{})};
 }
 return {ai_system_evidence,prewrite_ai_answer_research:{query:KEYWORD}};
}
function fixture({valid=true,owner=false,outline=5}={}){
 const b=brief(valid),hash=crypto.createHash('sha256').update(JSON.stringify(b)).digest('hex');
 const briefRow={id:9,keyword:KEYWORD,working_title:'SEO content optimalisatie',language:'nl-NL',region:'NL',brief_json:b};
 const approval={id:2,prewrite_brief_id:9,brief_hash:hash,brief_snapshot:b,
  approved_contract:{planned_h2s:Array.from({length:outline},(_,i)=>'Verified H2 '+(i+1)),minimum_useful_words:1200},approved_at:'2026-11-07T00:00:00Z'};
 const writes=[];
 const pool={async query(sql){const q=String(sql);if(/^\s*(INSERT|UPDATE|DELETE)/i.test(q))writes.push(q);
  if(q.includes('FROM prewrite_briefs WHERE id=$1 LIMIT 1'))return {rows:[briefRow]};
  if(q.includes('FROM network_prewrite_approvals WHERE'))return {rows:[approval]};
  if(q.includes('FROM network_websites WHERE id=$1 LIMIT 1'))return {rows:owner?[{id:1,domain:'example.com',brand_name:'Example',primary_niche:'Marketing'}]:[]};
  return {rows:[]}}};
 const routes=new Map(),app={};
 for(const method of ['get','post','patch','delete'])app[method]=(path,...fns)=>routes.set(method.toUpperCase()+' '+path,fns[fns.length-1]);
 registerNetwork({app,pool,verifyAdmin:(req,res,next)=>next(),asyncHandler:fn=>fn});
 const call=async (path,body)=>{
  const handler=routes.get('POST '+path);assert.ok(handler,'route registered '+path);
  const res={statusCode:200,status(n){this.statusCode=n;return this},json(v){this.body=v;return this},type(){return this},send(v){this.body=v;return this}};
  await handler({body,params:{},query:{}},res);return res;
 };
 return {call,writes};
}
test('real Network standalone route rejects an old checked:true invalid AI answer before any writing',async()=>{
 const old=process.env.NETWORK_ENABLED;process.env.NETWORK_ENABLED='true';
 try{const f=fixture({valid:false,owner:true});const r=await f.call('/api/network/admin/standalone-content/generate',{prewrite_brief_id:9,title:KEYWORD,owner_website_id:1});
 assert.equal(r.statusCode,409);assert.match(r.body.error,/AI evidence is incomplete or invalid/i);assert.equal(f.writes.length,0)}
 finally{if(old===undefined)delete process.env.NETWORK_ENABLED;else process.env.NETWORK_ENABLED=old}
});
test('real standalone route requires owner website to verify internal links before writing',async()=>{
 const old=process.env.NETWORK_ENABLED;process.env.NETWORK_ENABLED='true';
 try{const f=fixture({owner:false});const r=await f.call('/api/network/admin/standalone-content/generate',{prewrite_brief_id:9,title:KEYWORD,owner_website_id:1});
 assert.equal(r.statusCode,409);assert.equal(r.body.stage,'website');assert.equal(f.writes.length,0)}
 finally{if(old===undefined)delete process.env.NETWORK_ENABLED;else process.env.NETWORK_ENABLED=old}
});
test('real standalone route refuses a Brief outline too short for the publication standard',async()=>{
 const old=process.env.NETWORK_ENABLED;process.env.NETWORK_ENABLED='true';
 try{const f=fixture({owner:true,outline:3});const r=await f.call('/api/network/admin/standalone-content/generate',{prewrite_brief_id:9,title:KEYWORD,owner_website_id:1});
 assert.equal(r.statusCode,409);assert.equal(r.body.stage,'outline');assert.equal(f.writes.length,0)}
 finally{if(old===undefined)delete process.env.NETWORK_ENABLED;else process.env.NETWORK_ENABLED=old}
});
test('Network Google capture requires explicit AI Overview/Gemini provenance before DB writes',async()=>{
 const f=fixture();const r=await f.call('/api/network/admin/publications/:placementId/ai-evidence',{engine:'google_aio',evidence:ANSWER});
 // Missing placement is checked only after source provenance; no DB changes.
 assert.equal(r.statusCode,422);assert.match(r.body.error,/Choose the actual Google source/);assert.equal(f.writes.length,0);
});
