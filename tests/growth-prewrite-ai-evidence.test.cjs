'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {loadPrewriteGrowthAnswers}=require('../src/growth-prewrite-ai-evidence.cjs');
const url='https://perfectroofingteam.com/24-hour-emergency-roof-repair-nj/';
const query='How urgent is roof repair?';
const NOW=Date.parse('2026-11-17T00:00:00Z');
const full='ANSWER:\nA leaking roof needs prompt inspection, especially when water enters an electrical area or the structure is damaged. Protect people first, move away from danger, and contact a qualified roofer for assessment.\n\nRESOURCES:\nhttps://www.ready.gov/floods';
function makeBrief({id=11,customer=query,region='us',page=url,created_at='2026-11-16T16:00:00Z',answer=full}={}){
 return {id,keyword:'24 Hour Emergency Roof Repair NJ',region,language:'English',created_at,brief_json:{
  keyword:'24 Hour Emergency Roof Repair NJ',
  customer_question:{text:customer},
  content_decision:{closest_existing_url:page},
  ai_system_evidence:{chatgpt:{checked:true,text:answer,checked_at:created_at,source:'manual'}},
  prewrite_ai_answer_research:{query:'24 Hour Emergency Roof Repair NJ',ai_question:{text:customer},market:region,language:'English',
   observations:[{engine:'chatgpt',checked:true,validation_status:'valid',observed_at:created_at}]}
 }};
}
function poolOf(rows){
 const calls=[];return {calls,query:async(sql,args)=>{calls.push({sql,args});return {rows}}};
}
test('imports a same-owner same-page exact customer-question answer with genuine RESOURCES',async()=>{
 const pool=poolOf([makeBrief()]);
 const found=await loadPrewriteGrowthAnswers(pool,{clientId:9,pageUrl:url,query,market:'US',language:'en',now:NOW});
 assert.equal(found.status,'MATCHED');assert.equal(found.brief_id,11);assert.equal(found.reused_count,1);
 assert.equal(found.rows[0].engine,'chatgpt');assert.equal(found.rows[0].parsed.sources.length,1);
 assert.equal(found.rows[0].parsed.own_site_cited,false);
 assert.equal(found.rows[0].origin,'PREWRITE_BRIEF');
 assert.equal(pool.calls[0].args[0],9);assert.match(pool.calls[0].sql,/WHERE client_id=\$1/);
});
test('wrong page, question or market can never import answers',async()=>{
 for(const props of [
  {pageUrl:'https://perfectroofingteam.com/another/'},
  {query:'How much is a new roof?'},
  {market:'nl'},
  {language:'es'}
 ]){
  const out=await loadPrewriteGrowthAnswers(poolOf([makeBrief()]),{clientId:9,pageUrl:url,query,market:'US',language:'en',now:NOW,...props});
  assert.equal(out.status,'NO_MATCH',JSON.stringify(props));assert.equal(out.rows.length,0);
 }
});
test('owner isolation is enforced by a tenant-scoped database query',async()=>{
 const pool=poolOf([]);
 const out=await loadPrewriteGrowthAnswers(pool,{clientId:28,pageUrl:url,query,market:'US',now:NOW});
 assert.equal(out.status,'NO_MATCH');assert.deepEqual(pool.calls[0].args,[28,60]);
});
test('plain editorial answers never become citation evidence by inventing a RESOURCES section',async()=>{
 const row=makeBrief({answer:'A roof leak should be addressed quickly. Stop water entering the property and ask a roofer to inspect the damage.'});
 const out=await loadPrewriteGrowthAnswers(poolOf([row]),{clientId:9,pageUrl:url,query,market:'US',now:NOW});
 assert.equal(out.status,'MATCHED');assert.equal(out.rows.length,0);
 assert.equal(out.items.find(x=>x.engine==='chatgpt').status,'EDITORIAL_ONLY');
});
test('old responses are visible but do not count in the current Growth comparison',async()=>{
 const old=makeBrief({created_at:'2026-10-01T00:00:00Z'});
 const out=await loadPrewriteGrowthAnswers(poolOf([old]),{clientId:9,pageUrl:url,query,market:'US',now:NOW});
 assert.equal(out.rows.length,0);assert.equal(out.items.find(x=>x.engine==='chatgpt').status,'OUTDATED');
});
test('Growth integration prefers fresh, explicit Growth answers and never leaks Pre-Write evidence to nonowners',()=>{
 const src=fs.readFileSync('src/tracker-growth-automatic-routes.cjs','utf8');
 assert.match(src,/if\(v.canEdit===true\)/);
 assert.match(src,/const already=new Set\(fresh.map\(x=>x.engine\)\)/);
 assert.match(src,/filter\(x=>!already.has\(x.engine\)\)/);
 assert.match(src,/const usable=\[\.\.\.fresh,\.\.\.reused\]/);
 assert.match(src,/prewrite_reuse:prewrite\?/);
 const ui=fs.readFileSync('public/growth-automatic-report-ui.js','utf8');
 assert.match(ui,/growthPrewriteReuse/);assert.match(ui,/Pre-Write is writing research/);
});

test('live Growth ai-check route reuses eligible Pre-Write answer for owner, but never for public viewer',async()=>{
 const {registerGrowthAutomaticResearch}=require('../src/tracker-growth-automatic-routes.cjs');
 const routes={};
 const app={get:(p,mw,h)=>{routes[p]=h},post:()=>{}};
 const db={query:async(sql,args)=>({rows:sql.includes('FROM prewrite_briefs')?[makeBrief()]:[]})};
 registerGrowthAutomaticResearch(app,db,(req,res,next)=>next(),{
  loadAiAnswers:async()=>[],
  loadPageMarkets:async()=>({countries:['US'],language:'en'}),
  loadPrewriteMarket:async()=>null,
  loadSiteMarkets:async()=>null,
  fetchAiCited:async()=>({html:'<html><h1>Emergency roof safety</h1><p>Inspect damage before repairs.</p></html>'}),
  aiGapModel:null
 });
 const handler=routes['/api/tracker-client/:token/growth/ai-check'];
 async function invoke(owner){
  return await new Promise((resolve,reject)=>{
   const req={query:{page_id:'12',query},growthTrackerClientId:9,
    growth:{can_edit:owner,pages:[{id:12,url,keyword:'24 Hour Emergency Roof Repair NJ'}]}};
   const res={statusCode:200,status(x){this.statusCode=x;return this},set(){return this},json(x){resolve({status:this.statusCode,body:x});return this}};
   Promise.resolve(handler(req,res)).catch(reject);
  });
 }
 const owner=await invoke(true);
 assert.equal(owner.status,200);
 assert.equal(owner.body.ai_check.summary.checked,1);
 assert.equal(owner.body.ai_check.prewrite_reuse.brief_id,11);
 assert.equal(owner.body.ai_check.prewrite_reuse.reused_count,1);
 const viewer=await invoke(false);
 assert.equal(viewer.status,200);
 assert.equal(viewer.body.ai_check.summary.checked,0);
 assert.equal(viewer.body.ai_check.prewrite_reuse,null);
});

test('AI controls are repopulated after both saved-report restore and a fresh Growth research run',()=>{
 const ui=fs.readFileSync('public/growth-automatic-report-ui.js','utf8');
 assert.match(ui,/last=result;render\(result\);pointHandoff\(result\);showAiEarly\(\)/);
 assert.match(ui,/last=saved\.report;render\(saved\.report\);pointHandoff\(saved\.report\);showAiEarly\(\)/);
 assert.match(ui,/if\(!j\.success\|\|!j\.ai_check\|\|early\.childNodes\.length\)return/);
});
