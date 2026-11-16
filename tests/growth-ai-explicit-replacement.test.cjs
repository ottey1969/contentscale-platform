'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {registerGrowthAutomaticResearch}=require('../src/tracker-growth-automatic-routes.cjs');
const {parseAiAnswer}=require('../src/growth-free/ai-answers.cjs');
const URL='https://example.org/emergency-roof-repair-nj/';
const QUERY='How urgent is roof repair?';
const ANSWER='ANSWER:\nA leaking roof needs immediate attention when water is entering the building. Keep people safe, stop further damage where possible and call a professional roofer.\n\nRESOURCES:\nhttps://www.ready.gov/floods';
function fixture({growth=[],prewrite=true}={}){
 const routes={},saved=[];
 const app={get:(p,m,h)=>routes['GET '+p]=h,post:(p,m,h)=>routes['POST '+p]=h};
 const brief={id:55,keyword:'24 Hour Emergency Roof Repair NJ',language:'English',region:'us',created_at:new Date().toISOString(),
  brief_json:{customer_question:{text:QUERY},content_decision:{closest_existing_url:URL},
   prewrite_ai_answer_research:{query:'24 Hour Emergency Roof Repair NJ',ai_question:{text:QUERY},observations:[{engine:'chatgpt',validation_status:'valid'}]},
   ai_system_evidence:{chatgpt:{text:'Urgent roof leaks should be dealt with promptly to prevent more structural damage.'}}}};
 const pool={query:async(sql,args)=>({rows:sql.includes('FROM prewrite_briefs')&&prewrite?[brief]:[]})};
 registerGrowthAutomaticResearch(app,pool,(req,res,next)=>next(),{
  loadAiAnswers:async()=>growth,
  saveAiAnswer:async x=>saved.push(x),
  loadPageMarkets:async()=>({countries:['US'],language:'en'}),
  loadPrewriteMarket:async()=>null,
  loadSiteMarkets:async()=>null,
  fetchAiCited:async()=>({html:'<html><h1>Roof repair</h1><p>Safety matters.</p></html>'}),
  aiGapModel:null
 });
 const handler=routes['POST /api/tracker-client/:token/growth/ai-answer'];
 async function call(body){
  return await new Promise((resolve,reject)=>{
   const req={params:{token:'owner'},query:{page_id:'12',query:QUERY},growthTrackerClientId:9,
     growth:{can_edit:true,pages:[{id:12,url:URL,keyword:'24 Hour Emergency Roof Repair NJ'}]},body};
   const res={code:200,status(c){this.code=c;return this},set(){return this},json(out){resolve({code:this.code,out});return this}};
   Promise.resolve(handler(req,res)).catch(reject);
  });
 }
 return {call,saved};
}
test('Pre-Write answer is protected by default; explicit replacement works',async()=>{
 const f=fixture();
 const base={query:QUERY,engine:'chatgpt',text:ANSWER,page_url:URL};
 const blocked=await f.call(base);
 assert.equal(blocked.code,409);
 assert.equal(blocked.out.code,'EXISTING_AI_ANSWER_PROTECTED');
 assert.equal(f.saved.length,0);
 const allowed=await f.call({...base,replace_existing:true});
 assert.equal(allowed.code,200);assert.equal(f.saved.length,1);
});
test('Saved Growth observation cannot silently be replaced',async()=>{
 const old={engine:'claude',raw_text:ANSWER,created_at:new Date().toISOString()};
 const f=fixture({growth:[old],prewrite:false});
 const base={query:QUERY,engine:'claude',text:ANSWER,page_url:URL};
 assert.equal((await f.call(base)).code,409);
 assert.equal(f.saved.length,0);
 assert.equal((await f.call({...base,replace_existing:true})).code,200);
 assert.equal(f.saved.length,1);
});
test('Genuinely missing AI engine remains addable without replacement',async()=>{
 const f=fixture();
 const out=await f.call({query:QUERY,engine:'copilot',text:ANSWER,page_url:URL});
 assert.equal(out.code,200);assert.equal(f.saved.length,1);
});
test('UI separates all five Pre-Write writing answers from Growth source-verifiable citations',()=>{
 const ui=fs.readFileSync('public/growth-automatic-report-ui.js','utf8');
 assert.match(ui,/Writing answers available/);
 assert.match(ui,/Citation sources verifiable/);
 assert.match(ui,/verifiable=Number\(x\.verifiable\)\|\|0/);
 assert.match(ui,/updateChoices\(\)/);
 assert.match(ui,/existing\.has\(selector\.value\)&&!unlocked/);
 assert.match(ui,/replace_existing:unlocked&&existing\.has\(selector\.value\)/);
 assert.match(ui,/All five writing answers are present/);
});
